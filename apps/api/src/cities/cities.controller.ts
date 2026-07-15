import {
  Body,
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

class CreateCityDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  cityName?: string;
}

class UpdateCityDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  cityName?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

@Controller('cities')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('cities.read')
  list() {
    return this.prisma.city.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Все филиалы, включая неактивные — для справочника владельца. */
  @Get('manage')
  @Roles(Role.OWNER)
  @RequirePermissions('cities.manage')
  listAll() {
    return this.prisma.city.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  @Get('age-categories')
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('cities.read')
  ageCategories() {
    return this.prisma.ageCategory.findMany({ orderBy: { sort: 'asc' } });
  }

  @Post()
  @Roles(Role.OWNER)
  @RequirePermissions('cities.manage')
  create(@Body() dto: CreateCityDto) {
    return this.prisma.city.create({
      data: {
        code: dto.code.trim().toLowerCase(),
        name: dto.name.trim(),
        cityName: dto.cityName?.trim() || null,
      },
    });
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @RequirePermissions('cities.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateCityDto) {
    const existing = await this.prisma.city.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Филиал не найден');
    return this.prisma.city.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        cityName:
          dto.cityName === undefined
            ? undefined
            : dto.cityName.trim() || null,
        active: dto.active,
      },
    });
  }
}
