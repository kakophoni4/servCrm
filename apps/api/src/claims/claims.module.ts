import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  imports: [BotModule],
  controllers: [ClaimsController],
  providers: [ClaimsService],
})
export class ClaimsModule {}
