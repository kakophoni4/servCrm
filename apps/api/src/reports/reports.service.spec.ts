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
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: {
    order: {
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
    cashTx: { findMany: jest.Mock };
    claim: { findMany: jest.Mock };
    adDailyReport: { findMany: jest.Mock };
    city: { findMany: jest.Mock };
  };
  let branch: {
    allowedCityIds: jest.Mock;
    resolveCityIds: jest.Mock;
    cityWhere: jest.Mock;
  };

  const FROM = '2026-06-01';
  const TO = '2026-06-10';
  const USER = 'user-1';

  beforeEach(() => {
    prisma = {
      order: {
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      cashTx: { findMany: jest.fn() },
      claim: { findMany: jest.fn() },
      adDailyReport: { findMany: jest.fn() },
      city: { findMany: jest.fn().mockResolvedValue([]) },
    };
    branch = {
      allowedCityIds: jest.fn(),
      resolveCityIds: jest.fn(),
      cityWhere: jest.fn(),
    };
    service = new ReportsService(
      prisma as unknown as PrismaService,
      branch as unknown as BranchScopeService,
    );
  });

  function mockBranchScope(
    allowed: string[] | null,
    resolved: string[] | null = allowed,
  ) {
    branch.allowedCityIds.mockResolvedValue(allowed);
    branch.resolveCityIds.mockReturnValue(resolved);
    branch.cityWhere.mockImplementation((ids: string[] | null) =>
      ids ? { in: ids } : undefined,
    );
  }

  describe('closed', () => {
    const orders = [
      {
        sourceKind: SourceKind.OUR,
        isClaim: false,
        claims: [],
        payment: {
          toCompany: 1000,
          workSum: 3000,
          masterSalary: 200,
          paid: 5000,
        },
      },
      {
        sourceKind: SourceKind.OUR,
        isClaim: true,
        claims: [],
        payment: {
          toCompany: 2000,
          workSum: 5000,
          masterSalary: 300,
          paid: 7000,
        },
      },
      {
        sourceKind: SourceKind.PARTNER,
        isClaim: false,
        claims: [{ id: 'c1' }],
        payment: {
          toCompany: 1500,
          workSum: 4500,
          masterSalary: 250,
          paid: 6000,
        },
      },
      {
        sourceKind: SourceKind.PARTNER,
        isClaim: false,
        claims: [],
        payment: {
          toCompany: 500,
          workSum: 3500,
          masterSalary: 100,
          paid: 4000,
        },
      },
    ];

    beforeEach(() => {
      mockBranchScope(['A']);
      prisma.order.findMany.mockResolvedValue(orders);
      prisma.cashTx.findMany.mockResolvedValue([
        { amount: 300 },
        { amount: 200 },
      ]);
    });

    it('aggregates closed metrics on DONE orders', async () => {
      prisma.order.count.mockResolvedValue(10);

      const result = await service.closed(USER, Role.ADMIN, undefined, FROM, TO);

      expect(result.closed).toBe(4);
      expect(result.ours).toBe(2);
      expect(result.partner).toBe(2);
      expect(result.ourNetSum).toBe(3000);
      expect(result.partnerNetSum).toBe(2000);
      expect(result.netSum).toBe(5000);
      expect(result.avgCheckHandover).toBe(1250);
      expect(result.avgWorkSum).toBe(4000);
      expect(result.claimsPercent).toBe(50);
      expect(result.orderPrice).toBe(50);
      expect(result.adsExpenseSum).toBe(500);
      expect(result.ordersInPeriod).toBe(10);
      // paid=22000 за 10 дней июня, осталось 20 → 22000 + 2200*20
      expect(result.forecastTurnover).toBe(66000);
    });

    it('returns orderPrice 0 when ordersInPeriod is 0', async () => {
      prisma.order.count.mockResolvedValue(0);

      const result = await service.closed(USER, Role.ADMIN, undefined, FROM, TO);

      expect(result.orderPrice).toBe(0);
      expect(result.ordersInPeriod).toBe(0);
    });
  });

  describe('cancels', () => {
    it('aggregates cancels by city with totals', async () => {
      mockBranchScope(['A', 'B']);
      prisma.city.findMany.mockResolvedValue([
        { id: 'A', name: 'Альфа' },
        { id: 'B', name: 'Бета' },
      ]);
      prisma.order.findMany.mockResolvedValue([
        {
          status: OrderStatus.REFUSAL,
          cancelFault: 'master',
          sourceKind: SourceKind.OUR,
          cityId: 'A',
          city: { name: 'Альфа' },
        },
        {
          status: OrderStatus.CANCELLED_CC,
          cancelFault: 'master',
          sourceKind: SourceKind.PARTNER,
          cityId: 'A',
          city: { name: 'Альфа' },
        },
        {
          status: OrderStatus.REFUSAL,
          cancelFault: 'admin',
          sourceKind: SourceKind.OUR,
          cityId: 'B',
          city: { name: 'Бета' },
        },
        {
          status: OrderStatus.CANCELLED_CC,
          cancelFault: null,
          sourceKind: SourceKind.PARTNER,
          cityId: 'B',
          city: { name: 'Бета' },
        },
      ]);

      const result = await service.cancels(
        USER,
        Role.ADMIN,
        undefined,
        FROM,
        TO,
      );

      expect(result.byCity).toHaveLength(2);
      expect(result.byCity[0].cityName).toBe('Альфа');
      expect(result.byCity[0].total).toBe(2);
      expect(result.byCity[0].refusal).toBe(1);
      expect(result.byCity[0].cancelledCc).toBe(1);
      expect(result.byCity[0].byMasterFault).toBe(2);
      expect(result.byCity[0].our).toBe(1);
      expect(result.byCity[0].partner).toBe(1);

      expect(result.byCity[1].cityName).toBe('Бета');
      expect(result.byCity[1].total).toBe(2);
      expect(result.byCity[1].byAdminFault).toBe(1);

      expect(result.totals.cityName).toBe('Итого');
      expect(result.totals.total).toBe(4);
      expect(result.totals.refusal).toBe(2);
      expect(result.totals.cancelledCc).toBe(2);
      expect(result.totals.byMasterFault).toBe(2);
      expect(result.totals.byAdminFault).toBe(1);
      expect(result.totals.our).toBe(2);
      expect(result.totals.partner).toBe(2);
    });
  });

  describe('cash', () => {
    it('aggregates by city, totals and expense notes', async () => {
      mockBranchScope(['A', 'B']);
      prisma.city.findMany.mockResolvedValue([
        { id: 'A', name: 'Альфа' },
        { id: 'B', name: 'Бета' },
      ]);
      const createdAt = new Date('2026-06-05T12:00:00.000Z');

      prisma.cashTx.findMany.mockResolvedValue([
        {
          cityId: 'B',
          city: { name: 'Бета' },
          direction: CashDirection.INCOME,
          incomeBasis: CashIncomeBasis.ORDER,
          expenseBasis: null,
          amount: 10000,
          createdAt,
          description: 'order income',
          order: {
            publicId: 'ORD-1',
            payment: { toCompany: 10000 },
          },
          createdBy: { fullName: 'Кассир' },
          documentPath: null,
        },
        {
          cityId: 'A',
          city: { name: 'Альфа' },
          direction: CashDirection.INCOME,
          incomeBasis: CashIncomeBasis.OTHER,
          expenseBasis: null,
          amount: 2000,
          createdAt,
          description: 'other income',
          order: null,
          createdBy: { fullName: 'Кассир' },
          documentPath: null,
        },
        {
          cityId: 'A',
          city: { name: 'Альфа' },
          direction: CashDirection.INCOME,
          incomeBasis: CashIncomeBasis.FINE,
          expenseBasis: null,
          amount: 500,
          createdAt,
          description: 'fine',
          order: null,
          createdBy: { fullName: 'Кассир' },
          documentPath: null,
          masterId: 'master-1',
        },
        {
          cityId: 'A',
          city: { name: 'Альфа' },
          direction: CashDirection.EXPENSE,
          incomeBasis: null,
          expenseBasis: CashExpenseBasis.SALARY_PROMO,
          amount: 500,
          createdAt,
          description: 'promo',
          order: null,
          createdBy: { fullName: 'Кассир' },
          documentPath: '/doc.pdf',
        },
        {
          cityId: 'B',
          city: { name: 'Бета' },
          direction: CashDirection.EXPENSE,
          incomeBasis: null,
          expenseBasis: CashExpenseBasis.AVITO_ADS,
          amount: 300,
          createdAt,
          description: 'avito',
          order: null,
          createdBy: null,
          documentPath: null,
        },
        {
          cityId: 'A',
          city: { name: 'Альфа' },
          direction: CashDirection.COLLECTION,
          incomeBasis: null,
          expenseBasis: null,
          amount: 100,
          createdAt,
          description: 'collection',
          order: null,
          createdBy: null,
          documentPath: null,
        },
      ]);

      prisma.order.findMany.mockResolvedValue([
        {
          cityId: 'A',
          city: { name: 'Альфа' },
          payment: { masterSalary: 800, partsCost: 200 },
        },
        {
          cityId: 'B',
          city: { name: 'Бета' },
          payment: { masterSalary: 1200, partsCost: 500 },
        },
      ]);

      const result = await service.cash(USER, Role.DIRECTOR, undefined, FROM, TO);

      expect(result.byCity).toHaveLength(2);
      expect(result.byCity[0].cityName).toBe('Альфа');
      expect(result.byCity[1].cityName).toBe('Бета');

      const alpha = result.byCity[0];
      expect(alpha.incomeTotal).toBe(2500);
      expect(alpha.incomeOrders).toBe(0);
      expect(alpha.incomeFines).toBe(500);
      expect(alpha.incomeOther).toBe(2000);
      expect(alpha.expensePromo).toBe(500);
      expect(alpha.expenseCollection).toBe(100);
      expect(alpha.expenseAds).toBe(0);
      expect(alpha.masterSalary).toBe(800);
      expect(alpha.partsCost).toBe(200);
      // только кассовые расходы; ЗП/запчасти уже внутри чистого прихода
      expect(alpha.expenseTotal).toBe(600);
      expect(alpha.balance).toBe(1900);

      const beta = result.byCity[1];
      expect(beta.incomeTotal).toBe(10000);
      expect(beta.incomeOrders).toBe(10000);
      expect(beta.incomeFines).toBe(0);
      expect(beta.expenseAds).toBe(300);
      expect(beta.masterSalary).toBe(1200);
      expect(beta.partsCost).toBe(500);
      expect(beta.expenseTotal).toBe(300);
      expect(beta.balance).toBe(9700);

      expect(result.totals.cityName).toBe('Итого');
      expect(result.totals.incomeTotal).toBe(12500);
      expect(result.totals.incomeFines).toBe(500);
      expect(result.totals.masterSalary).toBe(2000);
      expect(result.totals.partsCost).toBe(700);
      expect(result.totals.expenseTotal).toBe(900);
      expect(result.totals.balance).toBe(11600);

      expect(result.expenseNotes).toHaveLength(3);

      // Legacy cash_tx с полной paid: в баланс берём toCompany из payment.
      prisma.cashTx.findMany.mockResolvedValue([
        {
          cityId: 'B',
          city: { name: 'Бета' },
          direction: CashDirection.INCOME,
          incomeBasis: CashIncomeBasis.ORDER,
          expenseBasis: null,
          amount: 15000, // устаревшая полная paid
          createdAt,
          description: 'legacy',
          order: {
            publicId: 'ORD-LEGACY',
            payment: { toCompany: 9000 },
          },
          createdBy: null,
          documentPath: null,
        },
      ]);
      prisma.order.findMany.mockResolvedValue([]);
      const legacy = await service.cash(
        USER,
        Role.DIRECTOR,
        undefined,
        FROM,
        TO,
      );
      expect(legacy.byCity[0].incomeOrders).toBe(9000);
      expect(legacy.byCity[0].balance).toBe(9000);

      expect(result.expenseNotes[0]).toMatchObject({
        cityName: 'Альфа',
        direction: CashDirection.EXPENSE,
        expenseBasis: CashExpenseBasis.SALARY_PROMO,
        amount: 500,
        description: 'promo',
        createdBy: 'Кассир',
        documentPath: '/doc.pdf',
      });
    });

    it('resolves branch name from order when cashTx.cityId is null', async () => {
      mockBranchScope(['A']);
      prisma.city.findMany.mockResolvedValue([{ id: 'A', name: 'Москва' }]);
      prisma.cashTx.findMany.mockResolvedValue([
        {
          cityId: null,
          city: null,
          direction: CashDirection.INCOME,
          incomeBasis: CashIncomeBasis.ORDER,
          expenseBasis: null,
          amount: 5000,
          createdAt: new Date('2026-06-05T12:00:00.000Z'),
          description: 'order',
          order: {
            publicId: 'ORD-1',
            cityId: 'A',
            city: { name: 'Москва' },
          },
          createdBy: { fullName: 'Кассир', cityId: null, city: null },
          documentPath: null,
        },
      ]);
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.cash(USER, Role.ADMIN, undefined, FROM, TO);

      expect(result.byCity).toHaveLength(1);
      expect(result.byCity[0].cityName).toBe('Москва');
      expect(result.byCity[0].cityId).toBe('A');
    });
  });

  describe('masters', () => {
    it('aggregates per master with micro, pct4, openSd and averages', async () => {
      mockBranchScope(null);
      prisma.order.findMany.mockResolvedValue([
        {
          masterId: 'm1',
          master: { user: { fullName: 'Иванов' } },
          payment: {
            paid: 3500,
            toCompany: 10000,
            masterSalary: 2000,
            workSum: 3000,
            partsCost: 500,
          },
        },
        {
          masterId: 'm1',
          master: { user: { fullName: 'Иванов' } },
          payment: {
            paid: 5300,
            toCompany: 8000,
            masterSalary: 1500,
            workSum: 5000,
            partsCost: 300,
          },
        },
        {
          masterId: 'm2',
          master: { user: { fullName: 'Петров' } },
          payment: {
            paid: 2100,
            toCompany: 6000,
            masterSalary: 1000,
            workSum: 2000,
            partsCost: 100,
          },
        },
      ]);
      prisma.order.groupBy.mockResolvedValue([
        { masterId: 'm1', _count: 2 },
        { masterId: 'm2', _count: 1 },
      ]);

      const result = await service.masters(
        USER,
        Role.OWNER,
        undefined,
        FROM,
        TO,
      );

      expect(result).toHaveLength(2);

      const ivanov = result.find((r) => r.masterId === 'm1');
      expect(ivanov).toMatchObject({
        master: 'Иванов',
        turnover: 8800, // paid
        salary: 3500,
        net: 18000, // toCompany
        work: 8000, // workSum
        parts: 800,
        count: 2,
        micro: 1,
        pct4: 352,
        openSd: 2,
        avgNet: 9000,
        avgWork: 4000,
      });

      const petrov = result.find((r) => r.masterId === 'm2');
      expect(petrov).toMatchObject({
        master: 'Петров',
        turnover: 2100,
        salary: 1000,
        net: 6000,
        work: 2000,
        parts: 100,
        count: 1,
        micro: 1,
        pct4: 84,
        openSd: 1,
        avgNet: 6000,
        avgWork: 2000,
      });
    });
  });

  describe('partners', () => {
    it('aggregates net profit per partner from DONE PARTNER orders', async () => {
      mockBranchScope(null);
      prisma.order.findMany.mockResolvedValue([
        {
          partnerId: 'p1',
          partner: { name: 'Сервис Плюс' },
          payment: {
            toCompany: 4000,
            paid: 10000,
            workSum: 8000,
            masterSalary: 4000,
          },
        },
        {
          partnerId: 'p1',
          partner: { name: 'Сервис Плюс' },
          payment: {
            toCompany: 2000,
            paid: 5000,
            workSum: 4000,
            masterSalary: 2000,
          },
        },
        {
          partnerId: 'p2',
          partner: { name: 'Другой' },
          payment: {
            toCompany: 1500,
            paid: 3000,
            workSum: 2500,
            masterSalary: 1000,
          },
        },
      ]);

      const result = await service.partners(
        USER,
        Role.OWNER,
        undefined,
        FROM,
        TO,
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        partnerName: 'Сервис Плюс',
        count: 2,
        net: 6000,
        paid: 15000,
        work: 12000,
        salary: 6000,
        avgNet: 3000,
      });
      expect(result[1]).toMatchObject({
        partnerName: 'Другой',
        count: 1,
        net: 1500,
        avgNet: 1500,
      });
      expect(result[0]).not.toHaveProperty('partnerId');
    });
  });

  describe('ads', () => {
    it('returns kpiLeaflets and kpiAvito as 0 when denominators are zero', async () => {
      mockBranchScope(['A']);
      prisma.adDailyReport.findMany.mockResolvedValue([
        {
          reportDate: new Date('2026-06-05'),
          leafletsIssued: 120,
          leafletsSpread: 100,
          cardsIssued: 60,
          cardsSpread: 50,
          stickersIssued: 10,
          stickersSpread: 8,
          avitoAdsCount: 0,
          promotersCount: 2,
          leafletsStock: 500,
          cardsStock: 200,
        },
      ]);
      prisma.order.count.mockResolvedValue(0);

      const result = await service.ads(USER, Role.ADMIN, undefined, FROM, TO);

      expect(result.kpiLeaflets).toBe(0);
      expect(result.kpiAvito).toBe(0);
      expect(result.leafletOrders).toBe(0);
      expect(result.avitoOrders).toBe(0);
      expect(result.leafletsIssued).toBe(120);
      expect(result.leafletsSpread).toBe(100);
      expect(result.cardsIssued).toBe(60);
      expect(result.stickersSpread).toBe(8);
    });

    it('computes kpi ratios when denominators are non-zero', async () => {
      mockBranchScope(['A']);
      prisma.adDailyReport.findMany.mockResolvedValue([
        {
          reportDate: new Date('2026-06-05'),
          leafletsIssued: 120,
          leafletsSpread: 100,
          cardsIssued: 60,
          cardsSpread: 50,
          stickersIssued: 10,
          stickersSpread: 8,
          avitoAdsCount: 10,
          promotersCount: 2,
          leafletsStock: 500,
          cardsStock: 200,
        },
      ]);
      prisma.order.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(20);

      const result = await service.ads(USER, Role.ADMIN, undefined, FROM, TO);

      expect(result.kpiLeaflets).toBe(30);
      expect(result.kpiAvito).toBe(2);
      expect(result.stickersIssued).toBe(10);
    });
  });

  describe('branch isolation', () => {
    it('passes cityId { in: [A] } to prisma when role is scoped to A', async () => {
      mockBranchScope(['A'], ['A']);
      prisma.order.findMany.mockResolvedValue([]);
      prisma.cashTx.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.closed(USER, Role.ADMIN, undefined, FROM, TO);

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            cityId: { in: ['A'] },
          }),
        }),
      );
      expect(prisma.cashTx.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            cityId: { in: ['A'] },
          }),
        }),
      );
      expect(prisma.order.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            cityId: { in: ['A'] },
          }),
        }),
      );
    });

    it('passes cityId undefined to prisma for OWNER (no branch filter)', async () => {
      mockBranchScope(null, null);
      prisma.order.findMany.mockResolvedValue([]);
      prisma.cashTx.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.closed(USER, Role.OWNER, undefined, FROM, TO);

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            cityId: undefined,
          }),
        }),
      );
      expect(prisma.cashTx.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            cityId: undefined,
          }),
        }),
      );
    });

    it('applies branch filter in cancels, cash, masters, partners, claims and ads', async () => {
      mockBranchScope(['A'], ['A']);
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.groupBy.mockResolvedValue([]);
      prisma.cashTx.findMany.mockResolvedValue([]);
      prisma.claim.findMany.mockResolvedValue([]);
      prisma.adDailyReport.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.cancels(USER, Role.ADMIN, undefined, FROM, TO);
      await service.cash(USER, Role.ADMIN, undefined, FROM, TO);
      await service.masters(USER, Role.ADMIN, undefined, FROM, TO);
      await service.partners(USER, Role.ADMIN, undefined, FROM, TO);
      await service.claims(USER, Role.ADMIN, undefined, FROM, TO);
      await service.ads(USER, Role.ADMIN, undefined, FROM, TO);

      const cityFilter = { in: ['A'] };

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cityId: cityFilter }),
        }),
      );
      expect(prisma.cashTx.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cityId: cityFilter }),
        }),
      );
      expect(prisma.order.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cityId: cityFilter }),
        }),
      );
      expect(prisma.claim.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cityId: cityFilter }),
        }),
      );
      expect(prisma.adDailyReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cityId: cityFilter }),
        }),
      );
    });
  });
});
