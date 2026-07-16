import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { login: dto.login.trim().toLowerCase() },
      include: { city: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    if (user.role === 'MASTER') {
      throw new UnauthorizedException(
        'У мастеров нет веб-кабинета. Используйте бот (фаза 4).',
      );
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    const payload = {
      sub: user.id,
      login: user.login,
      role: user.role,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        login: user.login,
        fullName: user.fullName,
        role: user.role,
        cityId: user.cityId,
        cityName: user.city?.name ?? null,
        permissions: user.permissions ?? [],
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { city: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      login: user.login,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      cityId: user.cityId,
      cityName: user.city?.name ?? null,
      permissions: user.permissions ?? [],
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new BadRequestException('Неверный текущий пароль');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'Новый пароль должен отличаться от текущего',
      );
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { ok: true };
  }
}
