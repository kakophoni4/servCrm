import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Скоуп доступа по филиалам (городам).
 * - OWNER видит все филиалы (null = без ограничения);
 * - DIRECTOR — свой город + все филиалы из branch_directors;
 * - ADMIN/DISPATCHER — только свой город (user.cityId);
 * - MASTER — только свои заявки (скоуп не применяется).
 */
@Injectable()
export class BranchScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** null = все филиалы; [] = ни одного (филиал не назначен). */
  async allowedCityIds(
    userId: string,
    role: Role | string,
  ): Promise<string[] | null> {
    if (role === Role.OWNER) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        cityId: true,
        managedBranches: { select: { cityId: true } },
      },
    });
    if (!user) return [];

    const ids = new Set<string>();
    if (user.cityId) ids.add(user.cityId);
    for (const b of user.managedBranches) ids.add(b.cityId);
    return [...ids];
  }

  /**
   * Итоговый фильтр городов с учётом запрошенного (OWNER-переключатель).
   * null = без фильтра; [] = пусто (ничего не показывать).
   */
  resolveCityIds(
    allowed: string[] | null,
    requested?: string | null,
  ): string[] | null {
    if (!requested) return allowed;
    if (allowed === null) return [requested];
    return allowed.includes(requested) ? [requested] : [];
  }

  /** Prisma-фрагмент для where.cityId. */
  cityWhere(cityIds: string[] | null): { in: string[] } | undefined {
    return cityIds ? { in: cityIds } : undefined;
  }
}
