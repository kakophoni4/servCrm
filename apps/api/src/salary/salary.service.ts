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
    typeTech?: string;
    masterId?: string;
    reinvestPct?: number;
  }) {
    return this.prisma.salaryCategory.create({
      data: {
        minSum: data.minSum,
        maxSum: data.maxSum ?? null,
        percent: data.percent,
        note: data.note,
        typeTech: data.typeTech || null,
        masterId: data.masterId || null,
        reinvestPct: data.reinvestPct,
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
      typeTech: string;
      masterId: string;
      reinvestPct: number;
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

  async termsFor(workSum: number, typeTech?: string | null, masterId?: string | null) {
    const rows = (await this.list()).filter(r => (!r.typeTech || r.typeTech === typeTech) && (!r.masterId || r.masterId === masterId) && workSum >= Number(r.minSum) && (r.maxSum == null || workSum <= Number(r.maxSum)));
    rows.sort((a,b)=> ((b.masterId?2:0)+(b.typeTech?1:0))-((a.masterId?2:0)+(a.typeTech?1:0)) || b.updatedAt.getTime()-a.updatedAt.getTime());
    return {masterPct: rows[0] ? Number(rows[0].percent) : 0.5, reinvestPct: rows[0] ? Number(rows[0].reinvestPct) : 0.5};
  }

  private async ensure(id: string) {
    const row = await this.prisma.salaryCategory.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Категория не найдена');
  }
}
