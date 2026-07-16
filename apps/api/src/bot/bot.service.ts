import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import {
  CashDirection,
  CashIncomeBasis,
  ChatChannel,
  ClaimType,
  DocKind,
  OrderStatus,
  Prisma,
  Role,
  UserStatus,
} from '@prisma/client';
import { extname } from 'path';
import { ChatService } from '../chat/chat.service';
import {
  DOC_KIND_RU,
  DocumentsService,
  REQUIRED_ORDER_DOC_KINDS,
} from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SettlementsService } from '../settlements/settlements.service';

const STATUS_BUTTONS: { status: OrderStatus; label: string }[] = [
  { status: OrderStatus.ON_THE_WAY, label: 'В пути' },
  { status: OrderStatus.IN_PROGRESS, label: 'В работе' },
  { status: OrderStatus.DONE, label: 'Готов' },
  { status: OrderStatus.IN_PROGRESS_SD, label: 'В работе СД' },
];

const STATUS_LABELS: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.ON_THE_WAY]: 'В пути',
  [OrderStatus.IN_PROGRESS]: 'В работе',
  [OrderStatus.DONE]: 'Готов',
  [OrderStatus.IN_PROGRESS_SD]: 'В работе СД',
};

const DOC_KIND_TG: Record<DocKind, string> = {
  [DocKind.CONTRACT]: 'Договор',
  [DocKind.RECEIPT_SERVICE]: 'Чек за услугу',
  [DocKind.RECEIPT_PARTS]: 'Чек за комплектующие / расходы',
  [DocKind.PARTS_PHOTO]: 'Фото запчастей и комплектующих',
  [DocKind.RECEIPT_SD]: 'Сохранная расписка',
  [DocKind.AD_SCREEN]: 'Скрин рекламы',
  [DocKind.CASH_DOC]: 'Кассовый документ',
  [DocKind.OTHER]: 'Прочее',
};

const ALLOWED_TG_EXT = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
]);

type TgFrom = {
  id?: number;
  username?: string;
  first_name?: string;
};

type TgChat = { id?: number | string };

type TgPhotoSize = { file_id: string; file_unique_id?: string };

type TgDocument = {
  file_id: string;
  file_name?: string;
  mime_type?: string;
};

type TgMessage = {
  text?: string;
  chat?: TgChat;
  from?: TgFrom;
  photo?: TgPhotoSize[];
  document?: TgDocument;
};

type TgCallbackQuery = {
  id: string;
  data?: string;
  from?: TgFrom;
  message?: { chat?: TgChat; message_id?: number };
};

type TgUpdate = {
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
};

type DocUploadSession = {
  orderId: string;
  expectedKind: DocKind;
  targetStatus: OrderStatus;
};

const ESCALATE_AFTER_MS = 10 * 60 * 1000;
const ESCALATE_POLL_MS = 60 * 1000;
/** Статусы, при которых реакция уже не нужна (не эскалируем «без ответа»). */
const ESCALATE_SKIP_STATUSES: OrderStatus[] = [
  OrderStatus.DONE,
  OrderStatus.REFUSAL,
  OrderStatus.CANCELLED_CC,
];

/** Активные заявки мастера (ещё в работе). */
const MASTER_ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.NOT_SCHEDULED,
  OrderStatus.WAITING,
  OrderStatus.ON_THE_WAY,
  OrderStatus.IN_PROGRESS,
  OrderStatus.IN_PROGRESS_SD,
];

const MASTER_BTN_ACTIVE = 'Активные заявки';
const MASTER_BTN_PAY = 'Моя ЗП';

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  [ClaimType.POLICE]: 'Полиция',
  [ClaimType.MASTER_BROKE]: 'Мастер сломал технику',
  [ClaimType.PRICE_DISSATISFIED]: 'Недоволен ценой',
};

/**
 * Слой для Telegram-бота. Токен берётся из настроек (админка) с fallback на env.
 */
