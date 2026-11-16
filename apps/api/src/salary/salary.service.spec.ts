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

 describe('pricing rule priority',()=>{
  it('prefers the master and equipment rule, then master, then equipment',async()=>{
   const now=new Date();const rows=[
    {minSum:0,maxSum:null,percent:0.5,reinvestPct:0.25,updatedAt:now},
    {minSum:0,maxSum:null,percent:0.6,reinvestPct:0.2,typeTech:'ХД',updatedAt:now},
    {minSum:0,maxSum:null,percent:0.65,reinvestPct:0.15,masterId:'m',updatedAt:now},
    {minSum:0,maxSum:null,percent:0.7,reinvestPct:0.1,masterId:'m',typeTech:'ХД',updatedAt:now},
   ];const service=new SalaryService({salaryCategory:{findMany:async()=>rows}} as any);
   expect(await service.termsFor(5000,'ХД','m')).toEqual({masterPct:0.7,reinvestPct:0.1});
   expect(await service.termsFor(5000,'ПК','m')).toEqual({masterPct:0.65,reinvestPct:0.15});
   expect(await service.termsFor(5000,'ХД','other')).toEqual({masterPct:0.6,reinvestPct:0.2});
  });
 });
