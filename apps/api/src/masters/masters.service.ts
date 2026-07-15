import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MastersService {
  constructor(private readonly prisma: PrismaService) {}

  list(activeOnly = true) {
    return this.prisma.master.findMany({
      where: activeOnly ? { status: UserStatus.ACTIVE } : undefined,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(input: {
    fullName: string;
    login?: string;
    password?: string;
    phone?: string;
    cityId?: string;
    telegramId?: string;
  }) {
    const login =
      input.login?.trim().toLowerCase() ||
      `master_${Date.now().toString(36)}`;
    const exists = await this.prisma.user.findUnique({ where: { login } });
    if (exists) throw new ConflictException('Логин занят');

    const passwordHash = await bcrypt.hash(input.password ?? 'master123', 10);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          login,
          passwordHash,
          fullName: input.fullName.trim(),
          role: Role.MASTER,
          phone: input.phone?.trim() || null,
          cityId: input.cityId?.trim() || null,
          telegramId: input.telegramId?.trim() || null,
          status: UserStatus.ACTIVE,
          hiredAt: new Date(),
        },
      });
      // Мастер без кабинета: роль на User остаётся служебной;
      // доступ в web не выдаём по masterProfile, выбор идёт из Master.
      return tx.master.create({
        data: { userId: user.id, status: UserStatus.ACTIVE },
        include: { user: true },
      });
    });
  }

  /**
   * «Удаление» мастера: статус FIRED, открытые заявки без исполнителя.
   */
  async deactivate(id: string) {
    const master = await this.prisma.master.findUnique({ where: { id } });
    if (!master) throw new NotFoundException('Мастер не найден');

    return this.prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: {
          masterId: id,
          status: {
            notIn: ['DONE', 'REFUSAL', 'CANCELLED_CC'],
          },
        },
        data: { masterId: null },
      });

      await tx.user.update({
        where: { id: master.userId },
        data: { status: UserStatus.FIRED, firedAt: new Date() },
      });

      return tx.master.update({
        where: { id },
        data: { status: UserStatus.FIRED },
        include: { user: true },
      });
    });
  }

  /** Восстановление мастера (аналог users.restore). */
  async restore(id: string) {
    const master = await this.prisma.master.findUnique({ where: { id } });
    if (!master) throw new NotFoundException('Мастер не найден');

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: master.userId },
        data: {
          status: UserStatus.ACTIVE,
          firedAt: null,
          fireReason: null,
          recommendedHire: null,
        },
      });

      return tx.master.update({
        where: { id },
        data: { status: UserStatus.ACTIVE },
        include: { user: true },
      });
    });
  }
}
