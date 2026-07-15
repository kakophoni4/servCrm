import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CashExpenseBasis, CashIncomeBasis, Role } from '@prisma/client';
import { CashService } from './cash.service';

describe('CashService', () => {
  const prisma = {
    cashTx: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  } as any;

  const branch = {
    allowedCityIds: jest.fn(),
    resolveCityIds: jest.fn(),
    cityWhere: jest.fn(),
  } as any;

  const svc = new CashService(prisma, branch);

  const userId = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
    branch.cityWhere.mockImplementation((cityIds: string[] | null) =>
      cityIds ? { in: cityIds } : undefined,
    );
    prisma.cashTx.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve(data),
    );
  });

  describe('income', () => {
    it('throws ForbiddenException for DIRECTOR', async () => {
      await expect(
        svc.income(
          {
            amount: 100,
            incomeBasis: CashIncomeBasis.OTHER,
          },
          userId,
          Role.DIRECTOR,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        svc.income(
          {
            amount: 100,
            incomeBasis: CashIncomeBasis.OTHER,
          },
          userId,
          Role.DIRECTOR,
        ),
      ).rejects.toThrow('Директору приход недоступен');
    });

    it('throws ForbiddenException when role is neither ADMIN nor OWNER', async () => {
      await expect(
        svc.income(
          {
            amount: 100,
            incomeBasis: CashIncomeBasis.OTHER,
          },
          userId,
          Role.MASTER,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        svc.income(
          {
            amount: 100,
            incomeBasis: CashIncomeBasis.OTHER,
          },
          userId,
          Role.MASTER,
        ),
      ).rejects.toThrow('Недостаточно прав');
    });
  });

  describe('expense', () => {
    it('throws BadRequestException when documentPath is missing', async () => {
      await expect(
        svc.expense(
          {
            amount: 100,
            expenseBasis: CashExpenseBasis.OPERATING,
          },
          userId,
          Role.ADMIN,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.expense(
          {
            amount: 100,
            expenseBasis: CashExpenseBasis.OPERATING,
          },
          userId,
          Role.ADMIN,
        ),
      ).rejects.toThrow('Без документа нельзя провести расход');
    });

    it('throws ForbiddenException for ADMIN with expenseBasis outside ADMIN_EXPENSE', async () => {
      await expect(
        svc.expense(
          {
            amount: 100,
            expenseBasis: CashExpenseBasis.RENT_APT,
            documentPath: '/docs/1.pdf',
          },
          userId,
          Role.ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        svc.expense(
          {
            amount: 100,
            expenseBasis: CashExpenseBasis.RENT_APT,
            documentPath: '/docs/1.pdf',
          },
          userId,
          Role.ADMIN,
        ),
      ).rejects.toThrow(
        'Админ может только ЗП промоутера и операционные расходы',
      );
    });
  });

  describe('resolveWriteCityId (via income)', () => {
    it('uses allowed[0] when non-OWNER omits cityId', async () => {
      branch.allowedCityIds.mockResolvedValue(['city-A', 'city-B']);

      const result = await svc.income(
        {
          amount: 100,
          incomeBasis: CashIncomeBasis.OTHER,
        },
        userId,
        Role.ADMIN,
      );

      expect(result.cityId).toBe('city-A');
    });

    it('throws ForbiddenException when non-OWNER passes foreign cityId', async () => {
      branch.allowedCityIds.mockResolvedValue(['city-A']);

      await expect(
        svc.income(
          {
            amount: 100,
            incomeBasis: CashIncomeBasis.OTHER,
            cityId: 'city-foreign',
          },
          userId,
          Role.ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        svc.income(
          {
            amount: 100,
            incomeBasis: CashIncomeBasis.OTHER,
            cityId: 'city-foreign',
          },
          userId,
          Role.ADMIN,
        ),
      ).rejects.toThrow('Филиал вне доступа');
    });

    it('throws BadRequestException when non-OWNER has no assigned branch', async () => {
      branch.allowedCityIds.mockResolvedValue([]);

      await expect(
        svc.income(
          {
            amount: 100,
            incomeBasis: CashIncomeBasis.OTHER,
          },
          userId,
          Role.ADMIN,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.income(
          {
            amount: 100,
            incomeBasis: CashIncomeBasis.OTHER,
          },
          userId,
          Role.ADMIN,
        ),
      ).rejects.toThrow('Филиал не назначен');
    });

    it('passes cityId through unchanged for OWNER', async () => {
      const result = await svc.income(
        {
          amount: 100,
          incomeBasis: CashIncomeBasis.OTHER,
          cityId: 'city-X',
        },
        userId,
        Role.OWNER,
      );

      expect(result.cityId).toBe('city-X');
      expect(branch.allowedCityIds).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('applies cityWhere to findMany where.cityId for non-OWNER', async () => {
      branch.allowedCityIds.mockResolvedValue(['city-A']);
      branch.resolveCityIds.mockReturnValue(['city-A']);
      prisma.cashTx.findMany.mockResolvedValue([]);

      await svc.list(userId, Role.ADMIN, 'city-A');

      expect(branch.allowedCityIds).toHaveBeenCalledWith(userId, Role.ADMIN);
      expect(branch.resolveCityIds).toHaveBeenCalledWith(['city-A'], 'city-A');
      expect(prisma.cashTx.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: undefined,
            lte: undefined,
          },
          cityId: { in: ['city-A'] },
        },
        include: { city: true, order: true, createdBy: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
