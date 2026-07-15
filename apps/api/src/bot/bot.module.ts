import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { DocumentsModule } from '../documents/documents.module';
import { SettingsModule } from '../settings/settings.module';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  imports: [ChatModule, DocumentsModule, SettingsModule],
  controllers: [BotController],
  providers: [BotService],
  exports: [BotService],
})
export class BotModule {}
