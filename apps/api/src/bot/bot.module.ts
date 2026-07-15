import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { DocumentsModule } from '../documents/documents.module';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  imports: [ChatModule, DocumentsModule],
  controllers: [BotController],
  providers: [BotService],
})
export class BotModule {}
