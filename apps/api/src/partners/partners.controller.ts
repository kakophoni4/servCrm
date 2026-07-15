import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsNotEmpty, IsString } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

class CreatePartnerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

@Controller('partners')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PartnersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  list() {
    return this.prisma.partner.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  @Roles(Role.OWNER, Role.DIRECTOR)
  create(@Body() dto: CreatePartnerDto) {
    return this.prisma.partner.create({
      data: { name: dto.name.trim() },
    });
  }
}
