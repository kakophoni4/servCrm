import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

class CreatePartnerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

class UpdatePartnerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

@Controller('partners')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PartnersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Активные партнёры — для выбора в заявке. */
  @Get()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('partners.read')
  list() {
    return this.prisma.partner.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Все партнёры (включая скрытых) — справочник в настройках. */
  @Get('manage')
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('partners.write')
  listAll() {
    return this.prisma.partner.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  @Post()
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('partners.write')
  async create(@Body() dto: CreatePartnerDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Укажите название');
    const exists = await this.prisma.partner.findUnique({ where: { name } });
    if (exists) {
      if (!exists.active) {
        return this.prisma.partner.update({
          where: { id: exists.id },
          data: { active: true },
        });
      }
      throw new ConflictException('Партнёр с таким именем уже есть');
    }
    return this.prisma.partner.create({ data: { name } });
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('partners.write')
  async update(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    const existing = await this.prisma.partner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Партнёр не найден');

    const name = dto.name?.trim();
    if (name && name !== existing.name) {
      const clash = await this.prisma.partner.findUnique({ where: { name } });
      if (clash && clash.id !== id) {
        throw new ConflictException('Партнёр с таким именем уже есть');
      }
    }

    return this.prisma.partner.update({
      where: { id },
      data: {
        name: name || undefined,
        active: dto.active,
      },
    });
  }
}
