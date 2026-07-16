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

    // Снять предыдущую карточку этой заявки (если была у другого мастера).
    await this.clearMasterOrderCard(orderId);

    await this.clearEphemeral(telegramId);
    const intro = await this.sendMessage(telegramId, 'Новая заявка назначена.', {
      reply_markup: this.masterReplyKeyboard(),
    });
    this.trackEphemeral(telegramId, this.tgMessageId(intro));
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

    if (msg.photo?.length || msg.document) {
      await this.handleIncomingFile(telegramId, chatId, msg);
      return;
    }

    if (!msg.text) return;

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
