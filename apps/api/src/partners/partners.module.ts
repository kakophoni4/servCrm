import { Module } from '@nestjs/common';
import { PartnersController } from './partners.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [PartnersController],
  providers: [PrismaService],
})
export class PartnersModule {}
