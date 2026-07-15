import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { BranchScopeService } from '../common/branch/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchScopeService,
  ) {}

  async list(userId: string, role: Role, requestedCityId?: string) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const cityIds = this.branch.resolveCityIds(allowed, requestedCityId);
    return this.prisma.masterSettlement.findMany({
      where: { cityId: this.branch.cityWhere(cityIds) },
      include: { master: { include: { user: true } }, confirmedBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Суммы к сдаче по мастерам за период (непроведённые DONE). */
  async preview(
    from: string,
    to: string,
    userId: string,
    role: Role,
    requestedCityId?: string,
  ) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const cityIds = this.branch.resolveCityIds(allowed, requestedCityId);
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DONE,
        createdAt: { gte: new Date(from), lte: new Date(to) },
        masterId: { not: null },
        cityId: this.branch.cityWhere(cityIds),
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

  async create(
    input: {
      masterId: string;
      amount: number;
      periodFrom: string;
      periodTo: string;
    },
    userId: string,
    role: Role,
  ) {
    const master = await this.prisma.master.findUnique({
      where: { id: input.masterId },
    });
    if (!master) throw new NotFoundException('Мастер не найден');

    const allowed = await this.branch.allowedCityIds(userId, role);
    if (
      allowed !== null &&
      master.cityId &&
      !allowed.includes(master.cityId)
    ) {
      throw new ForbiddenException('Мастер вне вашего филиала');
    }

    return this.prisma.masterSettlement.create({
      data: {
        masterId: input.masterId,
        cityId: master.cityId,
        amount: input.amount,
        periodFrom: new Date(input.periodFrom),
        periodTo: new Date(input.periodTo),
      },
      include: { master: { include: { user: true } } },
    });
  }

  async confirm(id: string, userId: string, role: Role) {
    const row = await this.prisma.masterSettlement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Расчёт не найден');

    const allowed = await this.branch.allowedCityIds(userId, role);
    if (
      allowed !== null &&
      (!row.cityId || !allowed.includes(row.cityId))
    ) {
      throw new ForbiddenException('Расчёт вне вашего филиала');
    }

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
