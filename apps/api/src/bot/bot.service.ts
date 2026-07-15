import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatChannel, OrderStatus } from '@prisma/client';
import { ChatService } from '../chat/chat.service';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { requiresDocsForDone } from '../common/utils/formulas';

/**
 * Слой для Telegram-бота (webhook / polling подключается через TELEGRAM_BOT_TOKEN).
 * Сейчас — HTTP API для эмуляции и будущей интеграции.
 */
@Injectable()
export class BotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly documents: DocumentsService,
  ) {}

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
