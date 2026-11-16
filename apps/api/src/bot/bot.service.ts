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
import { GroupFlow, parseClosingReply, parseSdReply, sdDeadline } from './group-flow';
import { extname } from 'path';
import { randomBytes, createHash } from 'crypto';
import { ChatService } from '../chat/chat.service';
import { calcPayment } from '../common/utils/formulas';
import {
  DOC_KIND_RU,
  DocumentsService,
  REQUIRED_ORDER_DOC_KINDS,
} from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryService } from '../salary/salary.service';
import { SettingsService } from '../settings/settings.service';
import { SettlementsService } from '../settlements/settlements.service';

const STATUS_LABELS: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.NOT_SCHEDULED]: 'Не назначено',
  [OrderStatus.WAITING]: 'Ожидание',
  [OrderStatus.ON_THE_WAY]: 'В пути',
  [OrderStatus.IN_PROGRESS]: 'В работе',
  [OrderStatus.DONE]: 'Готов',
  [OrderStatus.IN_PROGRESS_SD]: 'В работе СД',
};

/** Допустимые переходы статуса мастером в боте. */
const STATUS_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.NOT_SCHEDULED]: [OrderStatus.ON_THE_WAY],
  [OrderStatus.WAITING]: [OrderStatus.ON_THE_WAY],
  [OrderStatus.ON_THE_WAY]: [OrderStatus.IN_PROGRESS],
  [OrderStatus.IN_PROGRESS]: [OrderStatus.DONE, OrderStatus.IN_PROGRESS_SD],
  [OrderStatus.IN_PROGRESS_SD]: [OrderStatus.DONE],
};

const STATUS_BTN_LABEL: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.ON_THE_WAY]: 'В пути',
  [OrderStatus.IN_PROGRESS]: 'В работе',
  [OrderStatus.DONE]: 'Готов',
  [OrderStatus.IN_PROGRESS_SD]: 'В работе СД',
};

/** Виды для догрузки без смены статуса. */
const EXTRA_DOC_KINDS: DocKind[] = [
  DocKind.RECEIPT_SERVICE,
  DocKind.CONTRACT,
  DocKind.RECEIPT_PARTS,
  DocKind.PARTS_PHOTO,
  DocKind.RECEIPT_SD,
  DocKind.OTHER,
];

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

type TgChat = { id?: number | string; type?: string; title?: string };

type TgPhotoSize = { file_id: string; file_unique_id?: string };

type TgDocument = {
  file_id: string;
  file_name?: string;
  mime_type?: string;
};

type TgMessage = {
  message_id?: number;
  reply_to_message?: {message_id?:number;text?:string;from?:TgFrom};
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
  update_id?: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
};

type DocUploadSession = {
  orderId: string;
  expectedKind: DocKind;
  /** null = догрузка без смены статуса */
  targetStatus: OrderStatus | null;
  extraOnly?: boolean;
  /** Мастер скидывает все фото — админ разметит в CRM */
  viaAdminDump?: boolean;
};

