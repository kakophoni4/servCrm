import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsNotEmpty, IsString } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

class CreateCityDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
}

@Controller('cities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  list() {
    return this.prisma.city.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  @Get('age-categories')
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  ageCategories() {
    return this.prisma.ageCategory.findMany({ orderBy: { sort: 'asc' } });
  }

  @Post()
  @Roles(Role.OWNER)
  create(@Body() dto: CreateCityDto) {
    return this.prisma.city.create({
      data: {
        code: dto.code.trim().toLowerCase(),
        name: dto.name.trim(),
      },
    });
  }
}
