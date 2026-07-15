import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { SettlementsService } from './settlements.service';

describe('SettlementsService', () => {
  const prisma = {
    masterSettlement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    order: {
      findMany: jest.fn(),
    },
    master: {
      findUnique: jest.fn(),
    },
  } as any;

  const branch = {
    allowedCityIds: jest.fn(),
    resolveCityIds: jest.fn(),
    cityWhere: jest.fn(),
  } as any;

  const svc = new SettlementsService(prisma, branch);

  const userId = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
    branch.cityWhere.mockImplementation((cityIds: string[] | null) =>
      cityIds ? { in: cityIds } : undefined,
    );
  });

  describe('confirm', () => {
    it('throws NotFoundException when settlement row is missing', async () => {
      prisma.masterSettlement.findUnique.mockResolvedValue(null);

      await expect(svc.confirm('missing', userId, Role.ADMIN)).rejects.toThrow(
        NotFoundException,
      );
      await expect(svc.confirm('missing', userId, Role.ADMIN)).rejects.toThrow(
        'Расчёт не найден',
      );
    });

    it('sets confirmedOnce=true on first confirmation', async () => {
      prisma.masterSettlement.findUnique.mockResolvedValue({
        id: 's-1',
        cityId: 'city-A',
        confirmedOnce: false,
        confirmedTwice: false,
      });
      branch.allowedCityIds.mockResolvedValue(['city-A']);
      prisma.masterSettlement.update.mockResolvedValue({
        id: 's-1',
        confirmedOnce: true,
      });

      const result = await svc.confirm('s-1', userId, Role.ADMIN);

      expect(result.confirmedOnce).toBe(true);
      expect(prisma.masterSettlement.update).toHaveBeenCalledWith({
        where: { id: 's-1' },
        data: { confirmedOnce: true },
        include: {
          master: { include: { user: true } },
          confirmedBy: true,
        },
      });
    });

    it('sets confirmedTwice, confirmedById and confirmedAt on second confirmation', async () => {
      const before = Date.now();
      prisma.masterSettlement.findUnique.mockResolvedValue({
        id: 's-1',
        cityId: 'city-A',
        confirmedOnce: true,
        confirmedTwice: false,
      });
      branch.allowedCityIds.mockResolvedValue(['city-A']);
      prisma.masterSettlement.update.mockResolvedValue({
        id: 's-1',
        confirmedTwice: true,
        confirmedById: userId,
        confirmedAt: new Date(),
      });

      const result = await svc.confirm('s-1', userId, Role.ADMIN);
      const after = Date.now();

      expect(result.confirmedTwice).toBe(true);
      const updateCall = prisma.masterSettlement.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 's-1' });
      expect(updateCall.data.confirmedTwice).toBe(true);
      expect(updateCall.data.confirmedById).toBe(userId);
      expect(updateCall.data.confirmedAt.getTime()).toBeGreaterThanOrEqual(
        before,
      );
      expect(updateCall.data.confirmedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('throws BadRequestException when already confirmed twice', async () => {
      prisma.masterSettlement.findUnique.mockResolvedValue({
        id: 's-1',
        cityId: 'city-A',
        confirmedOnce: true,
        confirmedTwice: true,
      });
      branch.allowedCityIds.mockResolvedValue(['city-A']);

      await expect(svc.confirm('s-1', userId, Role.ADMIN)).rejects.toThrow(
        BadRequestException,
      );
      await expect(svc.confirm('s-1', userId, Role.ADMIN)).rejects.toThrow(
        'Уже подтверждено дважды',
      );
      expect(prisma.masterSettlement.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when settlement cityId is outside allowed branches', async () => {
      prisma.masterSettlement.findUnique.mockResolvedValue({
        id: 's-1',
        cityId: 'city-foreign',
        confirmedOnce: false,
        confirmedTwice: false,
      });
      branch.allowedCityIds.mockResolvedValue(['city-A']);

      await expect(svc.confirm('s-1', userId, Role.ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(svc.confirm('s-1', userId, Role.ADMIN)).rejects.toThrow(
        'Расчёт вне вашего филиала',
      );
    });
  });

  describe('preview', () => {
    it('aggregates toCompany by master across multiple orders', async () => {
      branch.allowedCityIds.mockResolvedValue(['city-A']);
      branch.resolveCityIds.mockReturnValue(['city-A']);
      prisma.order.findMany.mockResolvedValue([
        {
          masterId: 'm-1',
          master: { user: { fullName: 'Иванов' } },
          payment: { toCompany: 100 },
        },
        {
          masterId: 'm-1',
          master: { user: { fullName: 'Иванов' } },
          payment: { toCompany: 250 },
        },
      ]);

      const result = await svc.preview(
        '2026-01-01',
        '2026-01-31',
        userId,
        Role.ADMIN,
      );

      expect(result).toEqual([
        { masterId: 'm-1', name: 'Иванов', amount: 350, count: 2 },
      ]);
      const toEnd = new Date('2026-01-31');
      toEnd.setHours(23, 59, 59, 999);
      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: {
          status: OrderStatus.DONE,
          createdAt: {
            gte: new Date('2026-01-01'),
            lte: toEnd,
          },
          masterId: { not: null },
          cityId: { in: ['city-A'] },
        },
        include: { payment: true, master: { include: { user: true } } },
      });
    });
  });

  describe('create', () => {
    it('sets cityId and auto amount from toCompany on create', async () => {
      prisma.master.findUnique.mockResolvedValue({
        id: 'm-1',
        cityId: 'city-A',
      });
      branch.allowedCityIds.mockResolvedValue(['city-A']);
      branch.resolveCityIds.mockReturnValue(['city-A']);
      prisma.order.findMany.mockResolvedValue([
        {
          masterId: 'm-1',
          master: { user: { fullName: 'Иванов' } },
          payment: { toCompany: 1000 },
        },
      ]);
      prisma.masterSettlement.create.mockResolvedValue({
        id: 's-new',
        cityId: 'city-A',
        amount: 1000,
      });

      await svc.create(
        {
          masterId: 'm-1',
          periodFrom: '2026-01-01',
          periodTo: '2026-01-31',
        },
        userId,
        Role.ADMIN,
      );

      expect(prisma.masterSettlement.create).toHaveBeenCalledWith({
        data: {
          masterId: 'm-1',
          cityId: 'city-A',
          amount: 1000,
          periodFrom: new Date('2026-01-01'),
          periodTo: new Date('2026-01-31'),
        },
        include: { master: { include: { user: true } } },
      });
    });

    it('throws ForbiddenException when master cityId is outside allowed for non-OWNER', async () => {
      prisma.master.findUnique.mockResolvedValue({
        id: 'm-1',
        cityId: 'city-foreign',
      });
      branch.allowedCityIds.mockResolvedValue(['city-A']);

      await expect(
        svc.create(
          {
            masterId: 'm-1',
            periodFrom: '2026-01-01',
            periodTo: '2026-01-31',
          },
          userId,
          Role.ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        svc.create(
          {
            masterId: 'm-1',
            periodFrom: '2026-01-01',
            periodTo: '2026-01-31',
          },
          userId,
          Role.ADMIN,
        ),
      ).rejects.toThrow('Мастер вне вашего филиала');
    });
  });

  describe('list', () => {
    it('applies cityWhere filter when requested cityId is outside allowed for non-OWNER', async () => {
      branch.allowedCityIds.mockResolvedValue(['city-A']);
      branch.resolveCityIds.mockReturnValue([]);
      prisma.masterSettlement.findMany.mockResolvedValue([]);

      await svc.list(userId, Role.ADMIN, 'city-foreign');

      expect(branch.resolveCityIds).toHaveBeenCalledWith(
        ['city-A'],
        'city-foreign',
      );
      expect(prisma.masterSettlement.findMany).toHaveBeenCalledWith({
        where: { cityId: { in: [] } },
        include: { master: { include: { user: true } }, confirmedBy: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
