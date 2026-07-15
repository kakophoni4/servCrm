import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatChannel, ChatStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  threads() {
    return this.prisma.chatThread.findMany({
      where: { status: ChatStatus.OPEN },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        order: true,
        city: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(id: string) {
    const thread = await this.prisma.chatThread.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, include: { author: true } },
        order: true,
      },
    });
    if (!thread) throw new NotFoundException('Чат не найден');
    return thread;
  }

  /** Входящее из бота / веб. */
  async ingest(input: {
    channel: ChatChannel;
    externalId?: string;
    title?: string;
    body: string;
  }) {
    let thread = input.externalId
      ? await this.prisma.chatThread.findFirst({
          where: { channel: input.channel, externalId: input.externalId },
        })
      : null;
    if (!thread) {
      thread = await this.prisma.chatThread.create({
        data: {
          channel: input.channel,
          externalId: input.externalId,
          title: input.title ?? input.externalId ?? 'Чат',
        },
      });
    }
    await this.prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        body: input.body,
        fromClient: true,
      },
    });
    return this.prisma.chatThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
  }

  async reply(threadId: string, body: string, authorId: string) {
    await this.get(threadId);
    await this.prisma.chatMessage.create({
      data: {
        threadId,
        body,
        fromClient: false,
        authorId,
      },
    });
    return this.get(threadId);
  }

  async linkOrder(threadId: string, orderId: string) {
    await this.get(threadId);
    return this.prisma.chatThread.update({
      where: { id: threadId },
      data: { linkedOrderId: orderId },
      include: { order: true, messages: true },
    });
  }
}
