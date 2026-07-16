import { NotFoundException } from '@nestjs/common';
import { OrderStatus, Role, UserStatus } from '@prisma/client';
import { SettingsService } from './settings.service';

describe('SettingsService — ЗП диспетчеров', () => {
  const prisma = {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    dispatcherPaySettings: { findUnique: jest.fn() },
    order: { findMany: jest.fn() },
    adDailyReport: { findMany: jest.fn() },
    dispatcherShift: { findMany: jest.fn() },
  } as any;

  const branch = {
    allowedCityIds: jest.fn(),
    resolveCityIds: jest.fn(),
    cityWhere: jest.fn(),
  } as any;

  const svc = new SettingsService(prisma, branch);

  const userId = 'dispatcher-1';
  const dispatcher = {
    id: userId,
    fullName: 'Иван Диспетчер',
    role: Role.DISPATCHER,
    cityId: 'A' as string | null,
  };

  const paySettings = {
    userId,
    salaryBase: 10000,
    dailyTurnoverPct: 0,
    leafletBonus: 2.5,
    closedOrdersBonusPct: 0.1,
  };

  const closedOrders = [
    {
      createdById: userId,
      completedAt: new Date(2026, 0, 10, 15, 0, 0),
      updatedAt: new Date(2026, 0, 10, 15, 0, 0),
      payment: { toCompany: 10000 },
    },
    {
      createdById: 'other-user',
      completedAt: new Date(2026, 0, 10, 16, 0, 0),
      updatedAt: new Date(2026, 0, 10, 16, 0, 0),
      payment: { toCompany: 5000 },
    },
    {
      createdById: userId,
      completedAt: new Date(2026, 0, 20, 12, 0, 0), // день без смены
      updatedAt: new Date(2026, 0, 20, 12, 0, 0),
      payment: { toCompany: 3000.333 },
    },
  ];

  const shifts = [
    { workDate: new Date('2026-01-10T00:00:00.000Z'), cityId: 'A' },
  ];

  const adReports = [{ leafletsSpread: 100 }, { leafletsSpread: 50 }];

  function mockCalcChain(overrides?: {
    user?: typeof dispatcher | null;
    settings?: typeof paySettings | null;
    orders?: typeof closedOrders;
    ads?: typeof adReports;
    shifts?: typeof shifts;
  }) {
    prisma.user.findUnique.mockResolvedValue(
      overrides?.user !== undefined ? overrides.user : dispatcher,
    );
    prisma.dispatcherPaySettings.findUnique.mockResolvedValue(
      overrides?.settings !== undefined ? overrides.settings : paySettings,
    );
    prisma.order.findMany.mockResolvedValue(
      overrides?.orders !== undefined ? overrides.orders : closedOrders,
    );
    prisma.adDailyReport.findMany.mockResolvedValue(
      overrides?.ads !== undefined ? overrides.ads : adReports,
    );
    prisma.dispatcherShift.findMany.mockResolvedValue(
      overrides?.shifts !== undefined ? overrides.shifts : shifts,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('calcDispatcherPay', () => {
    it('throws NotFoundException when user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(svc.calcDispatcherPay(userId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(svc.calcDispatcherPay(userId)).rejects.toThrow(
        'Диспетчер не найден',
      );
    });

    it('throws NotFoundException when user role is not DISPATCHER', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: userId,
        fullName: 'Админ',
        role: Role.ADMIN,
        cityId: null,
      });

      await expect(svc.calcDispatcherPay(userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('calculates closed-orders bonus from net profit on shift days only', async () => {
      mockCalcChain();

      const result = await svc.calcDispatcherPay(userId, '2026-01-01', '2026-01-31');

      // shiftClosedNet = 10000 + 5000 (только 10.01, смена) = 15000
      // leaflets = 150 → 2.5 ₽ × (150/100) = 3.75
      expect(result.salaryBase).toBe(10000);
      expect(result.leafletsPay).toBe(3.75);
      expect(result.closedOrdersBonus).toBe(1500); // 0.1 * 15000
      expect(result.total).toBe(11503.75);
      expect(result.meta.shiftClosedNet).toBe(15000);
      expect(result.meta.leaflets).toBe(150);
      expect(result).not.toHaveProperty('dailyTurnoverPay');
    });

    it('gives zero closed-orders bonus when dispatcher has no shifts', async () => {
      mockCalcChain({ shifts: [] });

      const result = await svc.calcDispatcherPay(userId, '2026-01-01', '2026-01-31');

      expect(result.closedOrdersBonus).toBe(0);
      expect(result.meta.shiftClosedNet).toBe(0);
    });

    it('passes cityId filter to order.findMany when dispatcher has cityId', async () => {
      mockCalcChain({ user: { ...dispatcher, cityId: 'A' } });

      await svc.calcDispatcherPay(userId, '2026-01-01', '2026-01-31');

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: OrderStatus.DONE,
            cityId: 'A',
            OR: expect.any(Array),
          }),
          include: { payment: true },
        }),
      );
    });

    it('does not pass cityId filter when dispatcher has no cityId', async () => {
      mockCalcChain({ user: { ...dispatcher, cityId: null } });

      await svc.calcDispatcherPay(userId, '2026-01-01', '2026-01-31');

      const call = prisma.order.findMany.mock.calls[0][0];
      expect(call.where.status).toBe(OrderStatus.DONE);
      expect(call.where).not.toHaveProperty('cityId');
    });

    it('treats date-only "to" as end of day 23:59:59.999', async () => {
      mockCalcChain();

      await svc.calcDispatcherPay(userId, '2026-01-01', '2026-01-15');

      const call = prisma.order.findMany.mock.calls[0][0];
      const completedRange = call.where.OR[0].completedAt;
      expect(completedRange.lte).toEqual(
        new Date('2026-01-15T23:59:59.999'),
      );
      expect(completedRange.gte).toEqual(new Date('2026-01-01'));
    });

    it('defaults period to current month when from/to are omitted', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));

      mockCalcChain();

      await svc.calcDispatcherPay(userId);

      const call = prisma.order.findMany.mock.calls[0][0];
      const completedRange = call.where.OR[0].completedAt;
      expect(completedRange.gte).toEqual(new Date(2026, 6, 1));
      expect(completedRange.lte).toEqual(
        new Date(2026, 6, 31, 23, 59, 59),
      );
    });
  });

  describe('summaryDispatcherPay', () => {
    it('returns pay rows for all active dispatchers', async () => {
      const dispatchers = [
        {
          id: 'disp-1',
          fullName: 'Анна',
          role: Role.DISPATCHER,
          cityId: 'A',
        },
        {
          id: 'disp-2',
          fullName: 'Борис',
          role: Role.DISPATCHER,
          cityId: null,
        },
      ];

      prisma.user.findMany.mockResolvedValue(dispatchers);
      prisma.dispatcherPaySettings.findUnique
        .mockResolvedValueOnce({
          userId: 'disp-1',
          salaryBase: 5000,
          dailyTurnoverPct: 0,
          leafletBonus: 0,
          closedOrdersBonusPct: 0,
        })
        .mockResolvedValueOnce({
          userId: 'disp-2',
          salaryBase: 8000,
          dailyTurnoverPct: 0,
          leafletBonus: 0,
          closedOrdersBonusPct: 0,
        });
      prisma.order.findMany.mockResolvedValue([]);
      prisma.adDailyReport.findMany.mockResolvedValue([]);

      const rows = await svc.summaryDispatcherPay('2026-03-01', '2026-03-31');

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: Role.DISPATCHER, status: UserStatus.ACTIVE },
        select: { id: true, fullName: true, role: true, cityId: true },
        orderBy: { fullName: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        userId: 'disp-1',
        fullName: 'Анна',
        salaryBase: 5000,
        total: 5000,
      });
      expect(rows[1]).toMatchObject({
        userId: 'disp-2',
        fullName: 'Борис',
        salaryBase: 8000,
        total: 8000,
      });
      expect(prisma.order.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.adDailyReport.findMany).toHaveBeenCalledTimes(2);
    });
  });
});
