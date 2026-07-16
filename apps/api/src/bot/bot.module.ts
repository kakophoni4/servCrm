import { Module, forwardRef } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { DocumentsModule } from '../documents/documents.module';
import { SalaryModule } from '../salary/salary.module';
import { SettingsModule } from '../settings/settings.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  imports: [
    forwardRef(() => ChatModule),
    SettingsModule,
    DocumentsModule,
    SettlementsModule,
    SalaryModule,
  ],
  controllers: [BotController],
  providers: [BotService],
  exports: [BotService],
})
export class BotModule {}
