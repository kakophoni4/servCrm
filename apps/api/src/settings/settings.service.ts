import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  getDispatcherPay(userId: string) {
    return this.prisma.dispatcherPaySettings.findUnique({ where: { userId } });
  }

  upsertDispatcherPay(
    userId: string,
    data: {
      salaryBase?: number;
      dailyTurnoverPct?: number;
      leafletBonus?: number;
      closedOrdersBonusPct?: number;
    },
  ) {
    return this.prisma.dispatcherPaySettings.upsert({
      where: { userId },
      create: {
        userId,
        salaryBase: data.salaryBase ?? 0,
        dailyTurnoverPct: data.dailyTurnoverPct ?? 0,
        leafletBonus: data.leafletBonus ?? 0,
        closedOrdersBonusPct: data.closedOrdersBonusPct ?? 0,
      },
      update: data,
    });
  }
}
