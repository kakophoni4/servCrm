import { Module } from '@nestjs/common';
import { CitiesController } from './cities.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [CitiesController],
  providers: [PrismaService],
})
export class CitiesModule {}
