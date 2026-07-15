import { Injectable } from '@nestjs/common';
import {
  CashDirection,
  CashExpenseBasis,
  CashIncomeBasis,
  OrderStatus,
  SourceKind,
} from '@prisma/client';
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
  incomeOther: number;
  expensePromo: number;
  expenseCollection: number;
  masterSalary: number;
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
    incomeOther: 0,
    expensePromo: 0,
    expenseCollection: 0,
    masterSalary: 0,
    expenseAds: 0,
    expenseTotal: 0,
    balance: 0,
  };
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async closed(from?: string, to?: string) {
    const { start, end } = range(from, to);
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DONE,
        updatedAt: { gte: start, lte: end },
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
      },
      select: { amount: true },
    });
    const adsExpenseSum = adsTxs.reduce((s, t) => s + Number(t.amount), 0);
    const ordersInPeriod = await this.prisma.order.count({
      where: { createdAt: { gte: start, lte: end } },
    });
    const orderPrice = ordersInPeriod
      ? adsExpenseSum / ordersInPeriod
      : 0;

    return {
      period: { from: start, to: end },
      closed,
      ours,
      partner,
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

  async cancels(from?: string, to?: string) {
    const { start, end } = range(from, to);
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.CANCELLED_CC, OrderStatus.REFUSAL] },
        updatedAt: { gte: start, lte: end },
      },
    });
    return {
      period: { from: start, to: end },
      total: orders.length,
      byMasterFault: orders.filter((o) => o.cancelFault === 'master').length,
      byAdminFault: orders.filter((o) => o.cancelFault === 'admin').length,
      our: orders.filter((o) => o.sourceKind === SourceKind.OUR).length,
      partner: orders.filter((o) => o.sourceKind === SourceKind.PARTNER).length,
    };
  }

  async cash(from?: string, to?: string) {
    const { start, end } = range(from, to);
    const [txs, doneOrders] = await Promise.all([
      this.prisma.cashTx.findMany({
        where: { createdAt: { gte: start, lte: end } },
        include: { city: true, order: true, createdBy: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.findMany({
        where: {
          status: OrderStatus.DONE,
          updatedAt: { gte: start, lte: end },
        },
        include: { payment: true, city: true },
      }),
    ]);

    const byCity = new Map<string, CityAgg>();

    const ensure = (cityId: string | null, cityName: string) => {
      const key = cityId ?? '__none__';
      let row = byCity.get(key);
      if (!row) {
        row = emptyAgg(cityId, cityName);
        byCity.set(key, row);
      }
      return row;
    };

    for (const t of txs) {
      const row = ensure(t.cityId, t.city?.name ?? 'Без города');
      const amount = Number(t.amount);

      if (t.direction === CashDirection.INCOME) {
        row.incomeTotal += amount;
        if (t.incomeBasis === CashIncomeBasis.ORDER) {
          row.incomeOrders += amount;
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
      const row = ensure(o.cityId, o.city?.name ?? 'Без города');
      row.masterSalary += Number(o.payment?.masterSalary ?? 0);
    }

    for (const row of byCity.values()) {
      row.balance = row.incomeTotal - row.expenseTotal - row.masterSalary;
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
        incomeOther: acc.incomeOther + c.incomeOther,
        expensePromo: acc.expensePromo + c.expensePromo,
        expenseCollection: acc.expenseCollection + c.expenseCollection,
        masterSalary: acc.masterSalary + c.masterSalary,
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
      .map((t) => ({
        date: t.createdAt,
        cityName: t.city?.name ?? 'Без города',
        direction: t.direction,
        expenseBasis: t.expenseBasis,
        amount: Number(t.amount),
        description: t.description,
        orderPublicId: t.order?.publicId ?? null,
        createdBy: t.createdBy?.fullName ?? null,
        documentPath: t.documentPath,
      }));

    return {
      period: { from: start, to: end },
      byCity: cities,
      totals,
      expenseNotes,
    };
  }

  async masters(from?: string, to?: string) {
    const { start, end } = range(from, to);
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DONE,
        updatedAt: { gte: start, lte: end },
        masterId: { not: null },
      },
      include: { payment: true, master: { include: { user: true } } },
    });
    const openSd = await this.prisma.order.groupBy({
      by: ['masterId'],
      where: { status: OrderStatus.IN_PROGRESS_SD, masterId: { not: null } },
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
      const toCompany = Number(o.payment?.toCompany ?? 0);
      const work = Number(o.payment?.workSum ?? 0);
      cur.turnover += toCompany;
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

  async claims(from?: string, to?: string) {
    const { start, end } = range(from, to);
    return this.prisma.claim.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: {
        order: { include: { client: true } },
        city: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async ads(from?: string, to?: string) {
    const { start, end } = range(from, to);
    const reports = await this.prisma.adDailyReport.findMany({
      where: { reportDate: { gte: start, lte: end } },
      orderBy: { reportDate: 'desc' },
    });
    const leafletOrders = await this.prisma.order.count({
      where: {
        sourceOur: 'LEAFLET',
        createdAt: { gte: start, lte: end },
      },
    });
    const avitoOrders = await this.prisma.order.count({
      where: {
        sourceOur: 'AVITO',
        createdAt: { gte: start, lte: end },
      },
    });
    const leaflets =
      reports.reduce((s, r) => s + r.leafletsSpread + r.cardsSpread, 0) || 0;
    const avitoAds = reports.reduce((s, r) => s + r.avitoAdsCount, 0);
    const last = reports[0];
    return {
      period: { from: start, to: end },
      leafletsStock: last?.leafletsStock ?? 0,
      cardsStock: last?.cardsStock ?? 0,
      avitoAds,
      promoters: reports.reduce((s, r) => s + r.promotersCount, 0),
      leafletOrders,
      avitoOrders,
      kpiLeaflets: leafletOrders ? leaflets / leafletOrders : 0,
      kpiAvito: avitoAds ? avitoOrders / avitoAds : 0,
      rows: reports,
    };
  }
}