@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private readonly docSessions = new Map<string, DocUploadSession>();
  private escalateTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatService))
    private readonly chat: ChatService,
    private readonly settings: SettingsService,
    private readonly documents: DocumentsService,
    private readonly settlements: SettlementsService,
  ) {}

  onModuleInit() {
    this.escalateTimer = setInterval(() => {
      void this.processEscalations().catch((e) =>
        this.logger.error(`escalation poll: ${String(e)}`),
      );
    }, ESCALATE_POLL_MS);
  }

  onModuleDestroy() {
    if (this.escalateTimer) clearInterval(this.escalateTimer);
  }

  /** Вызов метода Telegram Bot API токеном из настроек. */
  async telegram<T = unknown>(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<T | null> {
    const token = await this.settings.getBotToken();
    if (!token) {
      this.logger.warn(`Telegram ${method}: токен не задан`);
      return null;
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return (await res.json()) as T;
    } catch (e) {
      this.logger.error(`Telegram ${method} error: ${String(e)}`);
      return null;
    }
  }

  /** Отправить текст в чат Telegram (chatId = telegramId). */
  sendMessage(
    chatId: string,
    text: string,
    extra?: Record<string, unknown>,
  ) {
    return this.telegram('sendMessage', {
      chat_id: chatId,
      text,
      ...extra,
    });
  }

  async masterByTelegram(telegramId: string) {
    const user = await this.prisma.user.findFirst({
      where: { telegramId, role: 'MASTER', status: 'ACTIVE' },
      include: { masterProfile: true },
    });
    if (!user?.masterProfile) {
      throw new NotFoundException('Мастер не найден по telegram id');
    }
    return user;
  }

  async myOrders(telegramId: string) {
    const user = await this.masterByTelegram(telegramId);
    return this.prisma.order.findMany({
      where: { masterId: user.masterProfile!.id },
      include: { client: true, payment: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Только незакрытые заявки мастера. */
  async myActiveOrders(telegramId: string) {
    const user = await this.masterByTelegram(telegramId);
    return this.prisma.order.findMany({
      where: {
        masterId: user.masterProfile!.id,
        status: { in: MASTER_ACTIVE_STATUSES },
      },
      include: { client: true, payment: true, city: true },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      take: 30,
    });
  }

  private masterReplyKeyboard() {
    return {
      keyboard: [[{ text: MASTER_BTN_ACTIVE }], [{ text: MASTER_BTN_PAY }]],
      resize_keyboard: true,
      is_persistent: true,
    };
  }

  /** Список активных заявок (кнопки по адресу). */
  async sendActiveOrdersMenu(chatId: string, telegramId: string) {
    let orders;
    try {
      orders = await this.myActiveOrders(telegramId);
    } catch {
      await this.sendMessage(
        chatId,
        'Меню доступно только мастеру. Передайте ID администратору.',
      );
      return;
    }

    if (!orders.length) {
      await this.sendMessage(chatId, 'Нет активных заявок.', {
        reply_markup: this.masterReplyKeyboard(),
      });
      return;
    }

    const buttons = orders.map((o) => {
      const addr =
        o.address.length > 40 ? `${o.address.slice(0, 37)}…` : o.address;
      const st = STATUS_LABELS[o.status] ?? o.status;
      return [
        {
          text: `${st}: ${addr}`,
          callback_data: `mo:${o.id}`,
        },
      ];
    });

    await this.sendMessage(
      chatId,
      `Активные заявки (${orders.length}). Выберите одну — откроется карточка со статусами.`,
      {
        reply_markup: {
          inline_keyboard: buttons,
        },
      },
    );
  }

  /** Открыть карточку заявки; сбрасывает сессию документов другой заявки. */
  async openMasterOrderCard(
    chatId: string,
    telegramId: string,
    orderId: string,
  ) {
    const session = this.docSessions.get(telegramId);
    if (session && session.orderId !== orderId) {
      this.docSessions.delete(telegramId);
    }

    try {
      const user = await this.masterByTelegram(telegramId);
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { client: true, payment: true, city: true },
      });
      if (!order || order.masterId !== user.masterProfile!.id) {
        await this.sendMessage(
          chatId,
          'Заявка больше не ваша или уже закрыта. Откройте «Активные заявки».',
        );
        return;
      }
      if (ESCALATE_SKIP_STATUSES.includes(order.status)) {
        await this.sendMessage(
          chatId,
          `Заявка ${order.publicId} уже закрыта («${STATUS_LABELS[order.status]}»).`,
        );
        return;
      }
      await this.sendMasterOrderCard(chatId, order);
    } catch {
      await this.sendMessage(chatId, 'Не удалось открыть заявку.');
    }
  }

  private async sendMasterOrderCard(
    chatId: string,
    order: {
      id: string;
      publicId: string;
      address: string;
      typeTech?: string | null;
      comment?: string | null;
      adminComment?: string | null;
      scheduledAt?: Date | null;
      status: OrderStatus;
      client: { name: string; phoneNormalized: string };
    },
  ) {
    const lines = [
      `Заявка ${order.publicId}`,
      `Клиент: ${order.client.name}`,
      `Тел: ${order.client.phoneNormalized}`,
      `Адрес: ${order.address}`,
    ];
    if (order.typeTech) lines.push(`Техника: ${order.typeTech}`);
    if (order.comment?.trim()) {
      lines.push(`Комментарий диспетчера: ${order.comment.trim()}`);
    }
    if (order.adminComment?.trim()) {
      lines.push(`Комментарий администратора: ${order.adminComment.trim()}`);
    }
    if (order.scheduledAt) {
      lines.push(`Визит: ${order.scheduledAt.toLocaleString('ru-RU')}`);
    }
    lines.push(`Статус: ${STATUS_LABELS[order.status] ?? order.status}`);

    const row1 = STATUS_BUTTONS.slice(0, 2).map((b) => ({
      text: b.label,
      callback_data: `s:${order.id}:${b.status}`,
    }));
    const row2 = STATUS_BUTTONS.slice(2).map((b) => ({
      text: b.label,
      callback_data: `s:${order.id}:${b.status}`,
    }));
    const rowNav = [
      { text: '« К списку', callback_data: 'ml' },
    ];

    return this.sendMessage(chatId, lines.join('\n'), {
      reply_markup: { inline_keyboard: [row1, row2, rowNav] },
    });
  }

  async aboutMe(telegramId: string) {
    const user = await this.masterByTelegram(telegramId);
    const masterId = user.masterProfile!.id;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const orders = await this.prisma.order.findMany({
      where: {
        masterId,
        status: OrderStatus.DONE,
        updatedAt: { gte: from },
      },
      include: { payment: true },
    });
    const salary = orders.reduce(
      (s, o) => s + Number(o.payment?.masterSalary ?? 0),
      0,
    );

    const fineRows = await this.prisma.cashTx.findMany({
      where: {
        direction: CashDirection.INCOME,
        incomeBasis: CashIncomeBasis.FINE,
        masterId,
        createdAt: { gte: from },
      },
      select: { amount: true },
    });
    const fines = fineRows.reduce((s, r) => s + Number(r.amount), 0);
    const salaryNet = Math.max(0, Math.round((salary - fines) * 100) / 100);

    return {
      fullName: user.fullName,
      ordersCount: orders.length,
      salaryMonth: salary,
      salaryNet,
      fines,
      bonus: 0,
      description:
        'bonus: TODO — в CashTx нет привязки расхода BONUS к мастеру, значение всегда 0',
    };
  }

  async setStatus(
    telegramId: string,
    orderId: string,
    status: OrderStatus,
    confirm: boolean,
  ) {
    if (!confirm) {
      throw new BadRequestException('Нужно подтверждение смены статуса');
    }
    const user = await this.masterByTelegram(telegramId);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order || order.masterId !== user.masterProfile!.id) {
      throw new NotFoundException(
        'Заявка больше не ваша. Откройте «Активные заявки».',
      );
    }

    if (
      status === OrderStatus.DONE ||
      status === OrderStatus.IN_PROGRESS_SD
    ) {
      const missing = await this.documents.missingKindsForStatus(
        orderId,
        status,
      );
      if (missing.length) {
        const label = STATUS_LABELS[status] ?? status;
        throw new BadRequestException(
          `Для статуса «${label}» недостаёт документов: ${missing
            .map((k) => DOC_KIND_RU[k])
            .join(', ')}`,
        );
      }
    }

    const becameDone =
      status === OrderStatus.DONE && order.status !== OrderStatus.DONE;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: orderId },
        data: {
          status,
          ...(status === OrderStatus.DONE
            ? {
                docsViaAdmin: false,
                ...(becameDone || !order.completedAt
                  ? { completedAt: order.completedAt ?? new Date() }
                  : {}),
              }
            : {}),
        },
      });

      if (status === OrderStatus.DONE) {
        const paid = Number(order.payment?.paid ?? 0);
        const partsCost = Number(order.payment?.partsCost ?? 0);
        const masterSalary = Number(order.payment?.masterSalary ?? 0);
        const toCompany =
          order.payment?.toCompany != null
            ? Number(order.payment.toCompany)
            : Math.max(0, paid - partsCost - masterSalary);

        const exists = await tx.cashTx.findFirst({
          where: {
            orderId,
            incomeBasis: CashIncomeBasis.ORDER,
          },
          select: { id: true },
        });
        const cashData = {
          amount: toCompany,
          cityId: order.cityId ?? undefined,
          description: 'Приход по заявке (чистыми)',
        };
        if (!exists) {
          await tx.cashTx.create({
            data: {
              direction: CashDirection.INCOME,
              incomeBasis: CashIncomeBasis.ORDER,
              orderId,
              createdById: user.id,
              ...cashData,
            },
          });
        } else if (becameDone) {
          await tx.cashTx.update({
            where: { id: exists.id },
            data: cashData,
          });
        }
      }

      return row;
    });

    if (status === OrderStatus.DONE) {
      await this.settlements.syncForCompletedOrder(orderId).catch(() => undefined);
    }

    // Терминальный статус / движение по заявке = реакция есть, эскалация не нужна.
    if (
      ESCALATE_SKIP_STATUSES.includes(status) ||
      status === OrderStatus.IN_PROGRESS ||
      status === OrderStatus.IN_PROGRESS_SD ||
      status === OrderStatus.ON_THE_WAY
    ) {
      void this.ackOrderNotify(orderId).catch(() => undefined);
    }

    return updated;
  }

  incomingMessage(externalId: string, text: string, title?: string) {
    return this.chat.ingest({
      channel: ChatChannel.TELEGRAM,
      externalId,
      title,
      body: text,
    });
  }

  /** Карточка заявки мастеру с inline-кнопками статусов. */
  async notifyMasterOrder(masterId: string, orderId: string) {
    const master = await this.prisma.master.findUnique({
      where: { id: masterId },
      include: { user: true },
    });
    if (!master) {
      throw new NotFoundException('Мастер не найден');
    }
    const telegramId = master.user.telegramId;
    if (!telegramId) {
      this.logger.warn(
        `notifyMasterOrder: у мастера ${masterId} нет telegramId`,
      );
      return null;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { client: true, payment: true, city: true },
    });
    if (!order) {
      throw new NotFoundException('Заявка не найдена');
    }

    this.logger.log(
      `notifyMasterOrder → telegramId=${telegramId} order=${order.publicId}`,
    );

    // Меню снизу + карточка (старые сообщения в чате остаются, но статусы
    // меняют только через актуальную карточку / список — setStatus проверяет masterId).
    await this.sendMessage(telegramId, 'Новая заявка назначена.', {
      reply_markup: this.masterReplyKeyboard(),
    });
    return this.sendMasterOrderCard(telegramId, order);
  }

  /** Уведомление мастеру о штрафе (касса → FINE + masterId). */
  async notifyMasterFine(
    masterId: string,
    amount: number,
    description?: string | null,
  ) {
    const master = await this.prisma.master.findUnique({
      where: { id: masterId },
      include: { user: true },
    });
    const telegramId = master?.user.telegramId;
    if (!telegramId) return null;

    const lines = [
      `Штраф: ${amount.toLocaleString('ru-RU')} ₽`,
      description ? `Причина: ${description}` : null,
      'Сумма добавлена к сдаче и вычтена из ЗП за месяц.',
      'Актуальные цифры — кнопка «Моя ЗП».',
    ].filter(Boolean);

    return this.sendMessage(telegramId, lines.join('\n'), {
      reply_markup: this.masterReplyKeyboard(),
    });
  }

  /** Старому мастеру при переназначении / снятии. */
  async notifyMasterOrderRevoked(
    masterId: string,
    publicId: string,
    address?: string | null,
  ) {
    const master = await this.prisma.master.findUnique({
      where: { id: masterId },
      include: { user: true },
    });
    const telegramId = master?.user.telegramId;
    if (!telegramId) return null;

    const lines = [
      `Заявка ${publicId} снята с вас (переназначена или закрыта офисом).`,
      address ? `Адрес: ${address}` : null,
      'Старые кнопки по этой заявке больше не действуют.',
      'Актуальный список — кнопка «Активные заявки».',
    ].filter(Boolean);

    return this.sendMessage(telegramId, lines.join('\n'), {
      reply_markup: this.masterReplyKeyboard(),
    });
  }

  /** Уведомить мастера о смене статуса (например админ закрыл заявку). */
  async notifyMasterStatusChanged(orderId: string, status: OrderStatus) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { master: { include: { user: true } } },
    });
    const telegramId = order?.master?.user.telegramId;
    if (!telegramId || !order) return null;
    const label = STATUS_LABELS[status] ?? status;
    return this.sendMessage(
      telegramId,
      `Заявка ${order.publicId}: статус «${label}»`,
    );
  }

  /**
   * Сразу — только ADMIN (с кнопкой «Ознакомился»).
   * Через 10 мин без ack/смены статуса — DIRECTOR + OWNER.
   */
  async notifyAdminsNewOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { client: true, city: true },
    });
    if (!order) return null;

    const text = this.formatNewOrderText(order, false);
    const recipients = await this.officeRecipients(order.cityId, [Role.ADMIN]);
    if (!recipients.length) {
      this.logger.log(
        `notifyAdminsNewOrder: нет ADMIN с TG для ${order.publicId}`,
      );
      return null;
    }

    this.logger.log(
      `notifyAdminsNewOrder → ${recipients.length} ADMIN, заявка ${order.publicId}`,
    );

    return Promise.allSettled(
      recipients.map((a) =>
        this.sendMessage(a.telegramId as string, text, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Ознакомился', callback_data: `ack:o:${orderId}` }],
            ],
          },
        }),
      ),
    );
  }

  async notifyAdminsNewClaim(claimId: string) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        order: { include: { client: true } },
        city: true,
      },
    });
    if (!claim) return null;

    const text = this.formatNewClaimText(claim, false);
    const recipients = await this.officeRecipients(claim.cityId, [Role.ADMIN]);
    if (!recipients.length) return null;

    this.logger.log(
      `notifyAdminsNewClaim → ${recipients.length} ADMIN, претензия ${claimId}`,
    );

    return Promise.allSettled(
      recipients.map((a) =>
        this.sendMessage(a.telegramId as string, text, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Ознакомился', callback_data: `ack:c:${claimId}` }],
            ],
          },
        }),
      ),
    );
  }

  /** Эскалации: открытые заявки/претензии старше 10 мин без ack. */
  async processEscalations() {
    const cutoff = new Date(Date.now() - ESCALATE_AFTER_MS);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { lte: cutoff },
        notifyAckedAt: null,
        notifyEscalatedAt: null,
        status: { notIn: ESCALATE_SKIP_STATUSES },
      },
      select: { id: true },
      take: 40,
    });
    for (const o of orders) {
      await this.escalateOrder(o.id);
    }

    const claims = await this.prisma.claim.findMany({
      where: {
        createdAt: { lte: cutoff },
        notifyAckedAt: null,
        notifyEscalatedAt: null,
        closedAt: null,
      },
      select: { id: true },
      take: 40,
    });
    for (const c of claims) {
      await this.escalateClaim(c.id);
    }
  }

  private async escalateOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { client: true, city: true },
    });
    if (
      !order ||
      order.notifyAckedAt ||
      order.notifyEscalatedAt ||
      ESCALATE_SKIP_STATUSES.includes(order.status)
    ) {
      return;
    }

    const recipients = await this.officeRecipients(order.cityId, [
      Role.DIRECTOR,
      Role.OWNER,
    ]);
    const text = this.formatNewOrderText(order, true);
    if (recipients.length) {
      await Promise.allSettled(
        recipients.map((a) =>
          this.sendMessage(a.telegramId as string, text, {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Ознакомился', callback_data: `ack:o:${orderId}` }],
              ],
            },
          }),
        ),
      );
      this.logger.log(
        `escalateOrder → ${recipients.length} DIR/OWNER, ${order.publicId}`,
      );
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { notifyEscalatedAt: new Date() },
    });
  }

  private async escalateClaim(claimId: string) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        order: { include: { client: true } },
        city: true,
      },
    });
    if (
      !claim ||
      claim.notifyAckedAt ||
      claim.notifyEscalatedAt ||
      claim.closedAt
    ) {
      return;
    }

    const recipients = await this.officeRecipients(claim.cityId, [
      Role.DIRECTOR,
      Role.OWNER,
    ]);
    const text = this.formatNewClaimText(claim, true);
    if (recipients.length) {
      await Promise.allSettled(
        recipients.map((a) =>
          this.sendMessage(a.telegramId as string, text, {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Ознакомился', callback_data: `ack:c:${claimId}` }],
              ],
            },
          }),
        ),
      );
      this.logger.log(
        `escalateClaim → ${recipients.length} DIR/OWNER, claim ${claimId}`,
      );
    }

    await this.prisma.claim.update({
      where: { id: claimId },
      data: { notifyEscalatedAt: new Date() },
    });
  }

  private formatNewOrderText(
    order: {
      publicId: string;
      address: string;
      typeTech?: string | null;
      scheduledAt?: Date | null;
      client: { name: string; phoneNormalized: string };
      city?: { name: string } | null;
    },
    escalated: boolean,
  ) {
    const lines = [
      escalated
        ? `⏰ Эскалация: заявка ${order.publicId} без реакции админа 10+ мин`
        : `🆕 Новая заявка ${order.publicId}`,
      `Клиент: ${order.client.name}`,
      `Тел: ${order.client.phoneNormalized}`,
      `Адрес: ${order.address}`,
    ];
    if (order.city?.name) lines.push(`Филиал: ${order.city.name}`);
    if (order.typeTech) lines.push(`Техника: ${order.typeTech}`);
    if (order.scheduledAt) {
      lines.push(`Визит: ${order.scheduledAt.toLocaleString('ru-RU')}`);
    }
    lines.push('Назначьте мастера в CRM.');
    return lines.join('\n');
  }

  private formatNewClaimText(
    claim: {
      type: ClaimType;
      refundSum: unknown;
      order: {
        publicId: string;
        client: { name: string; phoneNormalized: string };
      };
      city?: { name: string } | null;
    },
    escalated: boolean,
  ) {
    const lines = [
      escalated
        ? `⏰ Эскалация: претензия по заявке ${claim.order.publicId}`
        : `⚠️ Новая претензия по заявке ${claim.order.publicId}`,
      `Тип: ${CLAIM_TYPE_LABELS[claim.type] ?? claim.type}`,
      `Клиент: ${claim.order.client.name}`,
      `Тел: ${claim.order.client.phoneNormalized}`,
      `Возврат: ${Number(claim.refundSum)} ₽`,
    ];
    if (claim.city?.name) lines.push(`Филиал: ${claim.city.name}`);
    lines.push('Откройте претензию в CRM.');
    return lines.join('\n');
  }

  private async officeRecipients(
    cityId: string | null | undefined,
    roles: Role[],
  ) {
    const hasOwner = roles.includes(Role.OWNER);
    const branchRoles = roles.filter((r) => r !== Role.OWNER);

    const branchFilter: Prisma.UserWhereInput[] = [];
    if (hasOwner) branchFilter.push({ role: Role.OWNER });
    if (branchRoles.length) {
      if (cityId) {
        branchFilter.push({
          role: { in: branchRoles },
          OR: [
            { cityId },
            { managedBranches: { some: { cityId } } },
          ],
        });
      } else {
        branchFilter.push({ role: { in: branchRoles } });
      }
    }
    if (!branchFilter.length) return [];

    return this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        telegramId: { not: null },
        OR: branchFilter,
      },
      select: { telegramId: true, role: true },
    });
  }

  async ackOrderNotify(orderId: string) {
    await this.prisma.order.updateMany({
      where: { id: orderId, notifyAckedAt: null },
      data: { notifyAckedAt: new Date() },
    });
  }

  async ackClaimNotify(claimId: string) {
    await this.prisma.claim.updateMany({
      where: { id: claimId, notifyAckedAt: null },
      data: { notifyAckedAt: new Date() },
    });
  }

  async notifyAdminsDocsViaAdmin(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: true,
        city: true,
        master: { include: { user: true } },
      },
    });
    if (!order) return null;

    const branchFilter: Prisma.UserWhereInput[] = order.cityId
      ? [
          { role: Role.OWNER },
          {
            role: { in: [Role.ADMIN, Role.DIRECTOR] },
            OR: [
              { cityId: order.cityId },
              { managedBranches: { some: { cityId: order.cityId } } },
            ],
          },
        ]
      : [{ role: { in: [Role.ADMIN, Role.DIRECTOR, Role.OWNER] } }];

    const admins = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        telegramId: { not: null },
        OR: branchFilter,
      },
      select: { telegramId: true },
    });
    if (!admins.length) return null;

    const masterName = order.master?.user.fullName ?? 'мастер';
    const text = [
      `📎 Заявка ${order.publicId}`,
      `Мастер ${masterName} просит загрузить документы через администратора и закрыть заявку.`,
      `Клиент: ${order.client.name}`,
      `Адрес: ${order.address}`,
    ].join('\n');

    return Promise.allSettled(
      admins.map((a) => this.sendMessage(a.telegramId as string, text)),
    );
  }

  /** Публичный webhook Telegram: проверка секрета + разбор Update. */
  async handleWebhook(secret: string, update: TgUpdate) {
    const expected = await this.settings.getWebhookSecret();
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Неверный webhook secret');
    }

    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return { ok: true };
    }

    const msg = update.message;
    if (!msg?.chat?.id) return { ok: true };

    const chatId = String(msg.chat.id);
    const telegramId =
      msg.from?.id != null ? String(msg.from.id) : chatId;

    if (msg.photo?.length || msg.document) {
      await this.handleIncomingFile(telegramId, chatId, msg);
      return { ok: true };
    }

    if (msg.text) {
      const text = msg.text.trim();
      if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
        const masterUser = await this.prisma.user.findFirst({
          where: { telegramId, role: 'MASTER', status: 'ACTIVE' },
          include: { masterProfile: true },
        });
        if (masterUser?.masterProfile) {
          await this.sendMessage(
            chatId,
            [
              `Здравствуйте, ${masterUser.fullName}.`,
              `Ваш ID: ${telegramId}`,
              '',
              'Меню снизу: «Активные заявки» — список по адресам, внутри меняете статусы.',
              'Одновременно открыта одна заявка: при выборе другой сессия документов сбрасывается.',
            ].join('\n'),
            { reply_markup: this.masterReplyKeyboard() },
          );
        } else {
          await this.sendMessage(
            chatId,
            [
              `Ваш ID для подключения: ${telegramId}`,
              '',
              'Передайте этот ID администратору для подключения к чату и уведомлениям.',
            ].join('\n'),
          );
        }
        return { ok: true };
      }

      if (text === MASTER_BTN_ACTIVE || /^\/orders(?:@\w+)?$/i.test(text)) {
        await this.sendActiveOrdersMenu(chatId, telegramId);
        return { ok: true };
      }

      if (text === MASTER_BTN_PAY || /^\/pay(?:@\w+)?$/i.test(text)) {
        try {
          const info = await this.aboutMe(telegramId);
          await this.sendMessage(
            chatId,
            [
              `Начислено ЗП: ${info.salaryMonth.toLocaleString('ru-RU')} ₽`,
              `Штрафы: ${info.fines.toLocaleString('ru-RU')} ₽`,
              `К получению (ЗП − штрафы): ${info.salaryNet.toLocaleString('ru-RU')} ₽`,
              `Закрыто заявок: ${info.ordersCount}`,
            ].join('\n'),
            { reply_markup: this.masterReplyKeyboard() },
          );
        } catch {
          await this.sendMessage(chatId, 'Доступно только мастеру.');
        }
        return { ok: true };
      }

      const from = msg.from;
      const title =
        from?.username || from?.first_name || String(msg.chat.id);
      await this.incomingMessage(chatId, text, title);
    }

    return { ok: true };
  }

  private async requestMissingDocuments(
    chatId: string,
    telegramId: string,
    orderId: string,
    missing: DocKind[],
    targetStatus: OrderStatus = OrderStatus.DONE,
  ) {
    if (!missing.length) return;
    this.docSessions.set(telegramId, {
      orderId,
      expectedKind: missing[0],
      targetStatus,
    });
    const statusLabel = STATUS_LABELS[targetStatus] ?? targetStatus;
    await this.sendMessage(
      chatId,
      `Для статуса «${statusLabel}» нужны документы. Пришлите фото или PDF. После загрузки всех файлов статус применится автоматически.`,
    );
    for (const kind of missing) {
      await this.sendDocKindPrompt(chatId, orderId, kind);
    }
  }

  /** Если для целевого статуса хватает файлов — сразу ставим статус. */
  private async tryApplyStatusAfterDocs(
    chatId: string,
    telegramId: string,
    orderId: string,
    targetStatus: OrderStatus,
  ): Promise<boolean> {
    const missing = await this.documents.missingKindsForStatus(
      orderId,
      targetStatus,
    );
    if (missing.length) return false;
    try {
      await this.setStatus(telegramId, orderId, targetStatus, true);
      this.docSessions.delete(telegramId);
      await this.sendMessage(
        chatId,
        `Статус обновлён: ${STATUS_LABELS[targetStatus] ?? targetStatus}`,
      );
      return true;
    } catch (e) {
      const text =
        e instanceof BadRequestException || e instanceof NotFoundException
          ? String(
              (e.getResponse() as { message?: string | string[] })?.message ??
                e.message,
            )
          : 'Не удалось сменить статус';
      await this.sendMessage(
        chatId,
        Array.isArray(text) ? text.join('; ') : text,
      );
      return true;
    }
  }

  private sendDocKindPrompt(chatId: string, orderId: string, kind: DocKind) {
    return this.sendMessage(
      chatId,
      `Загрузите: «${DOC_KIND_TG[kind]}» (фото или PDF).`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Далее',
                callback_data: `dn:${orderId}:${kind}`,
              },
              {
                text: 'Загрузить через администратора',
                callback_data: `ad:${orderId}`,
              },
            ],
          ],
        },
      },
    );
  }

  private async handleIncomingFile(
    telegramId: string,
    chatId: string,
    msg: TgMessage,
  ) {
    const session = this.docSessions.get(telegramId);
    if (!session) {
      await this.sendMessage(
        chatId,
        'Сначала выберите статус «Готов» — бот запросит нужные документы.',
      );
      return;
    }

    try {
      await this.masterByTelegram(telegramId);
    } catch {
      await this.sendMessage(chatId, 'Мастер не найден');
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: session.orderId },
      include: { master: { include: { user: true } } },
    });
    if (!order || order.master?.user.telegramId !== telegramId) {
      this.docSessions.delete(telegramId);
      await this.sendMessage(chatId, 'Заявка не найдена у мастера');
      return;
    }

    let uploadResult: { created: unknown[]; skipped: number };
    try {
      const file = await this.downloadTgFile(msg);
      uploadResult = await this.documents.uploadMany(
        session.orderId,
        session.expectedKind,
        [file],
        order.master.user.id,
        session.targetStatus,
      );
    } catch (e) {
      const text =
        e instanceof BadRequestException
          ? String(
              (e.getResponse() as { message?: string | string[] })?.message ??
                e.message,
            )
          : 'Не удалось сохранить файл';
      await this.sendMessage(
        chatId,
        Array.isArray(text) ? text.join('; ') : text,
      );
      return;
    }

    // Дубликат по хешу — без уведомлений
    if (!uploadResult.created.length) {
      return;
    }

    const applied = await this.tryApplyStatusAfterDocs(
      chatId,
      telegramId,
      session.orderId,
      session.targetStatus,
    );
    if (applied) return;

    const missing = await this.documents.missingKindsForStatus(
      session.orderId,
      session.targetStatus,
    );
    if (!missing.includes(session.expectedKind) && missing[0]) {
      this.docSessions.set(telegramId, {
        orderId: session.orderId,
        expectedKind: missing[0],
        targetStatus: session.targetStatus,
      });
      await this.sendMessage(
        chatId,
        `Принято: «${DOC_KIND_TG[session.expectedKind]}». Далее: «${DOC_KIND_TG[missing[0]]}».`,
      );
      return;
    }

    await this.sendMessage(
      chatId,
      `Принято: «${DOC_KIND_TG[session.expectedKind]}». Можно прислать ещё файлы этого типа или нажать «Далее».`,
    );
  }

  private async downloadTgFile(msg: TgMessage) {
    const token = await this.settings.getBotToken();
    if (!token) throw new BadRequestException('Токен бота не задан');

    let fileId: string;
    let fileName = 'file';
    let mimeType = 'application/octet-stream';

    if (msg.document) {
      fileId = msg.document.file_id;
      fileName = msg.document.file_name || 'document.pdf';
      mimeType = msg.document.mime_type || mimeType;
    } else if (msg.photo?.length) {
      const best = msg.photo[msg.photo.length - 1];
      fileId = best.file_id;
      fileName = 'photo.jpg';
      mimeType = 'image/jpeg';
    } else {
      throw new BadRequestException('Нет файла в сообщении');
    }

    const meta = await this.telegram<{
      ok?: boolean;
      result?: { file_path?: string };
    }>('getFile', { file_id: fileId });
    const filePath = meta?.result?.file_path;
    if (!filePath) throw new BadRequestException('Не удалось получить файл');

    const ext = extname(fileName || filePath).toLowerCase() || '.jpg';
    if (!ALLOWED_TG_EXT.has(ext)) {
      throw new BadRequestException(
        'Допустимы только фото или PDF',
      );
    }

    const res = await fetch(
      `https://api.telegram.org/file/bot${token}/${filePath}`,
    );
    if (!res.ok) throw new BadRequestException('Ошибка скачивания файла');
    const buffer = Buffer.from(await res.arrayBuffer());

    return {
      originalname: fileName.endsWith(ext) ? fileName : `${fileName}${ext}`,
      mimetype: mimeType,
      size: buffer.length,
      buffer,
    };
  }

  private async handleCallbackQuery(cq: TgCallbackQuery) {
    const chatId =
      cq.message?.chat?.id != null ? String(cq.message.chat.id) : null;
    const telegramId = cq.from?.id != null ? String(cq.from.id) : null;
    const data = cq.data ?? '';

    await this.telegram('answerCallbackQuery', {
      callback_query_id: cq.id,
    });

    if (!chatId || !telegramId) return;

    if (data === 'ml') {
      await this.sendActiveOrdersMenu(chatId, telegramId);
      return;
    }

    if (data.startsWith('mo:')) {
      const orderId = data.slice(3);
      await this.openMasterOrderCard(chatId, telegramId, orderId);
      return;
    }

    if (data.startsWith('ack:o:')) {
      const orderId = data.slice(6);
      await this.ackOrderNotify(orderId);
      await this.clearInlineKeyboard(chatId, cq.message?.message_id);
      await this.sendMessage(chatId, 'Ознакомление зафиксировано.');
      return;
    }

    if (data.startsWith('ack:c:')) {
      const claimId = data.slice(6);
      await this.ackClaimNotify(claimId);
      await this.clearInlineKeyboard(chatId, cq.message?.message_id);
      await this.sendMessage(chatId, 'Ознакомление зафиксировано.');
      return;
    }

    if (data === 'n') {
      await this.sendMessage(chatId, 'Отменено');
      return;
    }

    if (data.startsWith('ad:')) {
      const orderId = data.slice(3);
      try {
        await this.masterByTelegram(telegramId);
        await this.prisma.order.update({
          where: { id: orderId },
          data: { docsViaAdmin: true },
        });
        this.docSessions.delete(telegramId);
        await this.notifyAdminsDocsViaAdmin(orderId);
        await this.sendMessage(
          chatId,
          'Документы загрузит администратор и закроет заявку. Статус обновится автоматически.',
        );
      } catch (e) {
        const text =
          e instanceof BadRequestException || e instanceof NotFoundException
            ? String(
                (e.getResponse() as { message?: string | string[] })?.message ??
                  e.message,
              )
            : 'Не удалось передать заявку администратору';
        await this.sendMessage(
          chatId,
          Array.isArray(text) ? text.join('; ') : text,
        );
      }
      return;
    }

    if (data.startsWith('dn:')) {
      const rest = data.slice(3);
      const sep = rest.lastIndexOf(':');
      if (sep <= 0) return;
      const orderId = rest.slice(0, sep);
      const kind = rest.slice(sep + 1) as DocKind;
      if (
        !REQUIRED_ORDER_DOC_KINDS.includes(kind) &&
        kind !== DocKind.RECEIPT_SD
      ) {
        return;
      }

      const session = this.docSessions.get(telegramId);
      const targetStatus =
        session?.orderId === orderId
          ? session.targetStatus
          : OrderStatus.DONE;

      const missing = await this.documents.missingKindsForStatus(
        orderId,
        targetStatus,
      );
      if (missing.includes(kind)) {
        await this.sendMessage(
          chatId,
          `Ещё не загружен файл для «${DOC_KIND_TG[kind]}». Пришлите фото или PDF.`,
        );
        this.docSessions.set(telegramId, {
          orderId,
          expectedKind: kind,
          targetStatus,
        });
        return;
      }

      const next = missing[0];
      if (!next) {
        await this.tryApplyStatusAfterDocs(
          chatId,
          telegramId,
          orderId,
          targetStatus,
        );
        return;
      }

      this.docSessions.set(telegramId, {
        orderId,
        expectedKind: next,
        targetStatus,
      });
      await this.sendMessage(
        chatId,
        `Следующий документ: «${DOC_KIND_TG[next]}». Пришлите фото или PDF.`,
      );
      return;
    }

    if (data.startsWith('s:')) {
      const rest = data.slice(2);
      const sep = rest.lastIndexOf(':');
      if (sep <= 0) return;
      const orderId = rest.slice(0, sep);
      const status = rest.slice(sep + 1) as OrderStatus;
      const label = STATUS_LABELS[status] ?? status;
      await this.sendMessage(
        chatId,
        `Подтвердите смену статуса на «${label}»?`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Подтвердить',
                  callback_data: `c:${orderId}:${status}`,
                },
                { text: 'Отмена', callback_data: 'n' },
              ],
            ],
          },
        },
      );
      return;
    }

    if (data.startsWith('c:')) {
      const rest = data.slice(2);
      const sep = rest.lastIndexOf(':');
      if (sep <= 0) return;
      const orderId = rest.slice(0, sep);
      const status = rest.slice(sep + 1) as OrderStatus;

      if (
        status === OrderStatus.DONE ||
        status === OrderStatus.IN_PROGRESS_SD
      ) {
        const missing = await this.documents.missingKindsForStatus(
          orderId,
          status,
        );
        if (missing.length) {
          await this.requestMissingDocuments(
            chatId,
            telegramId,
            orderId,
            missing,
            status,
          );
          return;
        }
      }

      try {
        await this.setStatus(telegramId, orderId, status, true);
        this.docSessions.delete(telegramId);
        await this.sendMessage(
          chatId,
          `Статус обновлён: ${STATUS_LABELS[status] ?? status}`,
        );
      } catch (e) {
        const text =
          e instanceof BadRequestException || e instanceof NotFoundException
            ? String(
                (e.getResponse() as { message?: string | string[] })?.message ??
                  e.message,
              )
            : 'Не удалось сменить статус';
        await this.sendMessage(
          chatId,
          Array.isArray(text) ? text.join('; ') : text,
        );
      }
    }
  }

  private clearInlineKeyboard(chatId: string, messageId?: number) {
    if (messageId == null) return Promise.resolve(null);
    return this.telegram('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
  }
}
