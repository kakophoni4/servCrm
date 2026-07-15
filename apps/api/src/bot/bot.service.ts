import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import {
  CashDirection,
  CashIncomeBasis,
  ChatChannel,
  DocKind,
  OrderStatus,
  Role,
} from '@prisma/client';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

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

type TgFrom = {
  id?: number;
  username?: string;
  first_name?: string;
};

type TgChat = { id?: number | string };

type TgMessage = {
  text?: string;
  chat?: TgChat;
  from?: TgFrom;
};

type TgCallbackQuery = {
  id: string;
  data?: string;
  from?: TgFrom;
  message?: { chat?: TgChat };
};

type TgUpdate = {
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
};

/**
 * Слой для Telegram-бота. Токен берётся из настроек (админка) с fallback на env.
 */
@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatService))
    private readonly chat: ChatService,
    private readonly settings: SettingsService,
  ) {}

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

    // Штрафы: приходы кассы с основанием FINE, привязанные к заявкам мастера.
    const fineRows = await this.prisma.cashTx.findMany({
      where: {
        incomeBasis: CashIncomeBasis.FINE,
        createdAt: { gte: from },
        order: { masterId },
      },
      select: { amount: true },
    });
    const fines = fineRows.reduce((s, r) => s + Number(r.amount), 0);

    return {
      fullName: user.fullName,
      ordersCount: orders.length,
      salaryMonth: salary,
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
      throw new NotFoundException('Заявка не найдена у мастера');
    }

    if (status === OrderStatus.DONE) {
      const docs = await this.prisma.orderDocument.findMany({
        where: { orderId },
        select: { kind: true },
      });
      const kinds = new Set(docs.map((d) => d.kind));
      const missing: string[] = [];
      if (!kinds.has(DocKind.CONTRACT)) missing.push('договор');
      if (!kinds.has(DocKind.RECEIPT_SERVICE)) missing.push('чек услуги');
      if (order.payment?.partsYesNo) {
        if (!kinds.has(DocKind.RECEIPT_PARTS)) missing.push('чек комплектующих');
        if (!kinds.has(DocKind.PARTS_PHOTO)) missing.push('фото комплектующих');
      }
      if (missing.length) {
        throw new BadRequestException(
          `Для статуса «Готов» недостаёт документов: ${missing.join(', ')}`,
        );
      }
    }

    if (status === OrderStatus.IN_PROGRESS_SD) {
      const sdDocs = await this.prisma.orderDocument.count({
        where: { orderId, kind: DocKind.RECEIPT_SD },
      });
      if (!sdDocs) {
        throw new BadRequestException(
          'Для статуса «В работе СД» нужна сохранённая расписка СД',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status },
      });

      if (status === OrderStatus.DONE) {
        const exists = await tx.cashTx.findFirst({
          where: {
            orderId,
            incomeBasis: CashIncomeBasis.ORDER,
          },
          select: { id: true },
        });
        if (!exists) {
          await tx.cashTx.create({
            data: {
              direction: CashDirection.INCOME,
              incomeBasis: CashIncomeBasis.ORDER,
              amount: Number(order.payment?.paid ?? 0),
              orderId,
              cityId: order.cityId ?? undefined,
              createdById: user.id,
              description: 'Приход по заявке',
            },
          });
        }
      }

      return updated;
    });
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

    const lines = [
      `Заявка ${order.publicId}`,
      `Клиент: ${order.client.name}`,
      `Тел: ${order.client.phoneNormalized}`,
      `Адрес: ${order.address}`,
    ];
    if (order.typeTech) lines.push(`Техника: ${order.typeTech}`);
    if (order.comment) lines.push(`Комментарий: ${order.comment}`);
    if (order.scheduledAt) {
      lines.push(
        `Визит: ${order.scheduledAt.toLocaleString('ru-RU')}`,
      );
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

    this.logger.log(
      `notifyMasterOrder → telegramId=${telegramId} order=${order.publicId}`,
    );

    return this.sendMessage(telegramId, lines.join('\n'), {
      reply_markup: { inline_keyboard: [row1, row2] },
    });
  }

  /** Уведомить всех активных админов о новой заявке (для назначения мастера). */
  async notifyAdminsNewOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { client: true, city: true },
    });
    if (!order) return null;

    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.DIRECTOR, Role.OWNER] },
        status: 'ACTIVE',
        telegramId: { not: null },
      },
      select: { telegramId: true },
    });
    if (!admins.length) return null;

    const lines = [
      `🆕 Новая заявка ${order.publicId}`,
      `Клиент: ${order.client.name}`,
      `Тел: ${order.client.phoneNormalized}`,
      `Адрес: ${order.address}`,
    ];
    if (order.city?.name) lines.push(`Город: ${order.city.name}`);
    if (order.typeTech) lines.push(`Техника: ${order.typeTech}`);
    if (order.scheduledAt) {
      lines.push(`Визит: ${order.scheduledAt.toLocaleString('ru-RU')}`);
    }
    lines.push('Назначьте мастера в CRM.');
    const text = lines.join('\n');

    this.logger.log(
      `notifyAdminsNewOrder → ${admins.length} адм., заявка ${order.publicId}`,
    );

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
    if (msg?.text && msg.chat?.id != null) {
      const from = msg.from;
      const title =
        from?.username || from?.first_name || String(msg.chat.id);
      await this.incomingMessage(String(msg.chat.id), msg.text, title);
    }

    return { ok: true };
  }

  private async handleCallbackQuery(cq: TgCallbackQuery) {
    const chatId = cq.message?.chat?.id != null ? String(cq.message.chat.id) : null;
    const telegramId = cq.from?.id != null ? String(cq.from.id) : null;
    const data = cq.data ?? '';

    await this.telegram('answerCallbackQuery', {
      callback_query_id: cq.id,
    });

    if (!chatId || !telegramId) return;

    if (data === 'n') {
      await this.sendMessage(chatId, 'Отменено');
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
      try {
        await this.setStatus(telegramId, orderId, status, true);
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
        await this.sendMessage(chatId, Array.isArray(text) ? text.join('; ') : text);
      }
    }
  }
}
