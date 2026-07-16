import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
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
import { SettlementsService } from './settlements.service';

class CreateSettlementDto {
  @IsString()
  masterId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsDateString()
  periodFrom!: string;

  @IsDateString()
  periodTo!: string;
}

class PaySettlementDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

class AcceptPaymentDto {
  @IsString()
  masterId!: string;

  @IsDateString()
  periodFrom!: string;

  @IsDateString()
  periodTo!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

@Controller('settlements')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('settlements.read')
  list(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('cityId') cityId?: string,
  ) {
    return this.settlements.list(user.userId, user.role, cityId);
  }

  @Get('preview')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('settlements.read')
  preview(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: { userId: string; role: Role },
    @Query('cityId') cityId?: string,
  ) {
    return this.settlements.preview(from, to, user.userId, user.role, cityId);
  }

  @Get('board')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('settlements.read')
  board(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: { userId: string; role: Role },
    @Query('cityId') cityId?: string,
  ) {
    return this.settlements.board(from, to, user.userId, user.role, cityId);
  }

  @Get('amount')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('settlements.read')
  amount(
    @Query('masterId') masterId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.settlements.amountForMaster(
      masterId,
      from,
      to,
      user.userId,
      user.role,
    );
  }

  @Post()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('settlements.write')
  create(
    @Body() dto: CreateSettlementDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.settlements.create(dto, user.userId, user.role);
  }

  @Post('accept-payment')
  @Roles(Role.OWNER)
  @RequirePermissions('settlements.pay')
  acceptPayment(
    @Body() dto: AcceptPaymentDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.settlements.acceptPayment(dto, user.userId, user.role);
  }

  @Post(':id/confirm')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('settlements.write')
  confirm(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.settlements.confirm(id, user.userId, user.role);
  }

  @Post(':id/pay')
  @Roles(Role.OWNER)
  @RequirePermissions('settlements.pay')
  pay(
    @Param('id') id: string,
    @Body() dto: PaySettlementDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.settlements.pay(id, dto.amount, user.userId, user.role);
  }
}
