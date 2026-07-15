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
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
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

class BotConfigDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // ---- Telegram-бот (только владелец) ----
  @Get('bot')
  @Roles(Role.OWNER)
  getBot() {
    return this.settings.getBotConfig();
  }

  @Put('bot')
  @Roles(Role.OWNER)
  setBot(@Body() dto: BotConfigDto) {
    return this.settings.setBotConfig(dto);
  }

  @Post('bot/test')
  @Roles(Role.OWNER)
  testBot() {
    return this.settings.testBot();
  }

  @Post('bot/set-webhook')
  @Roles(Role.OWNER)
  setWebhook() {
    return this.settings.setWebhook();
  }

  // ---- ЗП диспетчеров ----
  @Get('dispatcher-pay/summary')
  @Roles(Role.OWNER, Role.DIRECTOR)
  summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.settings.summaryDispatcherPay(from, to);
  }

  @Get('dispatcher-pay/:userId/calc')
  @Roles(Role.OWNER, Role.DIRECTOR)
  calc(
    @Param('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.settings.calcDispatcherPay(userId, from, to);
  }

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
