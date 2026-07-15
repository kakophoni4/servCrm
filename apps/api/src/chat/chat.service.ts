import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ChatChannel, ChatStatus, Role } from '@prisma/client';
import { BotService } from '../bot/bot.service';
import { BranchScopeService } from '../common/branch/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';

const orderInclude = {
  client: true,
} as const;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchScopeService,
    @Inject(forwardRef(() => BotService))
    private readonly bot: BotService,
  ) {}

  async threads(userId: string, role: Role | string) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const where =
      allowed === null
        ? { status: ChatStatus.OPEN }
        : {
            status: ChatStatus.OPEN,
            OR: [{ cityId: { in: allowed } }, { cityId: null }],
          };
    return this.prisma.chatThread.findMany({
      where,
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        order: { include: orderInclude },
        city: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(id: string, userId?: string, role?: Role | string) {
    const thread = await this.prisma.chatThread.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, include: { author: true } },
        order: { include: orderInclude },
      },
    });
    if (!thread) throw new NotFoundException('Чат не найден');
    if (userId !== undefined && role !== undefined) {
      await this.assertThreadAccess(thread, userId, role);
    }
    return thread;
  }

  private async assertThreadAccess(
    thread: { cityId: string | null },
    userId: string,
    role: Role | string,
  ) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    if (
      allowed !== null &&
      thread.cityId !== null &&
      !allowed.includes(thread.cityId)
    ) {
      throw new ForbiddenException('Чат вне вашего филиала');
    }
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

  async reply(
    threadId: string,
    body: string,
    authorId: string,
    userId?: string,
    role?: Role | string,
  ) {
    const thread = await this.get(threadId);
    if (userId !== undefined && role !== undefined) {
      await this.assertThreadAccess(thread, userId, role);
    }
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

  async linkOrder(
    threadId: string,
    orderId: string,
    userId?: string,
    role?: Role | string,
  ) {
    const thread = await this.get(threadId);
    if (userId !== undefined && role !== undefined) {
      await this.assertThreadAccess(thread, userId, role);
    }
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Заявка не найдена');
    return this.prisma.chatThread.update({
      where: { id: threadId },
      data: { linkedOrderId: orderId, cityId: order.cityId },
      include: {
        order: { include: orderInclude },
        messages: true,
      },
    });
  }

  /** Привязать заявку треда к мастеру и отправить карточку в Telegram. */
  async sendToMaster(
    threadId: string,
    masterId: string,
    userId?: string,
    role?: Role | string,
  ) {
    const thread = await this.get(threadId);
    if (userId !== undefined && role !== undefined) {
      await this.assertThreadAccess(thread, userId, role);
    }
    if (!thread.linkedOrderId) {
      throw new BadRequestException(
        'К чату не привязана заявка. Сначала выберите и привяжите заявку.',
      );
    }
    const master = await this.prisma.master.findUnique({
      where: { id: masterId },
    });
    if (!master) throw new NotFoundException('Мастер не найден');

    await this.prisma.order.update({
      where: { id: thread.linkedOrderId },
      data: { masterId },
    });

    await this.bot.notifyMasterOrder(masterId, thread.linkedOrderId);
    return this.get(threadId);
  }
}
