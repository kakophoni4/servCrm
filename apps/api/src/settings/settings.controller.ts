import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SettingsService } from './settings.service';

class DispatcherPayDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryBase?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyTurnoverPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leafletBonus?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  closedOrdersBonusPct?: number;
}

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('dispatcher-pay/:userId')
  @Roles(Role.OWNER, Role.DIRECTOR)
  get(@Param('userId') userId: string) {
    return this.settings.getDispatcherPay(userId);
  }

  @Put('dispatcher-pay/:userId')
  @Roles(Role.OWNER)
  put(@Param('userId') userId: string, @Body() dto: DispatcherPayDto) {
    return this.settings.upsertDispatcherPay(userId, dto);
  }
}
