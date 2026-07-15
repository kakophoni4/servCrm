import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { SalaryModule } from '../salary/salary.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [SalaryModule, DocumentsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
