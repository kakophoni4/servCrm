import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  ChatChannel,
  ChatStatus,
  OrderStatus,
  Role,
  UserStatus,
} from '@prisma/client';
import { BotService } from '../bot/bot.service';
import { BranchScopeService } from '../common/branch/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';

const orderInclude = {
  client: true,
} as const;

const TERMINAL: OrderStatus[] = [
  OrderStatus.DONE,
  OrderStatus.REFUSAL,
  OrderStatus.CANCELLED_CC,
];

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchScopeService,
    @Inject(forwardRef(() => BotService))
    private readonly bot: BotService,
  ) {}

  /**
   * Чаты с мастерами филиала: синхронизируем треды по telegramId
   * активных мастеров и отдаём только их.
   */
  async threads(userId: string, role: Role | string) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const masters = await this.prisma.master.findMany({
      where: {
        status: UserStatus.ACTIVE,
        ...(allowed === null ? {} : { cityId: { in: allowed } }),
        user: {
          status: UserStatus.ACTIVE,
          telegramId: { not: null },
        },
      },
      include: {
        user: {
          select: {
            fullName: true,
            telegramId: true,
            cityId: true,
          },
        },
      },
      orderBy: { user: { fullName: 'asc' } },
    });

    for (const m of masters) {
      const tg = m.user.telegramId?.trim();
      if (!tg) continue;
      await this.ensureTelegramThread({
        telegramId: tg,
        title: m.user.fullName,
        cityId: m.cityId ?? m.user.cityId,
      });
    }

    const tgIds = masters
      .map((m) => m.user.telegramId?.trim())
      .filter((id): id is string => Boolean(id));

    if (!tgIds.length) return [];

    return this.prisma.chatThread.findMany({
      where: {
        status: ChatStatus.OPEN,
        channel: ChatChannel.TELEGRAM,
        externalId: { in: tgIds },
      },
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

  /** Свободные заявки филиала (без мастера, не терминальные). */
  async unassignedOrders(userId: string, role: Role | string) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    return this.prisma.order.findMany({
      where: {
        masterId: null,
        status: { notIn: TERMINAL },
        ...(allowed === null ? {} : { cityId: { in: allowed } }),
      },
      select: {
        id: true,
        publicId: true,
        address: true,
        comment: true,
        adminComment: true,
        scheduledAt: true,
        status: true,
        typeTech: true,
        createdAt: true,
        client: {
          select: { name: true, phoneNormalized: true },
        },
        city: { select: { id: true, name: true, cityName: true } },
        payment: { select: { paid: true, partsCost: true } },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  /** Активные заявки мастера выбранного чата. */
  async masterOrders(
    threadId: string,
    userId: string,
    role: Role | string,
  ) {
    const thread = await this.get(threadId, userId, role);
    const tg = thread.externalId?.trim();
    if (!tg) return [];

    const masterUser = await this.prisma.user.findFirst({
      where: {
        telegramId: tg,
        role: Role.MASTER,
        status: UserStatus.ACTIVE,
      },
      include: { masterProfile: true },
    });
    if (!masterUser?.masterProfile) return [];

    const allowed = await this.branch.allowedCityIds(userId, role);
    return this.prisma.order.findMany({
      where: {
        masterId: masterUser.masterProfile.id,
        status: { notIn: TERMINAL },
        ...(allowed === null ? {} : { cityId: { in: allowed } }),
      },
      select: {
        id: true,
        publicId: true,
        address: true,
        comment: true,
        adminComment: true,
        scheduledAt: true,
        status: true,
        typeTech: true,
        createdAt: true,
        docsViaAdmin: true,
        client: {
          select: { name: true, phoneNormalized: true },
        },
        city: { select: { id: true, name: true, cityName: true } },
        payment: { select: { paid: true, partsCost: true } },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  /**
   * Тред CRM ↔ Telegram для мастера по telegramId.
   */
  async ensureTelegramThread(input: {
    telegramId: string;
    title: string;
    cityId?: string | null;
  }) {
    const externalId = input.telegramId.trim();
    if (!externalId) return null;

    const existing = await this.prisma.chatThread.findFirst({
      where: { channel: ChatChannel.TELEGRAM, externalId },
    });
    if (existing) {
      return this.prisma.chatThread.update({
        where: { id: existing.id },
        data: {
          title: input.title.trim() || existing.title,
          cityId: input.cityId ?? existing.cityId,
          status: ChatStatus.OPEN,
        },
      });
    }
    return this.prisma.chatThread.create({
      data: {
        channel: ChatChannel.TELEGRAM,
        externalId,
        title: input.title.trim() || externalId,
        cityId: input.cityId ?? null,
      },
    });
  }

  /** Входящее из бота / веб — в тред мастера (или офиса по telegramId). */
  async ingest(input: {
    channel: ChatChannel;
    externalId?: string;
    title?: string;
    body: string;
  }) {
    let staff:
      | { fullName: string; cityId: string | null; role: Role }
      | null = null;
    if (input.externalId && input.channel === ChatChannel.TELEGRAM) {
      staff = await this.prisma.user.findFirst({
        where: {
          telegramId: input.externalId,
          status: UserStatus.ACTIVE,
          role: {
            in: [
              Role.MASTER,
              Role.DISPATCHER,
              Role.ADMIN,
              Role.DIRECTOR,
              Role.OWNER,
            ],
          },
        },
        select: { fullName: true, cityId: true, role: true },
      });
    }

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
          title: staff?.fullName ?? input.title ?? input.externalId ?? 'Чат',
          cityId: staff?.cityId ?? null,
        },
      });
    } else if (staff) {
      thread = await this.prisma.chatThread.update({
        where: { id: thread.id },
        data: {
          title: staff.fullName,
          cityId: staff.cityId ?? thread.cityId,
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

    if (thread.channel === ChatChannel.TELEGRAM && thread.externalId) {
      const sent = await this.bot.sendMessage(thread.externalId, body);
      if (!sent?.ok) {
        throw new BadRequestException(
          'Не удалось отправить в Telegram. Проверьте, что бот включён.',
        );
      }
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

  private async masterFromThread(thread: {
    externalId: string | null;
    title: string | null;
  }) {
    if (!thread.externalId) {
      throw new BadRequestException('У чата нет Telegram ID мастера');
    }
    const user = await this.prisma.user.findFirst({
      where: {
        telegramId: thread.externalId,
        role: Role.MASTER,
        status: UserStatus.ACTIVE,
      },
      include: { masterProfile: true },
    });
    if (!user?.masterProfile) {
      throw new NotFoundException('Мастер для этого чата не найден');
    }
    return user.masterProfile;
  }

  /**
   * Назначить свободную заявку мастеру открытого чата и отправить карточку в TG.
   */
  async assignOrder(
    threadId: string,
    orderId: string,
    userId: string,
    role: Role | string,
  ) {
    const thread = await this.get(threadId, userId, role);
    const master = await this.masterFromThread(thread);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Заявка не найдена');

    const allowed = await this.branch.allowedCityIds(userId, role);
    if (
      allowed !== null &&
      order.cityId &&
      !allowed.includes(order.cityId)
    ) {
      throw new ForbiddenException('Заявка вне вашего филиала');
    }

    if (order.masterId) {
      throw new BadRequestException('Заявка уже назначена мастеру');
    }
    if (TERMINAL.includes(order.status)) {
      throw new BadRequestException('Заявку нельзя назначить в этом статусе');
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { masterId: master.id },
    });

    await this.bot.notifyMasterOrder(master.id, orderId);

    await this.prisma.chatThread.update({
      where: { id: threadId },
      data: {
        linkedOrderId: orderId,
        cityId: order.cityId ?? thread.cityId,
        updatedAt: new Date(),
      },
    });

    return {
      thread: await this.get(threadId),
      orderId,
    };
  }

  /** @deprecated — используйте assignOrder (мастер = текущий чат). */
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

    const order = await this.prisma.order.findUnique({
      where: { id: thread.linkedOrderId },
    });
    if (order?.masterId && order.masterId !== masterId) {
      await this.bot
        .notifyMasterOrderRevoked(
          order.masterId,
          order.publicId,
          order.address,
          order.id,
        )
        .catch(() => undefined);
    }

    await this.prisma.order.update({
      where: { id: thread.linkedOrderId },
      data: { masterId },
    });

    await this.bot.notifyMasterOrder(masterId, thread.linkedOrderId);
    return this.get(threadId);
  }
}
