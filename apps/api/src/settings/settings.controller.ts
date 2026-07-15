import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SettingsService } from './settings.service';

class DispatcherPayDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaryBase?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dailyTurnoverPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  leafletBonus?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  closedOrdersBonusPct?: number;
}

class DispatcherShiftDto {
  @IsDateString()
  date!: string;

  @ValidateIf((_, v) => v !== null)
  @IsString()
  userId!: string | null;

  @IsOptional()
  @IsString()
  cityId?: string;
}

class BotConfigDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // ---- Telegram-бот (только владелец) ----
  @Get('bot')
  @Roles(Role.OWNER)
  @RequirePermissions('settings.bot')
  getBot() {
    return this.settings.getBotConfig();
  }

  @Put('bot')
  @Roles(Role.OWNER)
  @RequirePermissions('settings.bot')
  setBot(@Body() dto: BotConfigDto) {
    return this.settings.setBotConfig(dto);
  }

  @Post('bot/test')
  @Roles(Role.OWNER)
  @RequirePermissions('settings.bot')
  testBot() {
    return this.settings.testBot();
  }

  @Post('bot/set-webhook')
  @Roles(Role.OWNER)
  @RequirePermissions('settings.bot')
  setWebhook() {
    return this.settings.setWebhook();
  }

  // ---- ЗП диспетчеров ----
  @Get('dispatcher-pay/summary')
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('settings.dispatcher_pay')
  summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.settings.summaryDispatcherPay(from, to);
  }

  @Get('dispatcher-schedule')
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('settings.dispatcher_pay')
  schedule(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('cityId') cityId?: string,
  ) {
    const now = new Date();
    return this.settings.getDispatcherSchedule(
      year ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
      user.userId,
      user.role,
      cityId,
    );
  }

  @Put('dispatcher-schedule')
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('settings.dispatcher_pay')
  setShift(
    @Body() dto: DispatcherShiftDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.settings.setDispatcherShift(
      dto.date,
      dto.userId,
      user.userId,
      user.role,
      dto.cityId,
    );
  }

  @Get('dispatcher-pay/:userId/calc')
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('settings.dispatcher_pay')
  calc(
    @Param('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.settings.calcDispatcherPay(userId, from, to);
  }

  @Get('dispatcher-pay/:userId')
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('settings.dispatcher_pay')
  get(@Param('userId') userId: string) {
    return this.settings.getDispatcherPay(userId);
  }

  @Put('dispatcher-pay/:userId')
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('settings.dispatcher_pay')
  put(@Param('userId') userId: string, @Body() dto: DispatcherPayDto) {
    return this.settings.upsertDispatcherPay(userId, dto);
  }
}
