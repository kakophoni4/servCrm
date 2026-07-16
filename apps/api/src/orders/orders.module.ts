import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { DocumentsModule } from '../documents/documents.module';
import { SalaryModule } from '../salary/salary.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [SalaryModule, DocumentsModule, BotModule, SettlementsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
