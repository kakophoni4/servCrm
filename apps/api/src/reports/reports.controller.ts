import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DIRECTOR, Role.OWNER)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('closed')
  closed(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.closed(from, to);
  }

  @Get('cancels')
  cancels(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.cancels(from, to);
  }

  @Get('cash')
  cash(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.cash(from, to);
  }

  @Get('masters')
  masters(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.masters(from, to);
  }

  @Get('claims')
  claims(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.claims(from, to);
  }

  @Get('ads')
  ads(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.ads(from, to);
  }
}
