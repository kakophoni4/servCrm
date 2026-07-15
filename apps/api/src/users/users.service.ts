import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

const userSelect = {
  id: true,
  login: true,
  fullName: true,
  role: true,
  status: true,
  phone: true,
  cityId: true,
  hiredAt: true,
  firedAt: true,
  fireReason: true,
  recommendedHire: true,
  createdAt: true,
  city: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(status?: UserStatus) {
    return this.prisma.user.findMany({
      where: {
        role: { not: Role.MASTER },
        ...(status ? { status } : {}),
      },
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(input: {
    login: string;
    password: string;
    fullName: string;
    role: Role;
    phone?: string;
    cityId?: string;
  }) {
    if (input.role === Role.MASTER) {
      throw new BadRequestException('Мастеров создавайте через /masters');
    }
    const login = input.login.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { login } });
    if (exists) throw new ConflictException('Логин занят');

    const passwordHash = await bcrypt.hash(input.password, 10);
    return this.prisma.user.create({
      data: {
        login,
        passwordHash,
        fullName: input.fullName.trim(),
        role: input.role,
        phone: input.phone,
        cityId: input.cityId,
        hiredAt: new Date(),
        status: UserStatus.ACTIVE,
      },
      select: userSelect,
    });
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  async fire(
    id: string,
    input: { reason: string; recommendedHire: boolean },
  ) {
    if (!input.reason?.trim()) {
      throw new BadRequestException('Укажите причину увольнения');
    }
    await this.get(id);
    return this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.FIRED,
        firedAt: new Date(),
        fireReason: input.reason,
        recommendedHire: input.recommendedHire,
      },
      select: userSelect,
    });
  }

  async restore(id: string) {
    await this.get(id);
    return this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.ACTIVE,
        firedAt: null,
        fireReason: null,
        recommendedHire: null,
      },
      select: userSelect,
    });
  }
}
