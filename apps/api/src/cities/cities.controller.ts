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
  /** Технический код; если не передан — генерируется из названия. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

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

const CYR_TO_LAT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function toSlug(text: string): string {
  const lat = text
    .toLowerCase()
    .split('')
    .map((ch) => CYR_TO_LAT[ch] ?? ch)
    .join('');
  return (
    lat
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'branch'
  );
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
  async create(@Body() dto: CreateCityDto) {
    const name = dto.name.trim();
    const cityName = dto.cityName?.trim() || null;
    const code = dto.code?.trim()
      ? dto.code.trim().toLowerCase()
      : await this.uniqueCode(toSlug([cityName, name].filter(Boolean).join('-')));

    return this.prisma.city.create({
      data: {
        code,
        name,
        cityName,
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

  private async uniqueCode(base: string): Promise<string> {
    let code = base;
    let n = 2;
    while (await this.prisma.city.findUnique({ where: { code } })) {
      code = `${base}-${n++}`;
      if (n > 100) {
        code = `${base}-${Date.now().toString(36)}`;
        break;
      }
    }
    return code;
  }
}
