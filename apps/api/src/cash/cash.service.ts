import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  CashDirection,
  CashExpenseBasis,
  CashIncomeBasis,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ADMIN_EXPENSE: CashExpenseBasis[] = [
  CashExpenseBasis.SALARY_PROMO,
  CashExpenseBasis.OPERATING,
];

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  list(from?: string, to?: string) {
    return this.prisma.cashTx.findMany({
      where: {
        createdAt: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      include: { city: true, order: true, createdBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  income(
    input: {
      amount: number;
      incomeBasis: CashIncomeBasis;
      description?: string;
      cityId?: string;
      orderId?: string;
      documentPath?: string;
    },
    userId: string,
    role: Role,
  ) {
    if (role === Role.DIRECTOR) {
      throw new ForbiddenException('Директору приход недоступен');
    }
    if (role !== Role.ADMIN && role !== Role.OWNER) {
      throw new ForbiddenException('Недостаточно прав');
    }
    return this.prisma.cashTx.create({
      data: {
        direction: CashDirection.INCOME,
        amount: input.amount,
        incomeBasis: input.incomeBasis,
        description: input.description,
        cityId: input.cityId,
        orderId: input.orderId,
        documentPath: input.documentPath,
        createdById: userId,
      },
    });
  }

  expense(
    input: {
      amount: number;
      expenseBasis: CashExpenseBasis;
      expenseSubtype?: string;
      description?: string;
      cityId?: string;
      documentPath?: string;
    },
    userId: string,
    role: Role,
  ) {
    if (!input.documentPath) {
      throw new BadRequestException('Без документа нельзя провести расход');
    }
    if (role === Role.ADMIN && !ADMIN_EXPENSE.includes(input.expenseBasis)) {
      throw new ForbiddenException(
        'Админ может только ЗП промоутера и операционные расходы',
      );
    }
    if (
      role !== Role.ADMIN &&
      role !== Role.DIRECTOR &&
      role !== Role.OWNER
    ) {
      throw new ForbiddenException('Недостаточно прав');
    }
    return this.prisma.cashTx.create({
      data: {
        direction: CashDirection.EXPENSE,
        amount: input.amount,
        expenseBasis: input.expenseBasis,
        expenseSubtype: input.expenseSubtype,
        description: input.description,
        cityId: input.cityId,
        documentPath: input.documentPath,
        createdById: userId,
      },
    });
  }

  collection(
    input: {
      amount: number;
      description?: string;
      cityId?: string;
      documentPath?: string;
    },
    userId: string,
    role: Role,
  ) {
    if (role !== Role.ADMIN && role !== Role.DIRECTOR && role !== Role.OWNER) {
      throw new ForbiddenException('Недостаточно прав');
    }
    return this.prisma.cashTx.create({
      data: {
        direction: CashDirection.COLLECTION,
        amount: input.amount,
        description: input.description ?? 'Инкассация',
        cityId: input.cityId,
        documentPath: input.documentPath,
        createdById: userId,
      },
    });
  }
}
