import { Module, forwardRef } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { SettingsModule } from '../settings/settings.module';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  imports: [forwardRef(() => ChatModule), SettingsModule],
  controllers: [BotController],
  providers: [BotService],
  exports: [BotService],
})
export class BotModule {}