type PaySession = {
  orderId: string;
  step: 'paid' | 'parts';
  paid?: number;
  /** После сохранения сумм продолжить этот статус (обычно DONE) */
  resumeStatus?: OrderStatus;
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
  private readonly paySessions = new Map<string, PaySession>();
  /** Эфемерные UI-сообщения бота (список заявок, ЗП) — удаляем перед новым экраном. */
  private readonly ephemeralMsgs = new Map<string, number[]>();
  private escalateTimer: ReturnType<typeof setInterval> | null = null;
  /** Long-polling getUpdates вместо webhook (удобно без домена/HTTPS). */
  private pollStop = false;
  private updateOffset = 0;
  private webhookClearedForToken: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatService))
    private readonly chat: ChatService,
    private readonly settings: SettingsService,
    private readonly documents: DocumentsService,
    private readonly settlements: SettlementsService,
    private readonly salary: SalaryService,
  ) {}

  onModuleInit() {
    this.escalateTimer = setInterval(() => {
      void this.processEscalations().catch((e) =>
        this.logger.error(`escalation poll: ${String(e)}`),
      );
    }, ESCALATE_POLL_MS);
    this.pollStop = false;
    void this.pollLoop();
  }

  onModuleDestroy() {
    this.pollStop = true;
    if (this.escalateTimer) clearInterval(this.escalateTimer);
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  /** Фоновый опрос Telegram getUpdates. */
  private async pollLoop() {
    this.logger.log('Telegram: запущен режим getUpdates (без webhook)');
    while (!this.pollStop) {
      try {
        const token = await this.settings.getBotToken();
        const enabled = await this.settings.isBotEnabled();
        if (!token || !enabled) {
          await this.sleep(3000);
          continue;
        }

        if (this.webhookClearedForToken !== token) {
          await this.telegram('deleteWebhook', {
            drop_pending_updates: false,
          });
          this.webhookClearedForToken = token;
          this.logger.log('Telegram: webhook снят, слушаем getUpdates');
        }

        const updates = await this.fetchUpdates(token, this.updateOffset);
        for (const update of updates) {
          if (typeof update.update_id === 'number') {
            this.updateOffset = update.update_id + 1;
          }
          try {
            await this.processUpdate(update);
          } catch (e) {
            this.logger.error(
              `Telegram update ${update.update_id}: ${String(e)}`,
            );
          }
        }
      } catch (e) {
        this.logger.warn(`Telegram poll: ${String(e)}`);
        await this.sleep(2000);
      }
    }
  }

  private async fetchUpdates(
    token: string,
    offset: number,
  ): Promise<TgUpdate[]> {
    const params = new URLSearchParams({
      timeout: '25',
      offset: String(offset),
      allowed_updates: JSON.stringify(['message', 'callback_query']),
    });
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?${params}`,
      { signal: AbortSignal.timeout(35_000) },
    );
    const json = (await res.json()) as {
      ok: boolean;
      result?: TgUpdate[];
      description?: string;
    };
    if (!json.ok) {
      const desc = json.description ?? 'error';
      this.logger.warn(`getUpdates: ${desc}`);
      // Конфликт с другим getUpdates / старым webhook — подождать и снять webhook снова.
      if (/conflict|webhook/i.test(desc)) {
        this.webhookClearedForToken = null;
        await this.sleep(1500);
      } else {
        await this.sleep(3000);
      }
      return [];
    }
    return json.result ?? [];
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
        signal: AbortSignal.timeout(10000),
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
    return this.telegram<{ ok?: boolean; result?: { message_id?: number } }>(
      'sendMessage',
      {
        chat_id: chatId,
        text,
        ...extra,
      },
    );
  }

  private tgMessageId(
    res: { ok?: boolean; result?: { message_id?: number } } | null,
  ): number | null {
    if (!res?.ok || typeof res.result?.message_id !== 'number') return null;
    return res.result.message_id;
  }

  deleteMessage(chatId: string, messageId: number) {
    return this.telegram('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  private async clearEphemeral(chatId: string) {
    const ids = this.ephemeralMsgs.get(chatId) ?? [];
    for (const id of ids) {
      await this.deleteMessage(chatId, id).catch(() => undefined);
    }
    this.ephemeralMsgs.set(chatId, []);
  }

  private trackEphemeral(chatId: string, messageId: number | null) {
    if (messageId == null) return;
    const list = this.ephemeralMsgs.get(chatId) ?? [];
    list.push(messageId);
    this.ephemeralMsgs.set(chatId, list);
  }

  /** Удалить карточку заявки в Telegram у текущего мастера. */
  async clearMasterOrderCard(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { masterTgChatId: true, masterTgMessageId: true },
    });
    if (order?.masterTgChatId && order.masterTgMessageId != null) {
      await this.deleteMessage(
        order.masterTgChatId,
        order.masterTgMessageId,
      ).catch(() => undefined);
    }
    await this.prisma.order.updateMany({
      where: { id: orderId },
      data: { masterTgChatId: null, masterTgMessageId: null },
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
    await this.clearEphemeral(chatId);

    let orders;
    try {
      orders = await this.myActiveOrders(telegramId);
    } catch {
      const res = await this.sendMessage(
        chatId,
        'Меню доступно только мастеру. Передайте ID администратору.',
      );
      this.trackEphemeral(chatId, this.tgMessageId(res));
      return;
    }

    if (!orders.length) {
      const res = await this.sendMessage(chatId, 'Нет активных заявок.', {
        reply_markup: this.masterReplyKeyboard(),
      });
      this.trackEphemeral(chatId, this.tgMessageId(res));
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

    const res = await this.sendMessage(
      chatId,
      `Активные заявки (${orders.length}). Выберите одну — откроется карточка со статусами.`,
      {
        reply_markup: {
          inline_keyboard: buttons,
        },
      },
    );
    this.trackEphemeral(chatId, this.tgMessageId(res));
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
      // Новая карточка из меню — старую удаляем, чтобы не копить экраны.
      if (order.masterTgChatId && order.masterTgMessageId != null) {
        await this.deleteMessage(
          order.masterTgChatId,
          order.masterTgMessageId,
        ).catch(() => undefined);
      }
      await this.sendMasterOrderCard(chatId, order);
    } catch {
      await this.sendMessage(chatId, 'Не удалось открыть заявку.');
    }
  }

  /** Кнопки следующего шага по текущему статусу. */
  buttonsForStatus(
    status: OrderStatus,
  ): { status: OrderStatus; label: string }[] {
    const next = STATUS_TRANSITIONS[status] ?? [];
    return next.map((s) => ({
      status: s,
      label: STATUS_BTN_LABEL[s] ?? STATUS_LABELS[s] ?? s,
    }));
  }

  private assertStatusTransition(from: OrderStatus, to: OrderStatus) {
    const allowed = STATUS_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      const fromL = STATUS_LABELS[from] ?? from;
      const toL = STATUS_LABELS[to] ?? to;
      throw new BadRequestException(
        `Нельзя перейти из «${fromL}» в «${toL}». Сначала выполните предыдущий шаг.`,
      );
    }
  }

  /** Обновить карточку заявки у мастера после смены статуса. */
  private async refreshMasterOrderCard(chatId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { client: true, payment: true, city: true },
    });
    if (!order) return;
    if (order.masterTgChatId && order.masterTgMessageId != null) {
      await this.deleteMessage(
        order.masterTgChatId,
        order.masterTgMessageId,
      ).catch(() => undefined);
    }
    if (ESCALATE_SKIP_STATUSES.includes(order.status)) {
      await this.sendMessage(
        chatId,
        `Заявка ${order.publicId} закрыта («${STATUS_LABELS[order.status] ?? order.status}»).`,
        { reply_markup: this.masterReplyKeyboard() },
      );
      await this.prisma.order.update({
        where: { id: orderId },
        data: { masterTgChatId: null, masterTgMessageId: null },
      });
      return;
    }
    await this.sendMasterOrderCard(chatId, order);
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
      payment?: {
        paid?: unknown;
        partsCost?: unknown;
      } | null;
    },
  ) {
    const paid = Number(order.payment?.paid ?? 0);
    const partsCost = Number(order.payment?.partsCost ?? 0);
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
    if (paid > 0 || partsCost > 0) {
      lines.push(`Оплата: ${paid.toLocaleString('ru-RU')} ₽`);
      lines.push(`Запчасти: ${partsCost.toLocaleString('ru-RU')} ₽`);
    }

    const statusBtns = this.buttonsForStatus(order.status).map((b) => ({
      text: b.label,
      callback_data: `s:${order.id}:${b.status}`,
    }));
    const statusRows: { text: string; callback_data: string }[][] = [];
    for (let i = 0; i < statusBtns.length; i += 2) {
      statusRows.push(statusBtns.slice(i, i + 2));
    }

    const isActive = MASTER_ACTIVE_STATUSES.includes(order.status);
    const rowExtra: { text: string; callback_data: string }[] = [];
    if (isActive) {
      rowExtra.push({ text: 'Суммы', callback_data: `ps:${order.id}` });
      rowExtra.push({ text: '+ Документ', callback_data: `xd:${order.id}` });
    }
    const rowNav = [{ text: '« К списку', callback_data: 'ml' }];

    const inline_keyboard = [
      ...statusRows,
      ...(rowExtra.length ? [rowExtra] : []),
      rowNav,
    ];

    const res = await this.sendMessage(chatId, lines.join('\n'), {
      reply_markup: { inline_keyboard },
    });
    const messageId = this.tgMessageId(res);
    if (messageId != null) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          masterTgChatId: chatId,
          masterTgMessageId: messageId,
        },
      });
    }
    return res;
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

    this.assertStatusTransition(order.status, status);

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
        where: { id: orderId, masterId: user.masterProfile!.id, status: order.status },
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

  private groupKey(kind='common') {
    if(!['common','owner','center'].includes(kind))throw new BadRequestException('Неизвестный чат');
    return kind==='common'?'bot.orders.group':'bot.orders.group.'+kind;
  }

  async getOrderGroup(kind='common'): Promise<{chatId: string; title: string} | null> {
    const value = await this.settings.get(this.groupKey(kind));
    return value ? JSON.parse(value) : null;
  }

  async getMasterGroup(masterId: string): Promise<{chatId:string;title:string}|null> {
    const value=await this.settings.get('bot.master.group.'+masterId);
    return value ? JSON.parse(value) : null;
  }

  async getOrderDestination(orderId: string) {
    const order=await this.prisma.order.findUnique({where:{id:orderId},select:{masterId:true,isPersonal:true,isServiceCenter:true}});
    if(order?.isServiceCenter)return this.getOrderGroup('center');
    if(order?.isPersonal || !order?.masterId)return this.getOrderGroup('owner');
    return (order?.masterId ? await this.getMasterGroup(order.masterId) : null) || await this.getOrderGroup();
  }

  async createMasterGroupLink(masterId: string) {
    const master=await this.prisma.master.findUnique({where:{id:masterId}});
    if(!master || master.status!=='ACTIVE')throw new BadRequestException('Мастер не активен');
    const config=await this.settings.getBotConfig();
    if(!config.hasToken || !config.enabled)throw new BadRequestException('Сначала включите бота');
    const bot=await this.settings.testBot();
    if(!bot.ok || !bot.username)throw new BadRequestException('Бот недоступен');
    const token=randomBytes(16).toString('hex');
    await this.settings.set('bot.master.group.bind.'+masterId,JSON.stringify({hash:createHash('sha256').update(token).digest('hex'),expires:Date.now()+86400000}));
    return {command:`/connect_master@${bot.username} ${masterId} ${token}`};
  }

  async disconnectMasterGroup(masterId:string) {
    await this.prisma.appSetting.deleteMany({where:{key:{in:['bot.master.group.'+masterId,'bot.master.group.bind.'+masterId]}}});
    return {ok:true};
  }

  async bindMasterGroup(masterId:string, token:string, chat:TgChat, senderId:string) {
    if(!['group','supergroup'].includes(chat.type || '') || !chat.id)throw new BadRequestException('Отправьте команду в группу мастера');
    const key='bot.master.group.bind.'+masterId;
    const row=await this.prisma.appSetting.findUnique({where:{key}});
    const data=row ? JSON.parse(row.value) : null;
    if(!data || data.expires<Date.now() || data.hash!==createHash('sha256').update(token).digest('hex'))throw new BadRequestException('Создайте новую команду в карточке мастера');
    const master=await this.prisma.master.findUnique({where:{id:masterId},include:{user:true}});
    if(!master || master.status!=='ACTIVE')throw new BadRequestException('Мастер не активен');
    const member=await this.telegram<{ok:boolean;result?:{status:string}}>('getChatMember',{chat_id:chat.id,user_id:Number(senderId)});
    if(!member?.ok || !['creator','administrator'].includes(member.result?.status || ''))throw new BadRequestException('Команду должен отправить администратор группы');
    const value=JSON.stringify({chatId:String(chat.id),title:chat.title || 'Группа мастера'});
    await this.prisma.$transaction(async tx=>{
      const used=await tx.appSetting.deleteMany({where:{key,value:row!.value}});
      if(used.count!==1)throw new BadRequestException('Команда уже использована');
      await tx.appSetting.upsert({where:{key:'bot.master.group.'+masterId},create:{key:'bot.master.group.'+masterId,value},update:{value}});
    });
    return master.user.fullName;
  }

  async createGroupLink(kind='common') {
    const key=this.groupKey(kind);
    const config = await this.settings.getBotConfig();
    if (!config.hasToken || !config.enabled) throw new BadRequestException('Сначала включите бота');
    const bot = await this.settings.testBot();
    if (!bot.ok || !bot.username) throw new BadRequestException('Бот недоступен');
    const code = randomBytes(16).toString('hex');
    await this.settings.set(key+'.bind', JSON.stringify({hash:createHash('sha256').update(code).digest('hex'),expires:Date.now()+24*60*60*1000}));
    return {command:`/connect_${kind==='common'?'group':kind}@${bot.username} ${code}`,username:bot.username};
  }

  async disconnectGroup(kind='common') {
    const key=this.groupKey(kind);
    await this.prisma.appSetting.deleteMany({where:{key:{in:[key,key+'.bind']}}});
    return {ok:true};
  }

  async bindOrderGroup(code: string, chat: TgChat, senderId: string, kind='common') {
    if (!['group','supergroup'].includes(chat.type || '') || !chat.id) throw new BadRequestException('Отправьте команду в нужную группу');
    if (!/^[a-f0-9]{32}$/.test(code)) throw new BadRequestException('Неверный код подключения');
    const destinationKey=this.groupKey(kind);
    const key = destinationKey+'.bind';
    const row = await this.prisma.appSetting.findUnique({where:{key}});
    if (!row) throw new BadRequestException('Создайте новую команду в CRM');
    const data = JSON.parse(row.value);
    if (data.expires < Date.now() || data.hash !== createHash('sha256').update(code).digest('hex')) throw new BadRequestException('Код истёк или недействителен');
    const member = await this.telegram<{ok:boolean;result?:{status:string}}>('getChatMember',{chat_id:chat.id,user_id:Number(senderId)});
    if (!member?.ok || !['creator','administrator'].includes(member.result?.status || '')) throw new BadRequestException('Команду должен отправить администратор группы. Бот тоже должен быть администратором');
    const value = JSON.stringify({chatId:String(chat.id),title:chat.title || 'Группа заявок'});
    await this.prisma.$transaction(async tx => {
      const consumed = await tx.appSetting.deleteMany({where:{key,value:row.value}});
      if (consumed.count !== 1) throw new BadRequestException('Код уже использован');
      await tx.appSetting.upsert({where:{key:destinationKey},create:{key:destinationKey,value},update:{value}});
    });
  }

  private async groupActor(order: {masterId:string|null;isPersonal:boolean;isServiceCenter:boolean}, telegramId:string) {
    if(order.isPersonal || order.isServiceCenter || !order.masterId){
      const owner=await this.prisma.user.findFirst({where:{telegramId,role:Role.OWNER,status:UserStatus.ACTIVE}});
      if(owner)return {id:owner.id,isOwner:true};
      const owners=await this.prisma.user.findMany({where:{role:Role.OWNER,status:UserStatus.ACTIVE},select:{id:true}});
      for(const account of owners){
        const grant=await this.settings.get('owner.partner.'+account.id);
        if(grant && JSON.parse(grant).telegramId===telegramId)return {id:account.id,isOwner:true};
      }
      if(order.isPersonal || !order.masterId)throw new BadRequestException('Нет доступа. В CRM откройте Telegram → Мой Telegram или Напарник, перейдите по своей ссылке и нажмите «Запустить»');
    }
    const user=await this.masterByTelegram(telegramId);
    if(user.masterProfile!.id!==order.masterId)throw new BadRequestException('Эта заявка назначена другому мастеру');
    return {id:user.id,isOwner:false};
  }

  private async groupFlowPrompt(flow: GroupFlow, replyTo?: number, error?: string) {
    const prompt = flow.kind==='close'
      ? 'Закрытие заявки. Ответьте двумя суммами: получено всего (включая предоплату) и расходы. Например: 11000 1000'
      : 'Укажите предоплату и срок ремонта. Например:\n5000 пред\nСрок 5-7 дней';
    const result = await this.sendMessage(flow.chatId,`<a href="tg://user?id=${flow.telegramId}">Введите суммы</a>\n${error ? error+'\n' : ''}${prompt}`,{
      parse_mode:'HTML',reply_markup:{force_reply:true,selective:true},
      ...(replyTo ? {reply_parameters:{message_id:replyTo}} : {}),
    });
    if (!result?.ok || !result.result?.message_id) throw new BadRequestException('Не удалось запросить суммы. Попробуйте ещё раз');
    await this.settings.set(`bot.flow.reply.${flow.chatId}.${result.result.message_id}`,JSON.stringify(flow));
  }

  private async beginGroupFlow(cq:TgCallbackQuery, kind:'close'|'sd') {
    const id=(cq.data || '').split(':')[1];
    const card=await this.groupOrderCard(id);
    await this.groupActor(card.order,String(cq.from!.id));
    if(kind==='sd' ? card.order.status!==OrderStatus.IN_PROGRESS : ![OrderStatus.IN_PROGRESS,OrderStatus.IN_PROGRESS_SD].includes(card.order.status as any)) throw new BadRequestException('Статус заявки изменился');
    await this.groupFlowPrompt({orderId:id,masterId:card.order.masterId,telegramId:String(cq.from!.id),chatId:String(cq.message!.chat!.id),messageId:cq.message!.message_id!,kind,expires:Date.now()+24*60*60*1000,version:card.order.updatedAt.toISOString()});
  }

  private async handleGroupFlowReply(msg:TgMessage):Promise<boolean> {
    const replyId=msg.reply_to_message?.message_id;
    if(!replyId || !msg.chat?.id || !msg.from?.id || !msg.text)return false;
    const key=`bot.flow.reply.${msg.chat.id}.${replyId}`;
    const raw=await this.settings.get(key);
    if(!raw)return false;
    const flow:GroupFlow=JSON.parse(raw);
    // A group member replying to someone else's prompt cannot hijack the session.
    if(flow.telegramId!==String(msg.from.id))return true;
    const consumePrompt=async()=>{
      const consumed=await this.prisma.appSetting.deleteMany({where:{key,value:raw}});
      if(consumed.count)await this.deleteMessage(flow.chatId,replyId).catch(()=>undefined);
    };
    try {
      const group=await this.getOrderDestination(flow.orderId);
      if(!group || group.chatId!==flow.chatId)throw new BadRequestException('Группа отключена');
      if(flow.expires<Date.now())throw new BadRequestException('Время ввода истекло. Нажмите кнопку заявки заново');
      const card=await this.groupOrderCard(flow.orderId);
      await this.groupActor(card.order,flow.telegramId);
      if(card.order.masterId!==flow.masterId || card.order.updatedAt.toISOString()!==flow.version)throw new BadRequestException('Заявка изменилась. Нажмите кнопку заявки заново');
      if(msg.text.trim().toLowerCase()==='отмена') {
        await consumePrompt();
        await this.sendMessage(flow.chatId,'Ввод отменён');return true;
      }
      let summary:string;
      if(flow.kind==='close') {
        let amounts:ReturnType<typeof parseClosingReply>;
        try{amounts=parseClosingReply(msg.text);}catch(e){await this.groupFlowPrompt(flow,msg.message_id,(e as Error).message);await consumePrompt();return true;}
        if(amounts.partsCost>amounts.paid || amounts.paid<Number(card.order.payment?.prepay || 0)) {
          await this.groupFlowPrompt(flow,msg.message_id,amounts.partsCost>amounts.paid?'Расходы не могут превышать оплату':'Общая оплата не может быть меньше предоплаты');
          await consumePrompt();return true;
        }
        const terms=await this.salary.termsFor(amounts.paid-amounts.partsCost,card.order.typeTech,flow.masterId);
        const ownWork=card.order.isPersonal || !card.order.masterId;
        const base=calcPayment(amounts.paid,amounts.partsCost,ownWork?0:terms.masterPct);
        const reinvestPct=card.order.isServiceCenter || ownWork?0.3:terms.reinvestPct;
        const reinvestAmount=Math.round(base.toCompany*reinvestPct*100)/100;
        Object.assign(flow,amounts,{calc:{...base,reinvestPct,reinvestAmount,ownerNet:Math.round((base.toCompany-reinvestAmount)*100)/100}});
        summary=`Закрыть заявку ${card.order.publicId}?\nПолучено всего: ${amounts.paid} ₽\nИз них предоплата: ${Number(card.order.payment?.prepay || 0)} ₽\nРасходы: ${amounts.partsCost} ₽\nМастеру: ${base.masterSalary} ₽` + (ownWork ? `\nНа Авито: ${reinvestAmount} ₽\nВладельцу: ${flow.calc!.ownerNet} ₽` : '');
      } else {
        let terms:ReturnType<typeof parseSdReply>;
        try{terms=parseSdReply(msg.text);}catch(e){await this.groupFlowPrompt(flow,msg.message_id,(e as Error).message);await consumePrompt();return true;}
        Object.assign(flow,terms,{sdStart:new Date().toISOString(),sdFrom:sdDeadline(terms.minDays).toISOString(),sdDue:sdDeadline(terms.maxDays).toISOString()});
        summary=`Сохранить срок заявки ${card.order.publicId}?\nПредоплата всего: ${terms.prepay} ₽\nСрок: ${terms.minDays}-${terms.maxDays} дней\nДо ${sdDeadline(terms.maxDays).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'})}`;
      }
      flow.inputMessageId=msg.message_id;
      const token=randomBytes(8).toString('hex');
      const confirmKey='bot.flow.confirm.'+token;
      await this.settings.set(confirmKey,JSON.stringify(flow));
      const sent=await this.sendMessage(flow.chatId,summary,{reply_markup:{inline_keyboard:[[{text:flow.kind==='close'?'Подтвердить закрытие':'Подтвердить срок',callback_data:'gf:'+token},{text:'Отмена',callback_data:'gx:'+token}]]}});
      if(!sent?.ok){await this.prisma.appSetting.deleteMany({where:{key:confirmKey}});throw new BadRequestException('Не удалось показать подтверждение. Ответьте ещё раз');}
      await consumePrompt();
    }catch(e){await this.sendMessage(flow.chatId,e instanceof BadRequestException || e instanceof NotFoundException?e.message:'Не удалось обработать ответ. Попробуйте ещё раз');}
    return true;
  }

  private async confirmGroupFlow(cq:TgCallbackQuery) {
    const answer=(text?:string)=>this.telegram('answerCallbackQuery',{callback_query_id:cq.id,...(text?{text,show_alert:true}:{})});
    try {
      const key='bot.flow.confirm.'+(cq.data || '').slice(3);
      const raw=await this.settings.get(key);
      if(!raw)throw new BadRequestException('Уже обработано или отменено');
      const flow:GroupFlow=JSON.parse(raw);
      const group=await this.getOrderDestination(flow.orderId);
      if(!group || group.chatId!==flow.chatId || String(cq.message?.chat?.id)!==flow.chatId || String(cq.from?.id)!==flow.telegramId)throw new BadRequestException('Подтвердить может только тот, кто ввёл суммы');
      if(cq.data?.startsWith('gx:')) {
        await this.prisma.appSetting.deleteMany({where:{key,value:raw}});
        await this.telegram('editMessageText',{chat_id:flow.chatId,message_id:cq.message?.message_id,text:'Отменено',reply_markup:{inline_keyboard:[]}});
        await answer();return;
      }
      if(flow.expires<Date.now())throw new BadRequestException('Подтверждение истекло. Нажмите кнопку заявки заново');
      const currentCard=await this.groupOrderCard(flow.orderId);
      const user=await this.groupActor(currentCard.order,flow.telegramId);
      await this.prisma.$transaction(async tx=>{
        const consumed=await tx.appSetting.deleteMany({where:{key,value:raw}});
        if(consumed.count!==1)throw new BadRequestException('Уже обработано');
        const current=await tx.order.findUnique({where:{id:flow.orderId},include:{payment:true}});
        if(!current || current.masterId!==flow.masterId || current.updatedAt.toISOString()!==flow.version)throw new BadRequestException('Заявка изменилась. Введите данные заново');
        if(flow.kind==='close' && (current.isPersonal || !current.masterId) && flow.calc?.reinvestPct!==0.3)throw new BadRequestException('Расчёт изменился на 30/70. Нажмите «Закрыть» и введите суммы заново');
        const allowed=flow.kind==='close'?[OrderStatus.IN_PROGRESS,OrderStatus.IN_PROGRESS_SD]:[OrderStatus.IN_PROGRESS];
        if(!allowed.includes(current.status as any))throw new BadRequestException('Статус уже изменился');
        const changed=await tx.order.updateMany({where:{id:flow.orderId,masterId:flow.masterId,status:current.status,updatedAt:current.updatedAt},data:flow.kind==='close'
          ?{isPersonal:!current.isServiceCenter && (current.isPersonal || !current.masterId),status:OrderStatus.DONE,completedAt:current.completedAt || new Date(),docsViaAdmin:false,notifyAckedAt:new Date()}
          :{status:OrderStatus.IN_PROGRESS_SD,sdStartedAt:new Date(flow.sdStart!),sdDueFrom:new Date(flow.sdFrom!),sdDueAt:new Date(flow.sdDue!),notifyAckedAt:new Date()}});
        if(changed.count!==1)throw new BadRequestException('Заявка изменилась. Введите данные заново');
        const payment=flow.kind==='close'?{paid:flow.paid!,partsCost:flow.partsCost!,partsYesNo:flow.partsCost!>0,...flow.calc!}:{prepay:flow.prepay!};
        await tx.orderPayment.upsert({where:{orderId:flow.orderId},create:{orderId:flow.orderId,...payment},update:payment});
        if(flow.kind==='close') {
          const cash=await tx.cashTx.findFirst({where:{orderId:flow.orderId,incomeBasis:CashIncomeBasis.ORDER},select:{id:true}});
          const data={amount:flow.calc!.toCompany,cityId:current.cityId || undefined,description:'Приход по заявке (чистыми)'};
          if(cash)await tx.cashTx.update({where:{id:cash.id},data});
          else await tx.cashTx.create({data:{...data,orderId:flow.orderId,direction:CashDirection.INCOME,incomeBasis:CashIncomeBasis.ORDER,createdById:user.id}});
        }
      });
      if(flow.kind==='close' && flow.inputMessageId)await this.deleteMessage(flow.chatId,flow.inputMessageId).catch(()=>undefined);
      if(flow.kind==='close')await this.settlements.syncForCompletedOrder(flow.orderId).catch(()=>undefined);
      const fresh=await this.groupOrderCard(flow.orderId);
      await this.rememberGroupCard(flow.orderId,flow.chatId,flow.messageId);
      await this.telegram('editMessageText',{chat_id:flow.chatId,message_id:flow.messageId,text:fresh.text,entities:fresh.entities,reply_markup:fresh.reply_markup});
      await this.telegram('editMessageText',{chat_id:flow.chatId,message_id:cq.message?.message_id,text:flow.kind==='close'?'Заявка закрыта':'Срок и предоплата сохранены',reply_markup:{inline_keyboard:[]}});
      await answer();
    }catch(e){await answer(e instanceof BadRequestException || e instanceof NotFoundException?e.message:'Не удалось сохранить. Попробуйте ещё раз');}
  }

  private async groupOrderCard(orderId: string) {
    const order = await this.prisma.order.findUnique({where:{id:orderId},include:{client:true,master:{include:{user:true}},payment:true}});
    if (!order) throw new NotFoundException('Заявка не найдена');
    const accepted = await this.settings.get('bot.orders.accepted.'+order.id) === (order.masterId || 'owner');
    const paid = Number(order.payment?.paid || 0);
    const partsCost = Number(order.payment?.partsCost || 0);
    const text = [
      'Заявка '+order.publicId,
      'ФИО: '+order.client.name,
      'Телефон: '+order.client.phoneNormalized.replace(/^\+?7/, '+7'),
      'Адрес: '+order.address,
      'Время: '+(order.scheduledAt ? order.scheduledAt.toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'не указано'),
      'Техника: '+(order.typeTech || 'не указана'),
      order.isPersonal || !order.masterId?'Исполнитель: владелец':'Мастер: '+(order.master?.user.fullName || 'не назначен'),
      order.isServiceCenter?'Привезут в СЦ':'',
      'Статус: '+(STATUS_LABELS[order.status] || order.status)+(accepted && [OrderStatus.WAITING,OrderStatus.NOT_SCHEDULED].includes(order.status as any) ? ' · принята' : ''),
      order.comment ? 'Примечание: '+order.comment : '',
      order.adminComment ? 'Комментарий: '+order.adminComment : '',
      order.status===OrderStatus.IN_PROGRESS_SD ? '🟠 СД · предоплата: '+Number(order.payment?.prepay || 0)+' ₽' : '',
      order.status===OrderStatus.IN_PROGRESS_SD && order.sdDueAt ? (order.sdDueAt.getTime()<Date.now()?'🔴 Срок истёк · ':'Срок: ')+(order.sdDueFrom?.toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'}) || '')+' - '+order.sdDueAt.toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'}) : '',
      order.isPersonal && order.payment && order.status===OrderStatus.DONE ? 'На Авито: '+Number(order.payment.reinvestAmount)+' ₽\nВладельцу: '+Number(order.payment.ownerNet)+' ₽' : '',
      order.status===OrderStatus.DONE ? 'Всего: '+paid+' ₽' : '',
      order.status===OrderStatus.DONE ? 'Чистыми: '+(paid-partsCost)+' ₽' : '',
    ].filter(Boolean).join('\n');
    const buttons: {text:string;callback_data:string}[] = [];
    if(order.isServiceCenter){
      if([OrderStatus.WAITING,OrderStatus.NOT_SCHEDULED,OrderStatus.ON_THE_WAY].includes(order.status as any))buttons.push({text:'Принять',callback_data:'ga:'+order.id});
      if(order.status===OrderStatus.IN_PROGRESS)buttons.push({text:'Указать срок',callback_data:`gs:${order.id}:IN_PROGRESS_SD`});
      if([OrderStatus.IN_PROGRESS,OrderStatus.IN_PROGRESS_SD].includes(order.status as any))buttons.push({text:'Закрыть',callback_data:`gs:${order.id}:DONE`});
    }else{
      if ([OrderStatus.WAITING,OrderStatus.NOT_SCHEDULED].includes(order.status as any)) buttons.push(accepted?{text:'Вышел',callback_data:`gs:${order.id}:ON_THE_WAY`}:{text:'Принять',callback_data:'ga:'+order.id});
      if(order.status===OrderStatus.ON_THE_WAY)buttons.push({text:'На адресе',callback_data:`gs:${order.id}:IN_PROGRESS`});
      if(order.status===OrderStatus.IN_PROGRESS)buttons.push({text:'СД',callback_data:`gs:${order.id}:IN_PROGRESS_SD`});
      if([OrderStatus.IN_PROGRESS,OrderStatus.IN_PROGRESS_SD].includes(order.status as any))buttons.push({text:'Закрыть',callback_data:`gs:${order.id}:DONE`});
    }
    const entities = [...text.matchAll(/^(Заявка|ФИО:|Телефон:|Адрес:|Время:|Техника:|Исполнитель:|Мастер:|Статус:|Примечание:|Комментарий:|На Авито:|Владельцу:|Всего:|Чистыми:|Срок:)/gm)].map(match => ({type:'bold',offset:match.index!,length:match[0].length}));
    return {order,text,entities,reply_markup:{inline_keyboard:buttons.length?[buttons]:[]}};
  }

  private async rememberGroupCard(orderId:string,chatId:string,messageId:number|undefined) {
    if(!messageId)return;
    await this.settings.set(`bot.card.${chatId}.${messageId}`,JSON.stringify({orderId,chatId,messageId}));
  }

  private async refreshGroupCard(msg:TgMessage) {
    const original=msg.reply_to_message;
    const publicId=/^Заявка (\S+)\n/.exec(original?.text || '')?.[1];
    if(!original?.message_id || !publicId || !msg.from?.id || !msg.chat?.id)throw new BadRequestException('Отправьте /refresh ответом на карточку заявки');
    const me=await this.telegram<{ok:boolean;result?:{id:number}}>('getMe',{});
    if(!me?.ok || !me.result || original.from?.id!==me.result.id)throw new BadRequestException('Выберите карточку, отправленную этим ботом');
    const order=await this.prisma.order.findUnique({where:{publicId}});
    if(!order)throw new NotFoundException('Заявка не найдена');
    const destination=await this.getOrderDestination(order.id);
    if(!destination || destination.chatId!==String(msg.chat.id))throw new BadRequestException('Заявка относится к другому чату');
    await this.groupActor(order,String(msg.from.id));
    const card=await this.groupOrderCard(order.id);
    const result=await this.telegram<{ok:boolean;description?:string}>('editMessageText',{chat_id:destination.chatId,message_id:original.message_id,text:card.text,entities:card.entities,reply_markup:card.reply_markup});
    if(!result?.ok && !result?.description?.includes('message is not modified'))throw new BadRequestException('Telegram не разрешил обновить карточку');
    await this.rememberGroupCard(order.id,destination.chatId,original.message_id);
  }

  async sendOrderToGroup(orderId: string, masterOnly = false) {
    const config = await this.settings.getBotConfig();
    if (!config.enabled || !config.hasToken) throw new BadRequestException('Бот выключен');
    const card = await this.groupOrderCard(orderId);
    const special=card.order.isPersonal || card.order.isServiceCenter || !card.order.masterId;
    const group = masterOnly && !special ? await this.getMasterGroup(card.order.masterId!) : await this.getOrderDestination(orderId);
    if (!group) throw new BadRequestException(card.order.isServiceCenter?'Подключите чат СЦ в разделе Telegram':card.order.isPersonal || !card.order.masterId?'Подключите «Мой чат» в разделе Telegram':'Подключите группу в карточке назначенного мастера');
    const result = await this.sendMessage(group.chatId,card.text,{entities:card.entities,reply_markup:card.reply_markup});
    if(result?.ok)await this.rememberGroupCard(orderId,group.chatId,result.result?.message_id);
    return {sent:!!result?.ok};
  }

  private async handleGroupAction(cq: TgCallbackQuery) {
    if (/^(gf|gx):/.test(cq.data || '')) { await this.confirmGroupFlow(cq); return; }
    const answer = (text?:string) => this.telegram('answerCallbackQuery',{callback_query_id:cq.id,...(text?{text,show_alert:true}:{})});
    try {
      const match = /^(ga|gs):([a-z0-9-]+)(?::([A-Z_]+))?$/.exec(cq.data || '');
      if (!match || !cq.from?.id) throw new BadRequestException('Некорректное действие');
      const group = await this.getOrderDestination(match[2]);
      if (!group || String(cq.message?.chat?.id)!==group.chatId) throw new BadRequestException('Эта группа больше не подключена к заявке');
      const card = await this.groupOrderCard(match[2]);
      const user = await this.groupActor(card.order,String(cq.from.id));
      if (match[1]==='ga') {
        if (!(card.order.isServiceCenter?[OrderStatus.WAITING,OrderStatus.NOT_SCHEDULED,OrderStatus.ON_THE_WAY]:[OrderStatus.WAITING,OrderStatus.NOT_SCHEDULED]).includes(card.order.status as any)) throw new BadRequestException('Статус уже изменился');
        const changed = await this.prisma.order.updateMany({where:{id:card.order.id,masterId:card.order.masterId,status:card.order.status,...(card.order.isServiceCenter?{updatedAt:card.order.updatedAt}:{notifyAckedAt:null})},data:{notifyAckedAt:new Date(),...(card.order.isServiceCenter?{status:OrderStatus.IN_PROGRESS}:{})}});
        if (!changed.count && (card.order.isServiceCenter || !card.order.notifyAckedAt)) throw new BadRequestException('Заявка изменилась. Обновите карточку');
        await this.settings.set('bot.orders.accepted.'+card.order.id,card.order.masterId || 'owner');
      } else {
        const status = match[3] as OrderStatus;
        if(card.order.isServiceCenter && [OrderStatus.ON_THE_WAY,OrderStatus.IN_PROGRESS].includes(status as any))throw new BadRequestException('Для СЦ выездные этапы не нужны. Отправьте карточку заново и нажмите «Принять»');
        if (![OrderStatus.ON_THE_WAY,OrderStatus.IN_PROGRESS,OrderStatus.IN_PROGRESS_SD,OrderStatus.DONE].includes(status as any)) throw new BadRequestException('Недопустимый статус');
        if(status===OrderStatus.ON_THE_WAY && await this.settings.get('bot.orders.accepted.'+card.order.id)!==(card.order.masterId || 'owner')) throw new BadRequestException('Сначала примите заявку');
        if(status===OrderStatus.DONE || status===OrderStatus.IN_PROGRESS_SD){await this.beginGroupFlow(cq,status===OrderStatus.DONE?'close':'sd');await answer();return;}
        if(user.isOwner){
          this.assertStatusTransition(card.order.status,status);
          const changed=await this.prisma.order.updateMany({where:{id:card.order.id,masterId:card.order.masterId,status:card.order.status,updatedAt:card.order.updatedAt},data:{status,notifyAckedAt:new Date()}});
          if(changed.count!==1)throw new BadRequestException('Заявка изменилась. Обновите карточку');
        }else await this.setStatus(String(cq.from.id),card.order.id,status,true);
      }
      const fresh = await this.groupOrderCard(card.order.id);
      await this.rememberGroupCard(card.order.id,group.chatId,cq.message?.message_id);
      const edited = await this.telegram<{ok:boolean}>('editMessageText',{chat_id:group.chatId,message_id:cq.message?.message_id,text:fresh.text,entities:fresh.entities,reply_markup:fresh.reply_markup});
      await answer(edited?.ok ? undefined : 'Сохранено в CRM. Сообщение не обновилось - отправьте заявку в группу заново');
    } catch(e) {
      await answer(e instanceof BadRequestException || e instanceof NotFoundException ? e.message : 'Не удалось изменить статус. Подключите Telegram в карточке назначенного мастера и попробуйте снова');
    }
  }

  async ownerConnection(userId:string) {
    const user=await this.prisma.user.findUnique({where:{id:userId}});
    return {connected:!!user?.telegramId,partnerConnected:!!await this.settings.get('owner.partner.'+userId)};
  }

  async createOwnerLink(userId:string) {
    const user=await this.prisma.user.findUnique({where:{id:userId}});
    if(!user || user.role!==Role.OWNER || user.status!==UserStatus.ACTIVE)throw new BadRequestException('Владелец не найден');
    const bot=await this.settings.testBot();
    if(!bot.ok || !bot.username)throw new BadRequestException('Бот недоступен');
    const token=randomBytes(16).toString('hex');
    await this.settings.set('owner.bind.'+userId,JSON.stringify({hash:createHash('sha256').update(token).digest('hex'),expires:Date.now()+86400000}));
    return {url:`https://t.me/${bot.username}?start=o_${userId}_${token}`};
  }

  async bindOwner(payload:string,telegramId:string,chatId:string) {
    if(chatId!==telegramId)throw new BadRequestException('Откройте ссылку в личном чате с ботом');
    const match=/^o_([a-z0-9]+)_([a-f0-9]{32})$/.exec(payload);
    if(!match)throw new BadRequestException('Некорректная ссылка');
    const key='owner.bind.'+match[1];
    await this.prisma.$transaction(async tx=>{
      const row=await tx.appSetting.findUnique({where:{key}});
      if(!row)throw new BadRequestException('Ссылка использована или отозвана');
      const data=JSON.parse(row.value);
      if(data.expires<Date.now() || data.hash!==createHash('sha256').update(match[2]).digest('hex'))throw new BadRequestException('Ссылка истекла или недействительна');
      const owner=await tx.user.findUnique({where:{id:match[1]}});
      if(!owner || owner.role!==Role.OWNER || owner.status!==UserStatus.ACTIVE)throw new BadRequestException('Владелец не активен');
      if(await tx.user.findFirst({where:{telegramId,id:{not:owner.id},role:{not:Role.MASTER}}}))throw new BadRequestException('Этот Telegram привязан к другому аккаунту владельца или сотрудника');
      const consumed=await tx.appSetting.deleteMany({where:{key,value:row.value}});
      if(consumed.count!==1)throw new BadRequestException('Ссылка уже использована');
      await tx.user.update({where:{id:owner.id},data:{telegramId}});
    });
  }

  async createPartnerLink(userId:string) {
    const user=await this.prisma.user.findUnique({where:{id:userId}});
    if(!user || user.role!==Role.OWNER || user.status!==UserStatus.ACTIVE)throw new BadRequestException('Владелец не найден');
    const bot=await this.settings.testBot();
    if(!bot.ok || !bot.username)throw new BadRequestException('Бот недоступен');
    const token=randomBytes(16).toString('hex');
    await this.settings.set('partner.bind.'+userId,JSON.stringify({hash:createHash('sha256').update(token).digest('hex'),expires:Date.now()+86400000}));
    return {url:`https://t.me/${bot.username}?start=p_${userId}_${token}`};
  }

  async disconnectPartner(userId:string) {
    await this.prisma.appSetting.deleteMany({where:{key:{in:['partner.bind.'+userId,'owner.partner.'+userId]}}});
    return {ok:true};
  }

  async bindPartner(payload:string,telegramId:string,chatId:string) {
    if(chatId!==telegramId)throw new BadRequestException('Откройте ссылку в личном чате с ботом');
    const match=/^p_([a-z0-9]+)_([a-f0-9]{32})$/.exec(payload);
    if(!match)throw new BadRequestException('Некорректная ссылка');
    const key='partner.bind.'+match[1];
    await this.prisma.$transaction(async tx=>{
      const row=await tx.appSetting.findUnique({where:{key}});
      if(!row)throw new BadRequestException('Ссылка использована или отозвана');
      const data=JSON.parse(row.value);
      if(data.expires<Date.now() || data.hash!==createHash('sha256').update(match[2]).digest('hex'))throw new BadRequestException('Ссылка истекла или недействительна');
      const owner=await tx.user.findUnique({where:{id:match[1]}});
      if(!owner || owner.role!==Role.OWNER || owner.status!==UserStatus.ACTIVE)throw new BadRequestException('Владелец не активен');
      const consumed=await tx.appSetting.deleteMany({where:{key,value:row.value}});
      if(consumed.count!==1)throw new BadRequestException('Ссылка уже использована');
      const value=JSON.stringify({telegramId});
      await tx.appSetting.upsert({where:{key:'owner.partner.'+owner.id},create:{key:'owner.partner.'+owner.id,value},update:{value}});
    });
  }

  async createMasterLink(id: string) {
    const master = await this.prisma.master.findUnique({where:{id}});
    if (!master || master.status !== 'ACTIVE') throw new BadRequestException('Мастер не активен');
    const config = await this.settings.getBotConfig();
    if (!config.hasToken || !config.enabled) throw new BadRequestException('Сначала подключите и включите бота в настройках Telegram');
    const test = await this.settings.testBot();
    if (!test.ok || !test.username) throw new BadRequestException('Бот недоступен. Проверьте токен в настройках Telegram');
    const token = randomBytes(16).toString('hex');
    const value = JSON.stringify({hash:createHash('sha256').update(token).digest('hex'),expires:Date.now()+24*60*60*1000});
    await this.settings.set('master.bind.'+id,value);
    return {url:'https://t.me/'+test.username+'?start=m_'+id+'_'+token};
  }

  async bindMaster(payload: string, telegramId: string, chatId: string) {
    if (chatId !== telegramId) throw new BadRequestException('Откройте ссылку в личном чате с ботом');
    const match = /^m_([a-z0-9]+)_([a-f0-9]{32})$/.exec(payload);
    if (!match) throw new BadRequestException('Некорректная ссылка');
    const key = 'master.bind.'+match[1];
    await this.prisma.$transaction(async tx=>{
      const row = await tx.appSetting.findUnique({where:{key}});
      if (!row) throw new BadRequestException('Ссылка использована или отозвана');
      const data = JSON.parse(row.value);
      if (data.expires < Date.now() || data.hash !== createHash('sha256').update(match[2]).digest('hex')) throw new BadRequestException('Ссылка истекла или недействительна');
      const master = await tx.master.findUnique({where:{id:match[1]},include:{user:true}});
      if (!master || master.status !== 'ACTIVE') throw new BadRequestException('Мастер не активен');
      const other = await tx.user.findFirst({where:{telegramId,id:{not:master.userId}}});
      if (other) throw new BadRequestException('Этот Telegram уже привязан к другой анкете');
      const consumed = await tx.appSetting.deleteMany({where:{key,value:row.value}});
      if (consumed.count !== 1) throw new BadRequestException('Ссылка уже использована');
      await tx.user.update({where:{id:master.userId},data:{telegramId}});
    });
  }

  async sendAssignedOrder(id: string) {
    const order = await this.prisma.order.findUnique({where:{id}});
    if (!order?.masterId || order.isPersonal) throw new BadRequestException('Назначьте мастера в обычной заявке');
    const result = await this.notifyMasterOrder(order.masterId,id);
    return {sent:!!result?.ok,groupSent:result?.groupSent};
  }

  /** Отправка назначенной заявки в личный чат мастера. */
  async notifyMasterOrder(masterId: string, orderId: string, resetAcceptance = false) {
    if (resetAcceptance) await this.prisma.appSetting.deleteMany({where:{key:'bot.orders.accepted.'+orderId}});
    const config = await this.settings.getBotConfig();
    if (!config.hasToken || !config.enabled) return null;
    const master = await this.prisma.master.findUnique({
      where: { id: masterId },
      include: { user: true },
    });
    if (!master) {
      throw new NotFoundException('Мастер не найден');
    }
    const telegramId = master.user.telegramId;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { client: true, payment: true, city: true },
    });
    if (!order) {
      throw new NotFoundException('Заявка не найдена');
    }

    if (order.masterId !== masterId) return null;
    if(order.isPersonal || order.isServiceCenter){const sent=await this.sendOrderToGroup(orderId);return {ok:sent.sent,groupSent:sent.sent};}
    const {text,entities} = await this.groupOrderCard(orderId);

    if (await this.getMasterGroup(masterId)) {
      const result=await this.sendOrderToGroup(orderId,true);
      return {ok:result.sent,groupSent:result.sent};
    }
    const group = await this.getOrderGroup();
    // Each destination is independent: a missing private chat must not suppress the group copy.
    let groupSent: boolean | undefined;
    if (group) { try { groupSent = (await this.sendOrderToGroup(orderId)).sent; } catch { groupSent = false; } }
    let sent: Awaited<ReturnType<BotService['sendMessage']>> = null;
    if (telegramId) {
      await this.clearMasterOrderCard(orderId);
      sent = await this.sendMessage(telegramId,text,{entities});
    }
    if (sent?.ok && sent.result?.message_id) await this.prisma.order.update({where:{id:orderId},data:{masterTgChatId:telegramId,masterTgMessageId:sent.result.message_id}});
    return {...sent,ok:!!sent?.ok,groupSent};
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

  /**
   * Старому мастеру при переназначении / снятии: удаляем карточку в Telegram.
   * (publicId/address оставлены для совместимости вызовов.)
   */
  async notifyMasterOrderRevoked(
    _masterId: string,
    _publicId: string,
    _address?: string | null,
    orderId?: string,
  ) {
    if (!orderId) return null;
    await this.clearMasterOrderCard(orderId);
    return null;
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

    const masterName = order.master?.user.fullName ?? 'мастер';
    const chatText = [
      `📎 Заявка ${order.publicId}`,
      `Мастер ${masterName} просит загрузить документы через администратора и закрыть заявку.`,
      `Клиент: ${order.client.name}`,
      `Адрес: ${order.address}`,
      `Мастер может прислать все фото пачкой — разложите типы в карточке заявки.`,
    ].join('\n');

    const masterTg = order.master?.user.telegramId;
    if (masterTg) {
      await this.incomingMessage(masterTg, chatText, masterName).catch(
        () => undefined,
      );
    }

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

    return Promise.allSettled(
      admins.map((a) => this.sendMessage(a.telegramId as string, chatText)),
    );
  }

  /** Публичный webhook Telegram (опционально): проверка секрета + разбор Update. */
  async handleWebhook(secret: string, update: TgUpdate) {
    const expected = await this.settings.getWebhookSecret();
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Неверный webhook secret');
    }
    await this.processUpdate(update);
    return { ok: true };
  }

  /** Общая обработка апдейта (webhook или getUpdates). */
  async processUpdate(update: TgUpdate) {
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    const msg = update.message;
    if (!msg?.chat?.id) return;

    const chatId = String(msg.chat.id);
    const telegramId =
      msg.from?.id != null ? String(msg.from.id) : chatId;

    if(['group','supergroup'].includes(msg.chat?.type || '') && /^\/refresh(?:@\w+)?$/i.test(msg.text?.trim() || '')){
      try{await this.refreshGroupCard(msg);}catch(e){await this.sendMessage(chatId,e instanceof BadRequestException || e instanceof NotFoundException?e.message:'Не удалось обновить карточку');}
      return;
    }
    const masterGroupCommand = /^\/connect_master(?:@\w+)?\s+([a-z0-9-]+)\s+([a-f0-9]{32})$/i.exec(msg.text?.trim() || '');
    if(masterGroupCommand){
      try{const name=await this.bindMasterGroup(masterGroupCommand[1],masterGroupCommand[2],msg.chat!,telegramId);await this.sendMessage(chatId,'Группа подключена к мастеру: '+name+'. Его заявки будут приходить сюда.');}
      catch(e){await this.sendMessage(chatId,e instanceof BadRequestException?e.message:'Не удалось подключить группу');}
      return;
    }
    const destinationCommand=/^\/connect_(owner|center)(?:@\w+)?\s+(\S+)$/i.exec(msg.text?.trim() || '');
    if(destinationCommand){
      try{await this.bindOrderGroup(destinationCommand[2],msg.chat!,telegramId,destinationCommand[1].toLowerCase());await this.sendMessage(chatId,destinationCommand[1].toLowerCase()==='owner'?'Чат личных заявок подключён':'Чат СЦ подключён');}
      catch(e){await this.sendMessage(chatId,e instanceof BadRequestException?e.message:'Не удалось подключить чат');}
      return;
    }
    const groupCommand = /^\/connect_group(?:@\w+)?\s+(\S+)$/i.exec(msg.text?.trim() || '');
    if (groupCommand) {
      try {
        await this.bindOrderGroup(groupCommand[1], msg.chat!, telegramId);
        await this.sendMessage(chatId,'Группа подключена. После назначения мастера заявки будут дублироваться сюда.');
      } catch (e) {
        await this.sendMessage(chatId,e instanceof BadRequestException ? e.message : 'Не удалось подключить группу');
      }
      return;
    }
    if (msg.chat?.type === 'group' || msg.chat?.type === 'supergroup') { await this.handleGroupFlowReply(msg); return; }

    if (msg.photo?.length || msg.document) {
      await this.handleIncomingFile(telegramId, chatId, msg);
      return;
    }

    if (!msg.text) return;

    const text = msg.text.trim();
    if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
      const payload = text.split(/\s+/)[1];
      if(payload?.startsWith('p_')){
        try{await this.bindPartner(payload,telegramId,chatId);await this.sendMessage(chatId,'Вы подключены как напарник. Можно принимать и закрывать заявки в чате владельца и чате СЦ.');}
        catch(e){await this.sendMessage(chatId,e instanceof BadRequestException?e.message:'Не удалось подключить Telegram');}
        return;
      }
      if(payload?.startsWith('o_')){
        try{await this.bindOwner(payload,telegramId,chatId);await this.sendMessage(chatId,'Telegram владельца подключён. Вы можете управлять заявками в своём чате и чате СЦ.');}
        catch(e){await this.sendMessage(chatId,e instanceof BadRequestException?e.message:'Не удалось подключить Telegram');}
        return;
      }
      if (payload?.startsWith('m_')) {
        try { await this.bindMaster(payload,telegramId,chatId); await this.sendMessage(chatId,'Telegram подключён. Новые назначенные заявки будут приходить сюда автоматически.'); }
        catch(e) { await this.sendMessage(chatId,e instanceof BadRequestException?e.message:'Не удалось подключить Telegram. Попросите владельца выдать новую ссылку.'); }
        return;
      }
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
      return;
    }

    if (await this.handlePayText(telegramId, chatId, text)) {
      return;
    }

    if (text === MASTER_BTN_ACTIVE || /^\/orders(?:@\w+)?$/i.test(text)) {
      await this.sendActiveOrdersMenu(chatId, telegramId);
      return;
    }

    if (text === MASTER_BTN_PAY || /^\/pay(?:@\w+)?$/i.test(text)) {
      await this.clearEphemeral(chatId);
      try {
        const info = await this.aboutMe(telegramId);
        const res = await this.sendMessage(
          chatId,
          [
            `Начислено ЗП: ${info.salaryMonth.toLocaleString('ru-RU')} ₽`,
            `Штрафы: ${info.fines.toLocaleString('ru-RU')} ₽`,
            `К получению (ЗП − штрафы): ${info.salaryNet.toLocaleString('ru-RU')} ₽`,
            `Закрыто заявок: ${info.ordersCount}`,
          ].join('\n'),
          { reply_markup: this.masterReplyKeyboard() },
        );
        this.trackEphemeral(chatId, this.tgMessageId(res));
      } catch {
        const res = await this.sendMessage(chatId, 'Доступно только мастеру.');
        this.trackEphemeral(chatId, this.tgMessageId(res));
      }
      return;
    }

    const from = msg.from;
    const title =
      from?.username || from?.first_name || String(msg.chat.id);
    await this.incomingMessage(chatId, text, title);
  }

  private parseMoney(text: string): number | null {
    const normalized = text
      .trim()
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.]/g, '');
    if (!normalized) return null;
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }

  private async startPaySession(
    chatId: string,
    telegramId: string,
    orderId: string,
    resumeStatus?: OrderStatus,
  ) {
    this.docSessions.delete(telegramId);
    this.paySessions.set(telegramId, {
      orderId,
      step: 'paid',
      resumeStatus,
    });
    await this.clearEphemeral(chatId);
    const res = await this.sendMessage(
      chatId,
      resumeStatus === OrderStatus.DONE
        ? 'Перед закрытием укажите сумму оплаты от клиента (₽):'
        : 'Сумма оплаты от клиента (₽):',
    );
    this.trackEphemeral(chatId, this.tgMessageId(res));
  }

  /** true — сообщение обработано как ввод сумм. */
  private async handlePayText(
    telegramId: string,
    chatId: string,
    text: string,
  ): Promise<boolean> {
    const session = this.paySessions.get(telegramId);
    if (!session) return false;

    if (/^\/cancel$/i.test(text.trim()) || text.trim() === 'Отмена') {
      this.paySessions.delete(telegramId);
      await this.sendMessage(chatId, 'Ввод сумм отменён.');
      return true;
    }

    const amount = this.parseMoney(text);
    if (amount == null) {
      await this.sendMessage(
        chatId,
        'Введите число, например 4500 или 0. Для отмены — «Отмена».',
      );
      return true;
    }

    if (session.step === 'paid') {
      this.paySessions.set(telegramId, {
        ...session,
        step: 'parts',
        paid: amount,
      });
      await this.clearEphemeral(chatId);
      const res = await this.sendMessage(
        chatId,
        'Сумма запчастей / расходов (₽). Если нет — напишите 0:',
      );
      this.trackEphemeral(chatId, this.tgMessageId(res));
      return true;
    }

    const paid = session.paid ?? 0;
    const partsCost = amount;
    try {
      await this.saveMasterPayment(telegramId, session.orderId, paid, partsCost);
    } catch (e) {
      const msg =
        e instanceof BadRequestException || e instanceof NotFoundException
          ? String(
              (e.getResponse() as { message?: string | string[] })?.message ??
                e.message,
            )
          : 'Не удалось сохранить суммы';
      await this.sendMessage(
        chatId,
        Array.isArray(msg) ? msg.join('; ') : msg,
      );
      return true;
    }

    const resume = session.resumeStatus;
    this.paySessions.delete(telegramId);
    await this.clearEphemeral(chatId);
    await this.sendMessage(
      chatId,
      `Сохранено: оплата ${paid.toLocaleString('ru-RU')} ₽, запчасти ${partsCost.toLocaleString('ru-RU')} ₽.`,
    );

    if (resume === OrderStatus.DONE || resume === OrderStatus.IN_PROGRESS_SD) {
      const missing = await this.documents.missingKindsForStatus(
        session.orderId,
        resume,
      );
      if (missing.length) {
        await this.requestMissingDocuments(
          chatId,
          telegramId,
          session.orderId,
          missing,
          resume,
        );
        return true;
      }
      try {
        await this.setStatus(telegramId, session.orderId, resume, true);
        await this.sendMessage(
          chatId,
          `Статус обновлён: ${STATUS_LABELS[resume] ?? resume}`,
        );
      } catch (e) {
        const msg =
          e instanceof BadRequestException || e instanceof NotFoundException
            ? String(
                (e.getResponse() as { message?: string | string[] })?.message ??
                  e.message,
              )
            : 'Не удалось сменить статус';
        await this.sendMessage(
          chatId,
          Array.isArray(msg) ? msg.join('; ') : msg,
        );
      }
    }

    await this.refreshMasterOrderCard(chatId, session.orderId);
    return true;
  }

  async saveMasterPayment(
    telegramId: string,
    orderId: string,
    paid: number,
    partsCost: number,
  ) {
    const user = await this.masterByTelegram(telegramId);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, master: { include: { user: true } } },
    });
    if (!order || order.masterId !== user.masterProfile!.id) {
      throw new NotFoundException('Заявка не найдена у мастера');
    }
    if (ESCALATE_SKIP_STATUSES.includes(order.status)) {
      throw new BadRequestException('Заявка уже закрыта');
    }
    if (paid < 0 || partsCost < 0) {
      throw new BadRequestException('Суммы не могут быть отрицательными');
    }
    if (partsCost > paid) {
      throw new BadRequestException('Запчасти не могут быть больше оплаты');
    }

    const masterPct = await this.salary.percentFor(paid - partsCost);
    const calc = calcPayment(paid, partsCost, masterPct);
    await this.prisma.orderPayment.upsert({
      where: { orderId },
      create: {
        orderId,
        paid,
        partsCost,
        partsYesNo: partsCost > 0,
        workSum: calc.workSum,
        masterPct: calc.masterPct,
        masterSalary: calc.masterSalary,
        toCompany: calc.toCompany,
      },
      update: {
        paid,
        partsCost,
        partsYesNo: partsCost > 0,
        workSum: calc.workSum,
        masterPct: calc.masterPct,
        masterSalary: calc.masterSalary,
        toCompany: calc.toCompany,
      },
    });

    const masterName = order.master?.user.fullName ?? 'мастер';
    await this.incomingMessage(
      telegramId,
      [
        `💰 Заявка ${order.publicId}`,
        `Мастер ${masterName} указал суммы:`,
        `Оплата: ${paid.toLocaleString('ru-RU')} ₽`,
        `Запчасти: ${partsCost.toLocaleString('ru-RU')} ₽`,
      ].join('\n'),
      masterName,
    ).catch(() => undefined);
  }

  private async requestMissingDocuments(
    chatId: string,
    telegramId: string,
    orderId: string,
    missing: DocKind[],
    targetStatus: OrderStatus = OrderStatus.DONE,
  ) {
    if (!missing.length) return;
    const kind = missing[0];
    this.docSessions.set(telegramId, {
      orderId,
      expectedKind: kind,
      targetStatus,
    });
    await this.clearEphemeral(chatId);
    const statusLabel = STATUS_LABELS[targetStatus] ?? targetStatus;
    const intro = await this.sendMessage(
      chatId,
      `Для «${statusLabel}» нужен документ. Пришлите фото или PDF — по одному файлу за раз.`,
    );
    this.trackEphemeral(chatId, this.tgMessageId(intro));
    await this.sendDocKindPrompt(chatId, orderId, kind);
  }

  /** Если для целевого статуса хватает файлов — сразу ставим статус. */
  private async tryApplyStatusAfterDocs(
    chatId: string,
    telegramId: string,
    orderId: string,
    targetStatus: OrderStatus | null,
  ): Promise<boolean> {
    if (!targetStatus) return false;
    const missing = await this.documents.missingKindsForStatus(
      orderId,
      targetStatus,
    );
    if (missing.length) return false;
    try {
      await this.setStatus(telegramId, orderId, targetStatus, true);
      this.docSessions.delete(telegramId);
      await this.clearEphemeral(chatId);
      await this.sendMessage(
        chatId,
        `Статус обновлён: ${STATUS_LABELS[targetStatus] ?? targetStatus}`,
      );
      await this.refreshMasterOrderCard(chatId, orderId);
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

  private async sendDocKindPrompt(
    chatId: string,
    orderId: string,
    kind: DocKind,
  ) {
    const res = await this.sendMessage(
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
                text: 'Через администратора',
                callback_data: `ad:${orderId}`,
              },
            ],
          ],
        },
      },
    );
    this.trackEphemeral(chatId, this.tgMessageId(res));
    return res;
  }

  private async sendExtraDocMenu(chatId: string, orderId: string) {
    await this.clearEphemeral(chatId);
    const rows = EXTRA_DOC_KINDS.map((kind) => [
      {
        text: DOC_KIND_TG[kind],
        callback_data: `xk:${orderId}:${kind}`,
      },
    ]);
    rows.push([{ text: 'Отмена', callback_data: `xf:${orderId}` }]);
    const res = await this.sendMessage(
      chatId,
      'Какой документ загрузить? (без смены статуса)',
      { reply_markup: { inline_keyboard: rows } },
    );
    this.trackEphemeral(chatId, this.tgMessageId(res));
  }

  /** Активная заявка с docsViaAdmin — продолжить приём фото после рестарта бота. */
  private async resolveViaAdminDumpOrder(telegramId: string) {
    const user = await this.masterByTelegram(telegramId);
    return this.prisma.order.findFirst({
      where: {
        masterId: user.masterProfile!.id,
        docsViaAdmin: true,
        status: { in: MASTER_ACTIVE_STATUSES },
      },
      include: { master: { include: { user: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async handleIncomingFile(
    telegramId: string,
    chatId: string,
    msg: TgMessage,
  ) {
    let session = this.docSessions.get(telegramId);
    if (!session) {
      try {
        const viaOrder = await this.resolveViaAdminDumpOrder(telegramId);
        if (viaOrder) {
          session = {
            orderId: viaOrder.id,
            expectedKind: DocKind.OTHER,
            targetStatus: null,
            viaAdminDump: true,
          };
          this.docSessions.set(telegramId, session);
        }
      } catch {
        /* мастер не найден — ниже */
      }
    }

    if (!session) {
      await this.sendMessage(
        chatId,
        'Откройте заявку и нажмите нужный статус или «+ Документ», затем пришлите файл.',
      );
      return;
    }

    let masterUserId: string;
    try {
      const user = await this.masterByTelegram(telegramId);
      masterUserId = user.id;
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

    let uploadResult: { created: Array<{ fileName: string }>; skipped: number };
    try {
      const file = await this.downloadTgFile(msg);
      uploadResult = await this.documents.uploadMany(
        session.orderId,
        session.viaAdminDump ? DocKind.OTHER : session.expectedKind,
        [file],
        masterUserId,
        session.viaAdminDump || session.extraOnly
          ? null
          : session.targetStatus,
        session.viaAdminDump ? { pendingReview: true } : undefined,
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

    if (session.viaAdminDump) {
      const fileName = uploadResult.created[0]?.fileName ?? 'файл';
      await this.incomingMessage(
        telegramId,
        `📷 Файл к заявке ${order.publicId}: ${fileName}`,
        order.master?.user.fullName,
      ).catch(() => undefined);
      await this.clearEphemeral(chatId);
      const res = await this.sendMessage(
        chatId,
        `Принято (${fileName}). Можете прислать ещё фото или нажать «Готово».`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Готово', callback_data: `ag:${session.orderId}` }],
            ],
          },
        },
      );
      this.trackEphemeral(chatId, this.tgMessageId(res));
      return;
    }

    if (session.extraOnly || !session.targetStatus) {
      await this.clearEphemeral(chatId);
      const res = await this.sendMessage(
        chatId,
        `Принято: «${DOC_KIND_TG[session.expectedKind]}». Загрузить ещё?`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Ещё документ', callback_data: `xe:${session.orderId}` },
                { text: 'Готово', callback_data: `xf:${session.orderId}` },
              ],
            ],
          },
        },
      );
      this.trackEphemeral(chatId, this.tgMessageId(res));
      this.docSessions.delete(telegramId);
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
      await this.clearEphemeral(chatId);
      const ack = await this.sendMessage(
        chatId,
        `Принято: «${DOC_KIND_TG[session.expectedKind]}».`,
      );
      this.trackEphemeral(chatId, this.tgMessageId(ack));
      await this.sendDocKindPrompt(chatId, session.orderId, missing[0]);
      return;
    }

    const more = await this.sendMessage(
      chatId,
      `Принято: «${DOC_KIND_TG[session.expectedKind]}». Можно прислать ещё файлы этого типа или нажать «Далее».`,
    );
    this.trackEphemeral(chatId, this.tgMessageId(more));
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
    if (/^(ga|gs|gf|gx):/.test(cq.data || '')) { await this.handleGroupAction(cq); return; }
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

    if (data.startsWith('xd:')) {
      const orderId = data.slice(3);
      await this.sendExtraDocMenu(chatId, orderId);
      return;
    }

    if (data.startsWith('xk:')) {
      const rest = data.slice(3);
      const sep = rest.lastIndexOf(':');
      if (sep <= 0) return;
      const orderId = rest.slice(0, sep);
      const kind = rest.slice(sep + 1) as DocKind;
      if (!EXTRA_DOC_KINDS.includes(kind)) return;
      this.docSessions.set(telegramId, {
        orderId,
        expectedKind: kind,
        targetStatus: null,
        extraOnly: true,
      });
      await this.clearEphemeral(chatId);
      await this.sendDocKindPrompt(chatId, orderId, kind);
      return;
    }

    if (data.startsWith('xe:')) {
      const orderId = data.slice(3);
      await this.sendExtraDocMenu(chatId, orderId);
      return;
    }

    if (data.startsWith('xf:')) {
      const orderId = data.slice(3);
      this.docSessions.delete(telegramId);
      await this.clearEphemeral(chatId);
      await this.refreshMasterOrderCard(chatId, orderId);
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
        this.docSessions.set(telegramId, {
          orderId,
          expectedKind: DocKind.OTHER,
          targetStatus: null,
          viaAdminDump: true,
        });
        await this.clearEphemeral(chatId);
        await this.notifyAdminsDocsViaAdmin(orderId);
        const res = await this.sendMessage(
          chatId,
          [
            'Заявка передана администратору.',
            'Пришлите все фото/PDF пачкой — типы документов разложит админ в CRM.',
            'Когда закончите — нажмите «Готово».',
          ].join('\n'),
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Готово', callback_data: `ag:${orderId}` }],
              ],
            },
          },
        );
        this.trackEphemeral(chatId, this.tgMessageId(res));
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

    if (data.startsWith('ag:')) {
      const orderId = data.slice(3);
      const session = this.docSessions.get(telegramId);
      if (session?.orderId === orderId) {
        this.docSessions.delete(telegramId);
      }
      await this.clearEphemeral(chatId);
      await this.sendMessage(
        chatId,
        'Спасибо! Администратор разложит документы и закроет заявку.',
      );
      await this.refreshMasterOrderCard(chatId, orderId).catch(() => undefined);
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
        kind !== DocKind.RECEIPT_SD &&
        kind !== DocKind.OTHER
      ) {
        return;
      }

      const session = this.docSessions.get(telegramId);
      if (session?.extraOnly || session?.targetStatus == null) {
        await this.sendMessage(
          chatId,
          `Пришлите файл для «${DOC_KIND_TG[kind]}» или нажмите «Готово».`,
        );
        return;
      }

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
      await this.clearEphemeral(chatId);
      await this.sendDocKindPrompt(chatId, orderId, next);
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

    if (data.startsWith('ps:')) {
      const orderId = data.slice(3);
      try {
        await this.masterByTelegram(telegramId);
        await this.startPaySession(chatId, telegramId, orderId);
      } catch {
        await this.sendMessage(chatId, 'Не удалось начать ввод сумм.');
      }
      return;
    }

    if (data.startsWith('c:')) {
      const rest = data.slice(2);
      const sep = rest.lastIndexOf(':');
      if (sep <= 0) return;
      const orderId = rest.slice(0, sep);
      const status = rest.slice(sep + 1) as OrderStatus;

      if (status === OrderStatus.DONE) {
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          include: { payment: true },
        });
        const paid = Number(order?.payment?.paid ?? 0);
        if (paid <= 0) {
          await this.startPaySession(
            chatId,
            telegramId,
            orderId,
            OrderStatus.DONE,
          );
          return;
        }
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
        this.paySessions.delete(telegramId);
        await this.clearEphemeral(chatId);
        await this.sendMessage(
          chatId,
          `Статус обновлён: ${STATUS_LABELS[status] ?? status}`,
        );
        await this.refreshMasterOrderCard(chatId, orderId);
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
