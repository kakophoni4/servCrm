import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClaimType, Role } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ClaimsService } from './claims.service';

class CreateClaimDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsEnum(ClaimType)
  type!: ClaimType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  refundSum?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  orderSum?: number;

  @IsOptional()
  @IsString()
  cityId?: string;
}

class CloseClaimDto {
  @IsOptional()
  @IsDateString()
  closedAt?: string;
}

@Controller('claims')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Get()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  list() {
    return this.claims.list();
  }

  @Post()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  create(@Body() dto: CreateClaimDto) {
    return this.claims.create(dto);
  }

  @Patch(':id/close')
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  close(@Param('id') id: string, @Body() dto: CloseClaimDto) {
    return this.claims.close(id, dto.closedAt);
  }
}
