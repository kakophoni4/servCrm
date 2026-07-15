import { Module, forwardRef } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [forwardRef(() => BotModule)],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
