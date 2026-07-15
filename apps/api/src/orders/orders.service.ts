import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashDirection,
  CashIncomeBasis,
  OrderStatus,
  OrderType,
  Prisma,
  Role,
  SourceKind,
} from '@prisma/client';
import { calcPayment, requiresDocsForDone } from '../common/utils/formulas';
import { normalizePhone } from '../common/utils/phone';
import { buildOrderPrefix, buildPublicId } from '../common/utils/order-id';
import { BotService } from '../bot/bot.service';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryService } from '../salary/salary.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

const ADMIN_ROLES: Role[] = [Role.ADMIN, Role.DIRECTOR, Role.OWNER];

const DISPATCHER_STATUSES: OrderStatus[] = [
  OrderStatus.NOT_SCHEDULED,
  OrderStatus.WAITING,
  OrderStatus.CANCELLED_CC,
];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salary: SalaryService,
    private readonly documents: DocumentsService,
    private readonly bot: BotService,
  ) {}

  private orderInclude = {
    client: true,
    partner: true,
    ageCategory: true,
    master: { include: { user: true } },
    city: true,
    payment: true,
    claims: true,
    documents: true,
  } satisfies Prisma.OrderInclude;

  async list() {
    return this.prisma.order.findMany({
      include: this.orderInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        partner: true,
        ageCategory: true,
        master: { include: { user: true } },
        city: true,
        payment: true,
        claims: true,
        documents: true,
        client: {
          include: {
            orders: {
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                publicId: true,
                type: true,
                status: true,
                createdAt: true,
                scheduledAt: true,
                address: true,
                isClaim: true,
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Заявка не найдена');
    return order;
  }

  async create(dto: CreateOrderDto, userId: string, role: Role) {
    if (dto.sourceKind === SourceKind.OUR && !dto.sourceOur) {
      throw new BadRequestException('Укажите Авито или листовку');
    }
    if (dto.sourceKind === SourceKind.PARTNER && !dto.partnerId) {
      throw new BadRequestException('Укажите партнёра');
    }

    const phone = normalizePhone(dto.clientPhone);
    if (phone.length < 10) {
      throw new BadRequestException('Некорректный телефон');
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const status = scheduledAt
      ? OrderStatus.WAITING
      : OrderStatus.NOT_SCHEDULED;

    const isWarranty = dto.type === OrderType.WARRANTY;
    const isRepeat = dto.type === OrderType.REPEAT;

    const created = await this.prisma.$transaction(async (tx) => {
      let client = await tx.client.findUnique({
        where: {
          phoneNormalized_name: {
            phoneNormalized: phone,
            name: dto.clientName.trim(),
          },
        },
      });

      if (!client) {
        client = await tx.client.create({
          data: {
            phoneNormalized: phone,
            name: dto.clientName.trim(),
            ageCategoryId: dto.ageCategoryId,
            cityId: dto.cityId,
            branchComment: dto.branchComment,
          },
        });
      } else if (dto.branchComment) {
        client = await tx.client.update({
          where: { id: client.id },
          data: { branchComment: dto.branchComment },
        });
      }

      const now = new Date();
      const prefix = buildOrderPrefix(now);
      const last = await tx.order.findFirst({
        where: { seqPrefix: prefix },
        orderBy: { seq: 'desc' },
      });
      const seq = (last?.seq ?? 0) + 1;
      const publicId = buildPublicId(prefix, seq);

      const order = await tx.order.create({
        data: {
          publicId,
          seqPrefix: prefix,
          seq,
          clientId: client.id,
          type: dto.type,
          sourceKind: dto.sourceKind,
          sourceOur: dto.sourceKind === SourceKind.OUR ? dto.sourceOur : null,
          partnerId:
            dto.sourceKind === SourceKind.PARTNER ? dto.partnerId : null,
          scheduledAt,
          address: dto.address.trim(),
          ageCategoryId: dto.ageCategoryId,
          comment: dto.comment,
          status,
          isClaim: dto.isClaim ?? false,
          isWarranty,
          isRepeat,
          isProfile: dto.isProfile ?? true,
          typeTech: dto.typeTech,
          branchComment: dto.branchComment ?? client.branchComment,
          cityId: dto.cityId,
          createdById: userId,
          payment: { create: {} },
        },
        include: this.orderInclude,
      });

      void role;
      return order;
    });

    // Уведомление админам в Telegram (не блокирует ответ).
    void this.bot
      .notifyAdminsNewOrder(created.id)
      .catch(() => undefined);

    return created;
  }

  /**
   * Заявки, созданные после указанного момента — для всплывающих
   * уведомлений в CRM. По умолчанию последняя минута.
   */
  async recent(after?: string) {
    const afterDate =
      after && !Number.isNaN(Date.parse(after))
        ? new Date(after)
        : new Date(Date.now() - 60_000);
    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gt: afterDate } },
      orderBy: { createdAt: 'asc' },
      take: 20,
      include: { client: true, city: true },
    });
    return orders.map((o) => ({
      id: o.id,
      publicId: o.publicId,
      clientName: o.client.name,
      phone: o.client.phoneNormalized,
      address: o.address,
      cityName: o.city?.name ?? null,
      status: o.status,
      hasMaster: Boolean(o.masterId),
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async update(
    id: string,
    dto: UpdateOrderDto,
    userId: string,
    role: Role,
  ) {
    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Заявка не найдена');

    const isAdmin = ADMIN_ROLES.includes(role);

    if (dto.masterId !== undefined && !isAdmin) {
      throw new ForbiddenException('Назначать мастера может только админ');
    }

    if (dto.status !== undefined) {
      if (!isAdmin && !DISPATCHER_STATUSES.includes(dto.status)) {
        throw new ForbiddenException(
          'Диспетчер не может ставить статусы исполнения',
        );
      }
    }

    if (
      (dto.paid !== undefined ||
        dto.prepay !== undefined ||
        dto.partsCost !== undefined ||
        dto.partsYesNo !== undefined) &&
      !isAdmin
    ) {
      throw new ForbiddenException('Оплаты редактирует администратор');
    }

    if (dto.cancelFault !== undefined && !isAdmin) {
      throw new ForbiddenException('Виновника отмены указывает администратор');
    }

    let status = dto.status;
    if (dto.scheduledAt !== undefined && status === undefined) {
      status = dto.scheduledAt
        ? existing.status === OrderStatus.NOT_SCHEDULED
          ? OrderStatus.WAITING
          : existing.status
        : OrderStatus.NOT_SCHEDULED;
    }

    const data: Prisma.OrderUpdateInput = {
      type: dto.type,
      sourceKind: dto.sourceKind,
      sourceOur: dto.sourceOur === undefined ? undefined : dto.sourceOur,
      partner:
        dto.partnerId === undefined
          ? undefined
          : dto.partnerId
            ? { connect: { id: dto.partnerId } }
            : { disconnect: true },
      scheduledAt:
        dto.scheduledAt === undefined
          ? undefined
          : dto.scheduledAt
            ? new Date(dto.scheduledAt)
            : null,
      address: dto.address,
      ageCategory:
        dto.ageCategoryId === undefined
          ? undefined
          : dto.ageCategoryId
            ? { connect: { id: dto.ageCategoryId } }
            : { disconnect: true },
      comment: dto.comment,
      master:
        dto.masterId === undefined
          ? undefined
          : dto.masterId
            ? { connect: { id: dto.masterId } }
            : { disconnect: true },
      status,
      isClaim: dto.isClaim,
      isWarranty: dto.isWarranty,
      isRepeat: dto.isRepeat,
      isProfile: dto.isProfile,
      typeTech: dto.typeTech,
      branchComment: dto.branchComment,
      cancelFault:
        dto.cancelFault === undefined ? undefined : dto.cancelFault,
    };

    if (dto.type === OrderType.WARRANTY) {
      data.isWarranty = true;
    }
    if (dto.type === OrderType.REPEAT) {
      data.isRepeat = true;
    }

    const existingPayment = await this.prisma.orderPayment.findUnique({
      where: { orderId: id },
    });
    const nextPaid =
      dto.paid !== undefined
        ? dto.paid
        : Number(existingPayment?.paid ?? 0);

    if (status === OrderStatus.DONE && requiresDocsForDone(nextPaid)) {
      const ok = await this.documents.hasRequiredReceipts(id);
      if (!ok) {
        throw new BadRequestException(
          'При оплате >500 ₽ нельзя поставить Готов без подтверждающих документов',
        );
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data,
      });

      let paidForCash =
        dto.paid ?? Number(existingPayment?.paid ?? 0);

      if (
        dto.paid !== undefined ||
        dto.prepay !== undefined ||
        dto.partsCost !== undefined ||
        dto.partsYesNo !== undefined ||
        status === OrderStatus.DONE
      ) {
        const paid =
          dto.paid ?? Number(existingPayment?.paid ?? 0);
        paidForCash = paid;
        const partsCost =
          dto.partsCost ?? Number(existingPayment?.partsCost ?? 0);
        const masterPct = await this.salary.percentFor(paid - partsCost);
        const calc = calcPayment(paid, partsCost, masterPct);

        await tx.orderPayment.upsert({
          where: { orderId: id },
          create: {
            orderId: id,
            paid,
            prepay: dto.prepay ?? 0,
            partsCost,
            partsYesNo: dto.partsYesNo ?? false,
            ...calc,
          },
          update: {
            paid: dto.paid,
            prepay: dto.prepay,
            partsCost: dto.partsCost,
            partsYesNo: dto.partsYesNo,
            ...calc,
          },
        });
      }

      const nextStatus = status ?? existing.status;
      if (nextStatus === OrderStatus.DONE) {
        const exists = await tx.cashTx.findFirst({
          where: {
            orderId: id,
            incomeBasis: CashIncomeBasis.ORDER,
          },
          select: { id: true },
        });
        if (!exists) {
          await tx.cashTx.create({
            data: {
              direction: CashDirection.INCOME,
              incomeBasis: CashIncomeBasis.ORDER,
              amount: paidForCash,
              orderId: id,
              cityId: existing.cityId ?? undefined,
              createdById: userId,
              description: `Приход по заявке`,
            },
          });
        }
      }

      return tx.order.findUniqueOrThrow({
        where: { id },
        include: this.orderInclude,
      });
    });

    if (
      dto.masterId &&
      dto.masterId !== existing.masterId
    ) {
      await this.bot.notifyMasterOrder(dto.masterId, id);
    }

    return result;
  }

  /** Повтор = новая заявка на того же клиента. */
  async createRepeat(id: string, userId: string, role: Role) {
    const source = await this.get(id);
    return this.create(
      {
        clientName: source.client.name,
        clientPhone: source.client.phoneNormalized,
        type: OrderType.REPEAT,
        sourceKind: source.sourceKind,
        sourceOur: source.sourceOur ?? undefined,
        partnerId: source.partnerId ?? undefined,
        address: source.address,
        ageCategoryId: source.ageCategoryId ?? undefined,
        comment: `Повтор к заявке ${source.publicId}`,
        isProfile: source.isProfile,
        typeTech: source.typeTech ?? undefined,
        cityId: source.cityId ?? undefined,
        branchComment: source.branchComment ?? undefined,
      },
      userId,
      role,
    );
  }

  /** Гарантия = доп.статус на текущей заявке (+ тип WARRANTY). */
  async markWarranty(id: string) {
    return this.prisma.order.update({
      where: { id },
      data: { type: OrderType.WARRANTY, isWarranty: true },
      include: this.orderInclude,
    });
  }
}
