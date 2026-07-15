import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClaimType, Role } from '@prisma/client';
import { BranchScopeService } from '../common/branch/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchScopeService,
  ) {}

  async list(userId: string, role: Role, requestedCityId?: string) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const cityIds = this.branch.resolveCityIds(allowed, requestedCityId);
    return this.prisma.claim.findMany({
      where: { cityId: this.branch.cityWhere(cityIds) },
      include: {
        order: { include: { client: true } },
        city: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    input: {
      orderId: string;
      type: ClaimType;
      refundSum?: number;
      orderSum?: number;
      cityId?: string;
    },
    userId: string,
    role: Role,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      include: { payment: true },
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

    // Сумма заявки всегда из оплаты заявки, не из формы.
    const orderSum = Number(order.payment?.paid ?? 0);

    const [claim] = await this.prisma.$transaction([
      this.prisma.claim.create({
        data: {
          orderId: input.orderId,
          type: input.type,
          refundSum: input.refundSum ?? 0,
          orderSum,
          cityId: input.cityId ?? order.cityId,
        },
        include: { order: true, city: true },
      }),
      this.prisma.order.update({
        where: { id: input.orderId },
        data: { isClaim: true },
      }),
    ]);

    return claim;
  }

  async close(
    id: string,
    closedAt: string | undefined,
    userId: string,
    role: Role,
  ) {
    const existing = await this.prisma.claim.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Претензия не найдена');

    const allowed = await this.branch.allowedCityIds(userId, role);
    if (
      allowed !== null &&
      existing.cityId &&
      !allowed.includes(existing.cityId)
    ) {
      throw new ForbiddenException('Заявка вне вашего филиала');
    }

    return this.prisma.claim.update({
      where: { id },
      data: { closedAt: closedAt ? new Date(closedAt) : new Date() },
      include: { order: true, city: true },
    });
  }

  async update(
    id: string,
    input: {
      type?: ClaimType;
      refundSum?: number;
      orderSum?: number;
      cityId?: string | null;
    },
    userId: string,
    role: Role,
  ) {
    const existing = await this.prisma.claim.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Претензия не найдена');

    const allowed = await this.branch.allowedCityIds(userId, role);
    if (
      allowed !== null &&
      existing.cityId &&
      !allowed.includes(existing.cityId)
    ) {
      throw new ForbiddenException('Заявка вне вашего филиала');
    }

    return this.prisma.claim.update({
      where: { id },
      data: {
        type: input.type,
        refundSum: input.refundSum,
        // orderSum не меняем вручную — фиксируется при создании из заявки
        cityId: input.cityId === undefined ? undefined : input.cityId,
      },
      include: {
        order: { include: { client: true } },
        city: true,
      },
    });
  }
}
