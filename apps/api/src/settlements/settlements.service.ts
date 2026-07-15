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

  /** Суммы к сдаче (Σ toCompany) по мастерам за период. */
  async preview(
    from: string,
    to: string,
    userId: string,
    role: Role,
    requestedCityId?: string,
  ) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const cityIds = this.branch.resolveCityIds(allowed, requestedCityId);
    const { fromDate, toDate } = this.periodBounds(from, to);
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DONE,
        createdAt: { gte: fromDate, lte: toDate },
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

  async amountForMaster(
    masterId: string,
    from: string,
    to: string,
    userId: string,
    role: Role,
  ) {
    const rows = await this.preview(from, to, userId, role);
    const row = rows.find((r) => r.masterId === masterId);
    return {
      amount: row?.amount ?? 0,
      count: row?.count ?? 0,
    };
  }

  async create(
    input: {
      masterId: string;
      periodFrom: string;
      periodTo: string;
      amount?: number;
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

    const calc = await this.amountForMaster(
      input.masterId,
      input.periodFrom,
      input.periodTo,
      userId,
      role,
    );
    // Сумма сдачи всегда из заявок (toCompany), ручной ввод не принимаем.
    const amount = calc.amount;
    if (amount <= 0) {
      throw new BadRequestException(
        'Нет суммы к сдаче за период (нет закрытых заявок или toCompany = 0)',
      );
    }

    return this.prisma.masterSettlement.create({
      data: {
        masterId: input.masterId,
        cityId: master.cityId,
        amount,
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
        include: { master: { include: { user: true } }, confirmedBy: true },
      });
    }
    return this.prisma.masterSettlement.update({
      where: { id },
      data: {
        confirmedTwice: true,
        confirmedById: userId,
        confirmedAt: new Date(),
      },
      include: { master: { include: { user: true } }, confirmedBy: true },
    });
  }

  /**
   * Владелец отмечает сдачу мастера (paidAmount).
   * Деньги уже в кассе как INCOME ORDER при закрытии заявок — второй CashTx не создаём.
   */
  async pay(
    id: string,
    amount: number,
    _userId: string,
    role: Role,
  ) {
    if (role !== Role.OWNER) {
      throw new ForbiddenException('Вносить оплату может только владелец');
    }
    if (!(amount > 0)) {
      throw new BadRequestException('Сумма должна быть больше 0');
    }

    const row = await this.prisma.masterSettlement.findUnique({
      where: { id },
      include: { master: { include: { user: true } } },
    });
    if (!row) throw new NotFoundException('Расчёт не найден');

    const due = Number(row.amount);
    const paid = Number(row.paidAmount);
    const remaining = Math.round((due - paid) * 100) / 100;
    if (remaining <= 0) {
      throw new BadRequestException('Расчёт уже полностью оплачен');
    }
    if (amount > remaining + 0.001) {
      throw new BadRequestException(
        `Нельзя внести больше остатка (${remaining} ₽)`,
      );
    }

    const payAmount = Math.round(amount * 100) / 100;

    return this.prisma.masterSettlement.update({
      where: { id },
      data: { paidAmount: paid + payAmount },
      include: { master: { include: { user: true } }, confirmedBy: true },
    });
  }

  private periodBounds(from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    // включить весь день «по»
    toDate.setHours(23, 59, 59, 999);
    return { fromDate, toDate };
  }
}
