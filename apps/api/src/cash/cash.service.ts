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
import { BranchScopeService } from '../common/branch/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';

const ADMIN_EXPENSE: CashExpenseBasis[] = [
  CashExpenseBasis.SALARY_PROMO,
  CashExpenseBasis.OPERATING,
];

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchScopeService,
  ) {}

  async list(
    userId: string,
    role: Role | string,
    requestedCityId?: string,
    from?: string,
    to?: string,
  ) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const cityIds = this.branch.resolveCityIds(allowed, requestedCityId);
    return this.prisma.cashTx.findMany({
      where: {
        createdAt: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
        cityId: this.branch.cityWhere(cityIds),
      },
      include: { city: true, order: true, createdBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async income(
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
    const cityId = await this.resolveWriteCityId(userId, role, input.cityId);
    return this.prisma.cashTx.create({
      data: {
        direction: CashDirection.INCOME,
        amount: input.amount,
        incomeBasis: input.incomeBasis,
        description: input.description,
        cityId,
        orderId: input.orderId,
        documentPath: input.documentPath,
        createdById: userId,
      },
    });
  }

  async expense(
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
    const cityId = await this.resolveWriteCityId(userId, role, input.cityId);
    return this.prisma.cashTx.create({
      data: {
        direction: CashDirection.EXPENSE,
        amount: input.amount,
        expenseBasis: input.expenseBasis,
        expenseSubtype: input.expenseSubtype,
        description: input.description,
        cityId,
        documentPath: input.documentPath,
        createdById: userId,
      },
    });
  }

  async collection(
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
    const cityId = await this.resolveWriteCityId(userId, role, input.cityId);
    return this.prisma.cashTx.create({
      data: {
        direction: CashDirection.COLLECTION,
        amount: input.amount,
        description: input.description ?? 'Инкассация',
        cityId,
        documentPath: input.documentPath,
        createdById: userId,
      },
    });
  }

  /**
   * OWNER: cityId без ограничений (можно null).
   * Остальные: чужой cityId запрещён; без cityId — свой филиал (allowed[0]).
   */
  private async resolveWriteCityId(
    userId: string,
    role: Role,
    requestedCityId?: string,
  ): Promise<string | undefined> {
    if (role === Role.OWNER) {
      return requestedCityId;
    }

    const allowed = await this.branch.allowedCityIds(userId, role);
    if (!allowed?.length) {
      throw new BadRequestException('Филиал не назначен');
    }
    if (requestedCityId) {
      if (!allowed.includes(requestedCityId)) {
        throw new ForbiddenException('Филиал вне доступа');
      }
      return requestedCityId;
    }
    return allowed[0];
  }
}
