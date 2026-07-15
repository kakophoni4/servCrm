import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.masterSettlement.findMany({
      include: { master: { include: { user: true } }, confirmedBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Суммы к сдаче по мастерам за период (непроведённые DONE). */
  async preview(from: string, to: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DONE,
        createdAt: { gte: new Date(from), lte: new Date(to) },
        masterId: { not: null },
      },
      include: { payment: true, master: { include: { user: true } } },
    });
    const map = new Map<
      string,
      { masterId: string; name: string; amount: number; count: number }
    >();
    for (const o of orders) {
      if (!o.masterId || !o.master) continue;
      const cur = map.get(o.masterId) ?? {
        masterId: o.masterId,
        name: o.master.user.fullName,
        amount: 0,
        count: 0,
      };
      cur.amount += Number(o.payment?.toCompany ?? 0);
      cur.count += 1;
      map.set(o.masterId, cur);
    }
    return [...map.values()];
  }

  create(input: {
    masterId: string;
    amount: number;
    periodFrom: string;
    periodTo: string;
  }) {
    return this.prisma.masterSettlement.create({
      data: {
        masterId: input.masterId,
        amount: input.amount,
        periodFrom: new Date(input.periodFrom),
        periodTo: new Date(input.periodTo),
      },
      include: { master: { include: { user: true } } },
    });
  }

  async confirm(id: string, userId: string) {
    const row = await this.prisma.masterSettlement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Расчёт не найден');
    if (row.confirmedTwice) {
      throw new BadRequestException('Уже подтверждено дважды');
    }
    if (!row.confirmedOnce) {
      return this.prisma.masterSettlement.update({
        where: { id },
        data: { confirmedOnce: true },
        include: { master: { include: { user: true } } },
      });
    }
    return this.prisma.masterSettlement.update({
      where: { id },
      data: {
        confirmedTwice: true,
        confirmedById: userId,
        confirmedAt: new Date(),
      },
      include: { master: { include: { user: true } } },
    });
  }
}
