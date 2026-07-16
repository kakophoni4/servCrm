import { Injectable } from '@nestjs/common';
import {
  CashDirection,
  CashExpenseBasis,
  CashIncomeBasis,
  OrderStatus,
  Role,
  SourceKind,
} from '@prisma/client';
import { BranchScopeService } from '../common/branch/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';

function range(from?: string, to?: string) {
  const now = new Date();
  const start =
    from != null
      ? new Date(from)
      : new Date(now.getFullYear(), now.getMonth(), 1);
  const end =
    to != null
      ? new Date(to)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
}

const ADS_EXPENSE_BASES: CashExpenseBasis[] = [
  CashExpenseBasis.AVITO_ADS,
  CashExpenseBasis.LEAFLETS,
  CashExpenseBasis.CARDS,
  CashExpenseBasis.HIRE_ADS,
];

type CityAgg = {
  cityId: string | null;
  cityName: string;
  incomeTotal: number;
  incomeOrders: number;
  incomeFines: number;
  incomeOther: number;
  expensePromo: number;
  expenseCollection: number;
  masterSalary: number;
  partsCost: number;
  expenseAds: number;
  expenseTotal: number;
  balance: number;
};

function emptyAgg(cityId: string | null, cityName: string): CityAgg {
  return {
    cityId,
    cityName,
    incomeTotal: 0,
    incomeOrders: 0,
    incomeFines: 0,
    incomeOther: 0,
    expensePromo: 0,
    expenseCollection: 0,
    masterSalary: 0,
    partsCost: 0,
    expenseAds: 0,
    expenseTotal: 0,
    balance: 0,
  };
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchScopeService,
  ) {}

  async closed(
    userId: string,
    role: Role | string,
    requestedCityId: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ) {
    const { start, end } = range(from, to);
    const cityIds = this.branch.resolveCityIds(
      await this.branch.allowedCityIds(userId, role),
      requestedCityId,
    );
    const cityFilter = this.branch.cityWhere(cityIds);
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DONE,
        updatedAt: { gte: start, lte: end },
        cityId: cityFilter,
      },
      include: { payment: true, claims: true },
    });
    const closed = orders.length;
    const ours = orders.filter((o) => o.sourceKind === SourceKind.OUR).length;
    const partner = orders.filter(
      (o) => o.sourceKind === SourceKind.PARTNER,
    ).length;
    const withClaim = orders.filter((o) => o.isClaim || o.claims.length).length;
    const net = orders.reduce(
      (s, o) => s + Number(o.payment?.toCompany ?? 0),
      0,
    );
    const ourNetSum = orders
      .filter((o) => o.sourceKind === SourceKind.OUR)
      .reduce((s, o) => s + Number(o.payment?.toCompany ?? 0), 0);
    const partnerNetSum = orders
      .filter((o) => o.sourceKind === SourceKind.PARTNER)
      .reduce((s, o) => s + Number(o.payment?.toCompany ?? 0), 0);
    const work = orders.reduce(
      (s, o) => s + Number(o.payment?.workSum ?? 0),
      0,
    );
    const salary = orders.reduce(
      (s, o) => s + Number(o.payment?.masterSalary ?? 0),
      0,
    );
    const paid = orders.reduce((s, o) => s + Number(o.payment?.paid ?? 0), 0);
    const days = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / 86400000),
    );
    const avgCheck = closed ? paid / closed : 0;
    const avgClosedPerDay = closed / days;
    const daysInMonth = new Date(
      end.getFullYear(),
      end.getMonth() + 1,
      0,
    ).getDate();

    const adsTxs = await this.prisma.cashTx.findMany({
      where: {
        direction: CashDirection.EXPENSE,
        expenseBasis: { in: ADS_EXPENSE_BASES },
        createdAt: { gte: start, lte: end },
        cityId: cityFilter,
      },
      select: { amount: true },
    });
    const adsExpenseSum = adsTxs.reduce((s, t) => s + Number(t.amount), 0);
    const ordersInPeriod = await this.prisma.order.count({
      where: { createdAt: { gte: start, lte: end }, cityId: cityFilter },
    });
    const orderPrice = ordersInPeriod
      ? adsExpenseSum / ordersInPeriod
      : 0;

    return {
      period: { from: start, to: end },
      closed,
      ours,
      partner,
      ourNetSum,
      partnerNetSum,
      claimsPercent: closed ? (withClaim / closed) * 100 : 0,
      netSum: net,
      avgCheckHandover: closed ? net / closed : 0,
      avgCheckSalary: closed ? salary / closed : 0,
      avgCheckTotal: avgCheck,
      avgWorkSum: closed ? work / closed : 0,
      forecastTurnover: avgCheck * avgClosedPerDay * daysInMonth,
      orderPrice,
      adsExpenseSum,
      ordersInPeriod,
    };
  }

  async cancels(
    userId: string,
    role: Role | string,
    requestedCityId: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ) {
    const { start, end } = range(from, to);
    const cityIds = this.branch.resolveCityIds(
      await this.branch.allowedCityIds(userId, role),
      requestedCityId,
    );
    const cityFilter = this.branch.cityWhere(cityIds);
    const [orders, cityRows] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          status: { in: [OrderStatus.CANCELLED_CC, OrderStatus.REFUSAL] },
          updatedAt: { gte: start, lte: end },
          cityId: cityFilter,
        },
        select: {
          status: true,
          cancelFault: true,
          sourceKind: true,
          cityId: true,
          city: { select: { name: true } },
        },
      }),
      this.prisma.city.findMany({
        where: cityIds ? { id: { in: cityIds } } : undefined,
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    type CancelAgg = {
      cityId: string | null;
      cityName: string;
      total: number;
      partner: number;
      our: number;
      refusal: number;
      cancelledCc: number;
      byMasterFault: number;
      byAdminFault: number;
    };

    const empty = (cityId: string | null, cityName: string): CancelAgg => ({
      cityId,
      cityName,
      total: 0,
      partner: 0,
      our: 0,
      refusal: 0,
      cancelledCc: 0,
      byMasterFault: 0,
      byAdminFault: 0,
    });

    const byId = new Map<string, CancelAgg>();
    for (const c of cityRows) {
      byId.set(c.id, empty(c.id, c.name));
    }

    const bump = (row: CancelAgg, o: (typeof orders)[number]) => {
      row.total += 1;
      if (o.sourceKind === SourceKind.PARTNER) row.partner += 1;
      if (o.sourceKind === SourceKind.OUR) row.our += 1;
      if (o.status === OrderStatus.REFUSAL) row.refusal += 1;
      if (o.status === OrderStatus.CANCELLED_CC) row.cancelledCc += 1;
      if (o.cancelFault === 'master') row.byMasterFault += 1;
      if (o.cancelFault === 'admin') row.byAdminFault += 1;
    };

    for (const o of orders) {
      const id = o.cityId;
      if (id && byId.has(id)) {
        bump(byId.get(id)!, o);
        continue;
      }
      const key = id ?? '__none__';
      if (!byId.has(key)) {
        byId.set(
          key,
          empty(id, o.city?.name ?? (id ? 'Филиал' : 'Без филиала')),
        );
      }
      bump(byId.get(key)!, o);
    }

    const byCity = [...byId.values()].sort((a, b) =>
      a.cityName.localeCompare(b.cityName, 'ru'),
    );

    const totals = empty(null, 'Итого');
    for (const row of byCity) {
      totals.total += row.total;
      totals.partner += row.partner;
      totals.our += row.our;
      totals.refusal += row.refusal;
      totals.cancelledCc += row.cancelledCc;
      totals.byMasterFault += row.byMasterFault;
      totals.byAdminFault += row.byAdminFault;
    }

    return {
      period: { from: start, to: end },
      byCity,
      totals,
    };
  }

  async cash(
    userId: string,
    role: Role | string,
    requestedCityId: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ) {
    const { start, end } = range(from, to);
    const cityIds = this.branch.resolveCityIds(
      await this.branch.allowedCityIds(userId, role),
      requestedCityId,
    );
    const cityFilter = this.branch.cityWhere(cityIds);
    const [txs, doneOrders, cityRows] = await Promise.all([
      this.prisma.cashTx.findMany({
        where: { createdAt: { gte: start, lte: end }, cityId: cityFilter },
        include: {
          city: true,
          order: { include: { city: true, payment: true } },
          createdBy: { select: { fullName: true, cityId: true, city: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.findMany({
        where: {
          status: OrderStatus.DONE,
          updatedAt: { gte: start, lte: end },
          cityId: cityFilter,
        },
        include: { payment: true, city: true },
      }),
      this.prisma.city.findMany({
        where: cityIds ? { id: { in: cityIds } } : undefined,
        select: { id: true, name: true },
      }),
    ]);

    const cityNames = new Map(cityRows.map((c) => [c.id, c.name]));
    const soleCityId =
      cityIds?.length === 1
        ? cityIds[0]
        : cityRows.length === 1
          ? cityRows[0].id
          : null;
    const soleCityName = soleCityId
      ? (cityNames.get(soleCityId) ?? null)
      : null;

    const resolveBranch = (input: {
      cityId?: string | null;
      cityName?: string | null;
      orderCityId?: string | null;
      orderCityName?: string | null;
      authorCityId?: string | null;
      authorCityName?: string | null;
    }): { cityId: string | null; cityName: string } => {
      const id =
        input.cityId ||
        input.orderCityId ||
        input.authorCityId ||
        soleCityId ||
        null;
      const name =
        input.cityName ||
        input.orderCityName ||
        input.authorCityName ||
        (id ? cityNames.get(id) : null) ||
        soleCityName ||
        'Без филиала';
      return { cityId: id, cityName: name };
    };

    const byCity = new Map<string, CityAgg>();

    const ensure = (id: string | null, cityName: string) => {
      const key = id ?? '__none__';
      let row = byCity.get(key);
      if (!row) {
        row = emptyAgg(id, cityName);
        byCity.set(key, row);
      } else if (
        row.cityName === 'Без филиала' &&
        cityName &&
        cityName !== 'Без филиала'
      ) {
        row.cityName = cityName;
      }
      return row;
    };

    for (const t of txs) {
      const branch = resolveBranch({
        cityId: t.cityId,
        cityName: t.city?.name,
        orderCityId: t.order?.cityId,
        orderCityName: t.order?.city?.name,
        authorCityId: t.createdBy?.cityId,
        authorCityName: t.createdBy?.city?.name,
      });
      const row = ensure(branch.cityId, branch.cityName);
      // ORDER-приход считаем по toCompany заявки (если есть), иначе amount из кассы.
      // Защита от legacy cash_tx с полной paid до миграции.
      const amount =
        t.direction === CashDirection.INCOME &&
        t.incomeBasis === CashIncomeBasis.ORDER &&
        t.order?.payment != null
          ? Number(t.order.payment.toCompany)
          : Number(t.amount);

      if (t.direction === CashDirection.INCOME) {
        row.incomeTotal += amount;
        if (t.incomeBasis === CashIncomeBasis.ORDER) {
          row.incomeOrders += amount;
        } else if (t.incomeBasis === CashIncomeBasis.FINE) {
          row.incomeFines += amount;
        } else {
          row.incomeOther += amount;
        }
      } else if (t.direction === CashDirection.EXPENSE) {
        row.expenseTotal += amount;
        if (t.expenseBasis === CashExpenseBasis.SALARY_PROMO) {
          row.expensePromo += amount;
        }
        if (t.expenseBasis === CashExpenseBasis.COLLECTION_FEE) {
          row.expenseCollection += amount;
        }
        if (
          t.expenseBasis === CashExpenseBasis.AVITO_ADS ||
          t.expenseBasis === CashExpenseBasis.HIRE_ADS
        ) {
          row.expenseAds += amount;
        }
      } else if (t.direction === CashDirection.COLLECTION) {
        row.expenseTotal += amount;
        row.expenseCollection += amount;
      }
    }

    for (const o of doneOrders) {
      const branch = resolveBranch({
        cityId: o.cityId,
        cityName: o.city?.name,
      });
      const row = ensure(branch.cityId, branch.cityName);
      row.masterSalary += Number(o.payment?.masterSalary ?? 0);
      row.partsCost += Number(o.payment?.partsCost ?? 0);
    }

    for (const row of byCity.values()) {
      // Приход по заявке в кассе уже «чистыми» (toCompany = оплата − запчасти − ЗП).
      // ЗП и запчасти показываем справочно, в остаток повторно не вычитаем.
      row.balance = row.incomeTotal - row.expenseTotal;
    }

    const cities = [...byCity.values()].sort((a, b) =>
      a.cityName.localeCompare(b.cityName, 'ru'),
    );

    const totals = cities.reduce<CityAgg>(
      (acc, c) => ({
        cityId: null,
        cityName: 'Итого',
        incomeTotal: acc.incomeTotal + c.incomeTotal,
        incomeOrders: acc.incomeOrders + c.incomeOrders,
        incomeFines: acc.incomeFines + c.incomeFines,
        incomeOther: acc.incomeOther + c.incomeOther,
        expensePromo: acc.expensePromo + c.expensePromo,
        expenseCollection: acc.expenseCollection + c.expenseCollection,
        masterSalary: acc.masterSalary + c.masterSalary,
        partsCost: acc.partsCost + c.partsCost,
        expenseAds: acc.expenseAds + c.expenseAds,
        expenseTotal: acc.expenseTotal + c.expenseTotal,
        balance: acc.balance + c.balance,
      }),
      emptyAgg(null, 'Итого'),
    );

    const expenseNotes = txs
      .filter(
        (t) =>
          t.direction === CashDirection.EXPENSE ||
          t.direction === CashDirection.COLLECTION,
      )
      .map((t) => {
        const branch = resolveBranch({
          cityId: t.cityId,
          cityName: t.city?.name,
          orderCityId: t.order?.cityId,
          orderCityName: t.order?.city?.name,
          authorCityId: t.createdBy?.cityId,
          authorCityName: t.createdBy?.city?.name,
        });
        return {
          date: t.createdAt,
          cityName: branch.cityName,
          direction: t.direction,
          expenseBasis: t.expenseBasis,
          amount: Number(t.amount),
          description: t.description,
          orderPublicId: t.order?.publicId ?? null,
          createdBy: t.createdBy?.fullName ?? null,
          documentPath: t.documentPath,
        };
      });

    return {
      period: { from: start, to: end },
      byCity: cities,
      totals,
      expenseNotes,
    };
  }

  async masters(
    userId: string,
    role: Role | string,
    requestedCityId: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ) {
    const { start, end } = range(from, to);
    const cityIds = this.branch.resolveCityIds(
      await this.branch.allowedCityIds(userId, role),
      requestedCityId,
    );
    const cityFilter = this.branch.cityWhere(cityIds);
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DONE,
        updatedAt: { gte: start, lte: end },
        masterId: { not: null },
        cityId: cityFilter,
      },
      include: { payment: true, master: { include: { user: true } } },
    });
    const openSd = await this.prisma.order.groupBy({
      by: ['masterId'],
      where: {
        status: OrderStatus.IN_PROGRESS_SD,
        masterId: { not: null },
        cityId: cityFilter,
      },
      _count: true,
    });
    const sdMap = new Map(
      openSd.map((r) => [r.masterId as string, r._count]),
    );
    const map = new Map<string, Record<string, number | string>>();
    for (const o of orders) {
      if (!o.masterId || !o.master) continue;
      const key = o.masterId;
      const cur = (map.get(key) as {
        master: string;
        turnover: number;
        salary: number;
        net: number;
        work: number;
        parts: number;
        count: number;
        micro: number;
      }) ?? {
        master: o.master.user.fullName,
        turnover: 0,
        salary: 0,
        net: 0,
        work: 0,
        parts: 0,
        count: 0,
        micro: 0,
      };
      // paid = оборот (что заплатил клиент)
      // workSum = работы = paid − запчасти
      // toCompany = чистыми в компанию = workSum − ЗП мастера
      const paid = Number(o.payment?.paid ?? 0);
      const toCompany = Number(o.payment?.toCompany ?? 0);
      const work = Number(o.payment?.workSum ?? 0);
      cur.turnover += paid;
      cur.salary += Number(o.payment?.masterSalary ?? 0);
      cur.net += toCompany;
      cur.work += work;
      cur.parts += Number(o.payment?.partsCost ?? 0);
      cur.count += 1;
      if (work < 4000) cur.micro += 1;
      map.set(key, cur);
    }
    return [...map.entries()].map(([masterId, row]) => ({
      masterId,
      ...row,
      pct4: Number(row.turnover) * 0.04,
      openSd: sdMap.get(masterId) ?? 0,
      avgNet: Number(row.count) ? Number(row.net) / Number(row.count) : 0,
      avgWork: Number(row.count) ? Number(row.work) / Number(row.count) : 0,
    }));
  }

  /**
   * Чистая прибыль (toCompany) по партнёрам — закрытые партнёрские заявки.
   */
  async partners(
    userId: string,
    role: Role | string,
    requestedCityId: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ) {
    const { start, end } = range(from, to);
    const cityIds = this.branch.resolveCityIds(
      await this.branch.allowedCityIds(userId, role),
      requestedCityId,
    );
    const cityFilter = this.branch.cityWhere(cityIds);
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DONE,
        sourceKind: SourceKind.PARTNER,
        updatedAt: { gte: start, lte: end },
        cityId: cityFilter,
      },
      include: { payment: true, partner: true },
    });

    type Row = {
      partnerName: string;
      count: number;
      net: number;
      paid: number;
      work: number;
      salary: number;
    };

    const map = new Map<string, Row>();
    for (const o of orders) {
      const key = o.partnerId ?? '__none__';
      const cur = map.get(key) ?? {
        partnerName: o.partner?.name ?? 'Без партнёра',
        count: 0,
        net: 0,
        paid: 0,
        work: 0,
        salary: 0,
      };
      cur.count += 1;
      cur.net += Number(o.payment?.toCompany ?? 0);
      cur.paid += Number(o.payment?.paid ?? 0);
      cur.work += Number(o.payment?.workSum ?? 0);
      cur.salary += Number(o.payment?.masterSalary ?? 0);
      map.set(key, cur);
    }

    return [...map.values()]
      .map((row) => ({
        ...row,
        avgNet: row.count ? row.net / row.count : 0,
      }))
      .sort((a, b) => b.net - a.net);
  }

  async claims(
    userId: string,
    role: Role | string,
    requestedCityId: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ) {
    const { start, end } = range(from, to);
    const cityIds = this.branch.resolveCityIds(
      await this.branch.allowedCityIds(userId, role),
      requestedCityId,
    );
    const cityFilter = this.branch.cityWhere(cityIds);
    const rows = await this.prisma.claim.findMany({
      where: { createdAt: { gte: start, lte: end }, cityId: cityFilter },
      include: {
        order: { include: { client: true } },
        city: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      period: { from: start, to: end },
      rows: rows.map((c) => ({
        date: c.createdAt,
        orderPublicId: c.order.publicId,
        clientName: c.order.client.name,
        type: c.type,
        cityName: c.city?.name ?? '—',
        refundSum: Number(c.refundSum),
        orderSum: Number(c.orderSum),
        status: c.closedAt ? 'closed' : 'open',
      })),
    };
  }

  async ads(
    userId: string,
    role: Role | string,
    requestedCityId: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ) {
    const { start, end } = range(from, to);
    const cityIds = this.branch.resolveCityIds(
      await this.branch.allowedCityIds(userId, role),
      requestedCityId,
    );
    const cityFilter = this.branch.cityWhere(cityIds);
    const reports = await this.prisma.adDailyReport.findMany({
      where: { reportDate: { gte: start, lte: end }, cityId: cityFilter },
      orderBy: { reportDate: 'desc' },
    });
    const leafletOrders = await this.prisma.order.count({
      where: {
        sourceOur: 'LEAFLET',
        createdAt: { gte: start, lte: end },
        cityId: cityFilter,
      },
    });
    const avitoOrders = await this.prisma.order.count({
      where: {
        sourceOur: 'AVITO',
        createdAt: { gte: start, lte: end },
        cityId: cityFilter,
      },
    });
    const sum = (pick: (r: (typeof reports)[number]) => number) =>
      reports.reduce((s, r) => s + pick(r), 0);

    const leafletsIssued = sum((r) => r.leafletsIssued);
    const leafletsSpread = sum((r) => r.leafletsSpread);
    const cardsIssued = sum((r) => r.cardsIssued);
    const cardsSpread = sum((r) => r.cardsSpread);
    const stickersIssued = sum((r) => r.stickersIssued);
    const stickersSpread = sum((r) => r.stickersSpread);
    const avitoAds = sum((r) => r.avitoAdsCount);
    const promoters = sum((r) => r.promotersCount);
    /** Материалы на 1 заявку с листовок (листовки + визитки разнесённые). */
    const materialsSpread = leafletsSpread + cardsSpread;
    const last = reports[0];
    return {
      period: { from: start, to: end },
      leafletsIssued,
      leafletsSpread,
      cardsIssued,
      cardsSpread,
      stickersIssued,
      stickersSpread,
      leafletsStock: last?.leafletsStock ?? 0,
      cardsStock: last?.cardsStock ?? 0,
      avitoAds,
      promoters,
      leafletOrders,
      avitoOrders,
      kpiLeaflets: leafletOrders ? materialsSpread / leafletOrders : 0,
      kpiAvito: avitoAds ? avitoOrders / avitoAds : 0,
      rows: reports,
    };
  }
}
