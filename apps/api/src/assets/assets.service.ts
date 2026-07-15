import { Injectable, NotFoundException } from '@nestjs/common';
import { AssetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  list(status?: AssetStatus) {
    return this.prisma.asset.findMany({
      where: status ? { status } : undefined,
      include: { city: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(input: {
    title: string;
    name: string;
    condition?: string;
    cityId?: string;
  }) {
    return this.prisma.asset.create({ data: input });
  }

  async writeOff(id: string, note?: string) {
    const row = await this.prisma.asset.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Имущество не найдено');
    return this.prisma.asset.update({
      where: { id },
      data: {
        status: AssetStatus.WRITTEN_OFF,
        writtenOffAt: new Date(),
        writeOffNote: note,
      },
    });
  }
}
