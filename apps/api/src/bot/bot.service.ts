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
  Prisma,
  Role,
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
  message?: { chat?: TgChat };
};

type TgUpdate = {
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
};

type DocUploadSession = {
  orderId: string;
  expectedKind: DocKind;
};

/**
 * Слой для Telegram-бота. Токен берётся из настроек (админка) с fallback на env.
 */
@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private readonly docSessions = new Map<string, DocUploadSession>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatService))
    private readonly chat: ChatService,
    private readonly settings: SettingsService,
    private readonly documents: DocumentsService,
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
      const missing = await this.documents.missingRequiredKinds(orderId);
      if (missing.length) {
        throw new BadRequestException(
          `Для статуса «Готов» недостаёт документов: ${missing
            .map((k) => DOC_KIND_RU[k])
            .join(', ')}`,
        );
      }
    }

    if (status === OrderStatus.IN_PROGRESS_SD) {
      const sdDocs = await this.prisma.orderDocument.count({
        where: { orderId, kind: DocKind.RECEIPT_SD },
      });
      if (!sdDocs) {
        throw new BadRequestException(
          'Для статуса «В работе СД» нужна сохранная расписка',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status,
          ...(status === OrderStatus.DONE ? { docsViaAdmin: false } : {}),
        },
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

    this.logger.log(
      `notifyMasterOrder → telegramId=${telegramId} order=${order.publicId}`,
    );

    return this.sendMessage(telegramId, lines.join('\n'), {
      reply_markup: { inline_keyboard: [row1, row2] },
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

  /** Уведомить всех активных админов о новой заявке (для назначения мастера). */
  async notifyAdminsNewOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { client: true, city: true },
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

    const lines = [
      `🆕 Новая заявка ${order.publicId}`,
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
    const text = lines.join('\n');

    this.logger.log(
      `notifyAdminsNewOrder → ${admins.length} адм., заявка ${order.publicId}`,
    );

    return Promise.allSettled(
      admins.map((a) => this.sendMessage(a.telegramId as string, text)),
    );
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
      const from = msg.from;
      const title =
        from?.username || from?.first_name || String(msg.chat.id);
      await this.incomingMessage(chatId, msg.text, title);
    }

    return { ok: true };
  }

  private async requestMissingDocuments(
    chatId: string,
    telegramId: string,
    orderId: string,
    missing: DocKind[],
  ) {
    if (!missing.length) return;
    this.docSessions.set(telegramId, {
      orderId,
      expectedKind: missing[0],
    });
    await this.sendMessage(
      chatId,
      'Для статуса «Готов» нужны документы. Пришлите фото или PDF. Каждый тип — отдельным сообщением (или несколько файлов подряд одного типа).',
    );
    for (const kind of missing) {
      await this.sendDocKindPrompt(chatId, orderId, kind);
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

    try {
      const file = await this.downloadTgFile(msg);
      await this.documents.uploadMany(
        session.orderId,
        session.expectedKind,
        [file],
        order.master.user.id,
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
      if (!REQUIRED_ORDER_DOC_KINDS.includes(kind)) return;

      const missing = await this.documents.missingRequiredKinds(orderId);
      if (missing.includes(kind)) {
        await this.sendMessage(
          chatId,
          `Ещё не загружен файл для «${DOC_KIND_TG[kind]}». Пришлите фото или PDF.`,
        );
        this.docSessions.set(telegramId, { orderId, expectedKind: kind });
        return;
      }

      const next = missing[0];
      if (!next) {
        this.docSessions.delete(telegramId);
        await this.sendMessage(
          chatId,
          'Все документы загружены. Подтвердите статус «Готов» ещё раз.',
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Подтвердить «Готов»',
                    callback_data: `c:${orderId}:${OrderStatus.DONE}`,
                  },
                  { text: 'Отмена', callback_data: 'n' },
                ],
              ],
            },
          },
        );
        return;
      }

      this.docSessions.set(telegramId, { orderId, expectedKind: next });
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

      if (status === OrderStatus.DONE) {
        const missing = await this.documents.missingRequiredKinds(orderId);
        if (missing.length) {
          await this.requestMissingDocuments(
            chatId,
            telegramId,
            orderId,
            missing,
          );
          return;
        }
      }

      if (status === OrderStatus.IN_PROGRESS_SD) {
        const sdDocs = await this.prisma.orderDocument.count({
          where: { orderId, kind: DocKind.RECEIPT_SD },
        });
        if (!sdDocs) {
          this.docSessions.set(telegramId, {
            orderId,
            expectedKind: DocKind.RECEIPT_SD,
          });
          await this.sendMessage(
            chatId,
            'Для статуса «В работе СД» нужна сохранная расписка.',
          );
          await this.sendDocKindPrompt(chatId, orderId, DocKind.RECEIPT_SD);
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
}
