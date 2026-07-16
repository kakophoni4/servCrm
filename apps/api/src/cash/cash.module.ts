import { Module, forwardRef } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { CashController } from './cash.controller';
import { CashService } from './cash.service';

@Module({
  imports: [forwardRef(() => BotModule), SettlementsModule],
  controllers: [CashController],
  providers: [CashService],
  exports: [CashService],
})
export class CashModule {}
