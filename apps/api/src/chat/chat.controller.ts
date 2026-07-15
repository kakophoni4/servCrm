import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ChatChannel, Role } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ChatService } from './chat.service';

class ReplyDto {
  @IsString()
  @IsNotEmpty()
  body!: string;
}

class LinkOrderDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;
}

class SendToMasterDto {
  @IsString()
  @IsNotEmpty()
  masterId!: string;
}

class IngestDto {
  @IsEnum(ChatChannel)
  channel!: ChatChannel;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @IsNotEmpty()
  body!: string;
}

@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('threads')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('chat.read')
  threads(@CurrentUser() user: { userId: string; role: string }) {
    return this.chat.threads(user.userId, user.role);
  }

  @Get('threads/:id')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('chat.read')
  get(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    return this.chat.get(id, user.userId, user.role);
  }

  @Post('threads/:id/messages')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('chat.write')
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyDto,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    return this.chat.reply(id, dto.body, user.userId, user.userId, user.role);
  }

  @Post('threads/:id/link-order')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('chat.write')
  link(
    @Param('id') id: string,
    @Body() dto: LinkOrderDto,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    return this.chat.linkOrder(id, dto.orderId, user.userId, user.role);
  }

  @Post('threads/:id/send-to-master')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('chat.write')
  sendToMaster(
    @Param('id') id: string,
    @Body() dto: SendToMasterDto,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    return this.chat.sendToMaster(id, dto.masterId, user.userId, user.role);
  }

  /** Для бота / интеграций (MVP: тот же JWT админа). */
  @Post('ingest')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('chat.write')
  ingest(@Body() dto: IngestDto) {
    return this.chat.ingest(dto);
  }
}
