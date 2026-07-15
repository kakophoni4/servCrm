import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ChatChannel, OrderStatus } from '@prisma/client';
import { ChatService } from '../chat/chat.service';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { requiresDocsForDone } from '../common/utils/formulas';

/**
 * Слой для Telegram-бота. Токен берётся из настроек (админка) с fallback на env.
 */
@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly documents: DocumentsService,
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
  sendMessage(chatId: string, text: string) {
    return this.telegram('sendMessage', { chat_id: chatId, text });
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
    return {
      fullName: user.fullName,
      ordersCount: orders.length,
      salaryMonth: salary,
      fines: 0,
      bonus: 0,
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
      const paid = Number(order.payment?.paid ?? 0);
      if (requiresDocsForDone(paid)) {
        const ok = await this.documents.hasRequiredReceipts(orderId);
        if (!ok) {
          throw new BadRequestException(
            'Для статуса Готов при сумме >500 нужны чеки/договор',
          );
        }
      }
    }

    if (status === OrderStatus.IN_PROGRESS_SD) {
      const sdDocs = await this.prisma.orderDocument.count({
        where: { orderId, kind: 'RECEIPT_SD' },
      });
      if (!sdDocs) {
        throw new BadRequestException(
          'Для статуса В работе СД нужна сохранённая расписка',
        );
      }
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status },
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
}
