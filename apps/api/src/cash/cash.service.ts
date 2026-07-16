import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  CashDirection,
  CashExpenseBasis,
  CashIncomeBasis,
  Role,
  UserStatus,
} from '@prisma/client';
import { BotService } from '../bot/bot.service';
import { BranchScopeService } from '../common/branch/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementsService } from '../settlements/settlements.service';

const ADMIN_EXPENSE: CashExpenseBasis[] = [
  CashExpenseBasis.SALARY_PROMO,
  CashExpenseBasis.OPERATING,
];

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchScopeService,
    @Inject(forwardRef(() => BotService))
    private readonly bot: BotService,
    private readonly settlements: SettlementsService,
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
      include: {
        city: true,
        order: true,
        master: { include: { user: true } },
        createdBy: true,
      },
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
      masterId?: string;
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
    if (input.incomeBasis === CashIncomeBasis.ORDER) {
      throw new BadRequestException(
        'Приход по заявке создаётся автоматически при статусе «Готов»',
      );
    }

    let masterId: string | null = null;
    if (input.masterId) {
      if (input.incomeBasis !== CashIncomeBasis.FINE) {
        throw new BadRequestException(
          'Мастера можно указать только для штрафа',
        );
      }
      const master = await this.prisma.master.findUnique({
        where: { id: input.masterId },
      });
      if (!master || master.status !== UserStatus.ACTIVE) {
        throw new NotFoundException('Мастер не найден');
      }
      masterId = master.id;
    }

    const cityId = await this.resolveWriteCityId(userId, role, input.cityId);
    const row = await this.prisma.cashTx.create({
      data: {
        direction: CashDirection.INCOME,
        amount: input.amount,
        incomeBasis: input.incomeBasis,
        description: input.description,
        cityId,
        orderId: input.orderId,
        masterId,
        documentPath: input.documentPath,
        createdById: userId,
      },
      include: {
        master: { include: { user: true } },
        city: true,
      },
    });

    if (masterId && input.incomeBasis === CashIncomeBasis.FINE) {
      await this.bot
        .notifyMasterFine(masterId, Number(input.amount), input.description)
        .catch(() => undefined);
      await this.settlements
        .syncMasterMonth(masterId, new Date(), cityId ?? null)
        .catch(() => undefined);
    }

    return row;
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
      cityId: string;
      description?: string;
    },
    userId: string,
    role: Role,
  ) {
    if (role !== Role.OWNER) {
      throw new ForbiddenException('Инкассация доступна только владельцу');
    }
    if (!input.cityId?.trim()) {
      throw new BadRequestException('Укажите филиал');
    }
    const city = await this.prisma.city.findUnique({
      where: { id: input.cityId },
      select: { id: true },
    });
    if (!city) throw new BadRequestException('Филиал не найден');

    return this.prisma.cashTx.create({
      data: {
        direction: CashDirection.COLLECTION,
        amount: input.amount,
        cityId: city.id,
        description: input.description ?? 'Инкассация',
        createdById: userId,
      },
    });
  }

  async getDocument(
    id: string,
    userId: string,
    role: Role | string,
  ): Promise<{ relPath: string; fileName: string }> {
    const tx = await this.prisma.cashTx.findUnique({
      where: { id },
      select: { documentPath: true, cityId: true },
    });
    if (!tx?.documentPath) {
      throw new NotFoundException('Документ не прикреплён');
    }

    const allowed = await this.branch.allowedCityIds(userId, role);
    if (
      allowed !== null &&
      tx.cityId &&
      !allowed.includes(tx.cityId)
    ) {
      throw new ForbiddenException('Операция вне вашего филиала');
    }

    const fileName =
      tx.documentPath.split('/').pop() || `cash-${id}`;
    return { relPath: tx.documentPath, fileName };
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
