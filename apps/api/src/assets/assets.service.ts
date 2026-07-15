import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssetStatus, Role } from '@prisma/client';
import { BranchScopeService } from '../common/branch/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchScopeService,
  ) {}

  async list(
    userId: string,
    role: Role,
    requestedCityId?: string,
    status?: AssetStatus,
  ) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const cityIds = this.branch.resolveCityIds(allowed, requestedCityId);
    return this.prisma.asset.findMany({
      where: {
        ...(status ? { status } : {}),
        cityId: this.branch.cityWhere(cityIds),
      },
      include: { city: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    input: {
      title: string;
      name: string;
      condition?: string;
      cityId?: string;
    },
    userId: string,
    role: Role,
  ) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    let cityId = input.cityId;
    if (allowed !== null) {
      if (!allowed.length) {
        throw new BadRequestException('Филиал не назначен');
      }
      if (cityId) {
        if (!allowed.includes(cityId)) {
          throw new ForbiddenException('Филиал вне доступа');
        }
      } else {
        cityId = allowed[0];
      }
    }
    return this.prisma.asset.create({
      data: { ...input, cityId },
    });
  }

  async writeOff(
    id: string,
    note: string | undefined,
    userId: string,
    role: Role,
  ) {
    const row = await this.prisma.asset.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Имущество не найдено');

    const allowed = await this.branch.allowedCityIds(userId, role);
    if (
      allowed !== null &&
      row.cityId &&
      !allowed.includes(row.cityId)
    ) {
      throw new ForbiddenException('Имущество вне вашего филиала');
    }

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
