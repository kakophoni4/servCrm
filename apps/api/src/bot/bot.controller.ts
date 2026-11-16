import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BotService } from './bot.service';

class StatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsBoolean()
  confirm!: boolean;
}

class IncomingDto {
  @IsString()
  @IsNotEmpty()
  externalId!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsOptional()
  @IsString()
  title?: string;
}

@Controller('bot')
export class BotController {
  constructor(private readonly bot: BotService) {}

  /** Публичный webhook Telegram (без JWT). Secret = bot.telegram.webhookSecret. */
  @Post('webhook/:secret')
  webhook(
    @Param('secret') secret: string,
    @Body() update: Record<string, unknown>,
  ) {
    return this.bot.handleWebhook(secret, update);
  }

  @Get('group')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  group() { return this.bot.getOrderGroup(); }

  @Post('group/link')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  groupLink() { return this.bot.createGroupLink(); }

  @Post('group/disconnect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  disconnectGroup() { return this.bot.disconnectGroup(); }

  @Post('masters/:id/link')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  masterLink(@Param('id') id: string) { return this.bot.createMasterLink(id); }

  @Post('orders/:id/send-group')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  sendGroup(@Param('id') id: string) { return this.bot.sendOrderToGroup(id); }

  @Post('orders/:id/send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  resend(@Param('id') id: string) { return this.bot.sendAssignedOrder(id); }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER, Role.MASTER)
  about(@Query('telegramId') telegramId: string) {
    return this.bot.aboutMe(telegramId);
  }

  @Get('orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER, Role.MASTER)
  orders(@Query('telegramId') telegramId: string) {
    return this.bot.myOrders(telegramId);
  }

  @Post('orders/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER, Role.MASTER)
  status(
    @Param('id') id: string,
    @Query('telegramId') telegramId: string,
    @Body() dto: StatusDto,
  ) {
    return this.bot.setStatus(telegramId, id, dto.status, dto.confirm);
  }

  @Post('incoming')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  incoming(@Body() dto: IncomingDto) {
    return this.bot.incomingMessage(dto.externalId, dto.text, dto.title);
  }
}
