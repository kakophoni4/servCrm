import { NotFoundException } from '@nestjs/common';
import { SalaryService } from './salary.service';

describe('SalaryService', () => {
  const prisma = {
    salaryCategory: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;

  const svc = new SalaryService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('percentFor', () => {
    it('delegates to pickSalaryPercent over bands from findMany', async () => {
      prisma.salaryCategory.findMany.mockResolvedValue([
        { minSum: 0, maxSum: 1000, percent: 0.3 },
        { minSum: 1000, maxSum: 5000, percent: 0.4 },
        { minSum: 5000, maxSum: null, percent: 0.5 },
      ]);

      const result = await svc.percentFor(2500);

      expect(result).toBe(0.4);
      expect(prisma.salaryCategory.findMany).toHaveBeenCalledWith({
        orderBy: { minSum: 'asc' },
      });
    });
  });

  describe('ensure (via update/remove)', () => {
    it('update throws NotFoundException when category is missing', async () => {
      prisma.salaryCategory.findUnique.mockResolvedValue(null);

      await expect(svc.update('missing-id', { percent: 0.5 })).rejects.toThrow(
        NotFoundException,
      );
      await expect(svc.update('missing-id', { percent: 0.5 })).rejects.toThrow(
        'Категория не найдена',
      );
      expect(prisma.salaryCategory.update).not.toHaveBeenCalled();
    });

    it('remove throws NotFoundException when category is missing', async () => {
      prisma.salaryCategory.findUnique.mockResolvedValue(null);

      await expect(svc.remove('missing-id')).rejects.toThrow(NotFoundException);
      await expect(svc.remove('missing-id')).rejects.toThrow(
        'Категория не найдена',
      );
      expect(prisma.salaryCategory.delete).not.toHaveBeenCalled();
    });
  });
});
