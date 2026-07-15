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
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
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
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('threads')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  threads() {
    return this.chat.threads();
  }

  @Get('threads/:id')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  get(@Param('id') id: string) {
    return this.chat.get(id);
  }

  @Post('threads/:id/messages')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.chat.reply(id, dto.body, user.userId);
  }

  @Post('threads/:id/link-order')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  link(@Param('id') id: string, @Body() dto: LinkOrderDto) {
    return this.chat.linkOrder(id, dto.orderId);
  }

  @Post('threads/:id/send-to-master')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  sendToMaster(@Param('id') id: string, @Body() dto: SendToMasterDto) {
    return this.chat.sendToMaster(id, dto.masterId);
  }

  /** Для бота / интеграций (MVP: тот же JWT админа). */
  @Post('ingest')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  ingest(@Body() dto: IngestDto) {
    return this.chat.ingest(dto);
  }
}
