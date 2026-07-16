import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { BranchScopeService } from '../common/branch/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/utils/phone';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchScopeService,
  ) {}

  async list(
    userId: string,
    role: Role | string,
    requestedCityId?: string,
  ) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const cityIds = this.branch.resolveCityIds(allowed, requestedCityId);
    return this.prisma.client.findMany({
      where: {
        cityId: this.branch.cityWhere(cityIds),
      },
      include: {
        ageCategory: true,
        city: true,
        _count: { select: { orders: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(id: string, userId: string, role: Role | string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        ageCategory: true,
        city: true,
        orders: {
          orderBy: { createdAt: 'desc' },
          include: { payment: true, master: { include: { user: true } } },
        },
      },
    });
    if (!client) throw new NotFoundException('Клиент не найден');

    const allowed = await this.branch.allowedCityIds(userId, role);
    if (
      allowed !== null &&
      client.cityId &&
      !allowed.includes(client.cityId)
    ) {
      throw new ForbiddenException('Клиент вне вашего филиала');
    }

    return client;
  }

  async search(phone: string) {
    const normalized = normalizePhone(phone);
    return this.prisma.client.findMany({
      where:
        normalized.length >= 11
          ? { phoneNormalized: normalized }
          : { phoneNormalized: { contains: normalized } },
      take: 20,
      include: { _count: { select: { orders: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async updateComment(id: string, branchComment: string) {
    return this.prisma.client.update({
      where: { id },
      data: { branchComment },
    });
  }
}
