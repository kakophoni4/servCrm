import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { pickSalaryPercent, SalaryBand } from '../common/utils/formulas';

@Injectable()
export class SalaryService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.salaryCategory.findMany({
      orderBy: { minSum: 'asc' },
    });
  }

  create(data: {
    minSum: number;
    maxSum?: number | null;
    percent: number;
    note?: string;
  }) {
    return this.prisma.salaryCategory.create({
      data: {
        minSum: data.minSum,
        maxSum: data.maxSum ?? null,
        percent: data.percent,
        note: data.note,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      minSum: number;
      maxSum: number | null;
      percent: number;
      note: string;
    }>,
  ) {
    await this.ensure(id);
    return this.prisma.salaryCategory.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.ensure(id);
    return this.prisma.salaryCategory.delete({ where: { id } });
  }

  async bands(): Promise<SalaryBand[]> {
    const rows = await this.list();
    return rows.map((r) => ({
      minSum: Number(r.minSum),
      maxSum: r.maxSum == null ? null : Number(r.maxSum),
      percent: Number(r.percent),
    }));
  }

  async percentFor(workSum: number) {
    return pickSalaryPercent(workSum, await this.bands());
  }

  private async ensure(id: string) {
    const row = await this.prisma.salaryCategory.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Категория не найдена');
  }
}
