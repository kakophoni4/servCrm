import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
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

class UpdateClaimDto {
  @IsOptional()
  @IsEnum(ClaimType)
  type?: ClaimType;

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
  cityId?: string | null;
}

@Controller('claims')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Get()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('claims.read')
  list(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('cityId') cityId?: string,
  ) {
    return this.claims.list(user.userId, user.role, cityId);
  }

  @Post()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('claims.write')
  create(
    @Body() dto: CreateClaimDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.claims.create(dto, user.userId, user.role);
  }

  @Patch(':id/close')
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('claims.write')
  close(
    @Param('id') id: string,
    @Body() dto: CloseClaimDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.claims.close(id, dto.closedAt, user.userId, user.role);
  }

  @Patch(':id')
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('claims.write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClaimDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.claims.update(id, dto, user.userId, user.role);
  }
}
