import { Injectable, NotFoundException } from '@nestjs/common';
import { ClaimType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.claim.findMany({
      include: {
        order: { include: { client: true } },
        city: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(input: {
    orderId: string;
    type: ClaimType;
    refundSum?: number;
    orderSum?: number;
    cityId?: string;
  }) {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
    });
    if (!order) throw new NotFoundException('Заявка не найдена');

    const [claim] = await this.prisma.$transaction([
      this.prisma.claim.create({
        data: {
          orderId: input.orderId,
          type: input.type,
          refundSum: input.refundSum ?? 0,
          orderSum: input.orderSum ?? 0,
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

  async close(id: string, closedAt?: string) {
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
  ) {
    const existing = await this.prisma.claim.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Претензия не найдена');

    return this.prisma.claim.update({
      where: { id },
      data: {
        type: input.type,
        refundSum: input.refundSum,
        orderSum: input.orderSum,
        cityId: input.cityId === undefined ? undefined : input.cityId,
      },
      include: {
        order: { include: { client: true } },
        city: true,
      },
    });
  }
}
