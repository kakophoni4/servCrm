import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.adDailyReport.findMany({
      include: { city: true, createdBy: true },
      orderBy: { reportDate: 'desc' },
      take: 90,
    });
  }

  create(
    input: {
      reportDate: string;
      cityId?: string;
      promotersCount?: number;
      leafletsIssued?: number;
      leafletsSpread?: number;
      cardsIssued?: number;
      cardsSpread?: number;
      stickersIssued?: number;
      stickersSpread?: number;
      avitoAdsCount?: number;
      leafletsStock?: number;
      cardsStock?: number;
      documentPath?: string;
    },
    userId: string,
  ) {
    return this.prisma.adDailyReport.create({
      data: {
        reportDate: new Date(input.reportDate),
        cityId: input.cityId,
        promotersCount: input.promotersCount ?? 0,
        leafletsIssued: input.leafletsIssued ?? 0,
        leafletsSpread: input.leafletsSpread ?? 0,
        cardsIssued: input.cardsIssued ?? 0,
        cardsSpread: input.cardsSpread ?? 0,
        stickersIssued: input.stickersIssued ?? 0,
        stickersSpread: input.stickersSpread ?? 0,
        avitoAdsCount: input.avitoAdsCount ?? 0,
        leafletsStock: input.leafletsStock ?? 0,
        cardsStock: input.cardsStock ?? 0,
        documentPath: input.documentPath,
        createdById: userId,
      },
    });
  }
}
