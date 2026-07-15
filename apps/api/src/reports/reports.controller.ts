import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
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
  closed(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cityId') cityId?: string,
  ) {
    return this.reports.closed(user.userId, user.role, cityId, from, to);
  }

  @Get('cancels')
  cancels(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cityId') cityId?: string,
  ) {
    return this.reports.cancels(user.userId, user.role, cityId, from, to);
  }

  @Get('cash')
  cash(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cityId') cityId?: string,
  ) {
    return this.reports.cash(user.userId, user.role, cityId, from, to);
  }

  @Get('masters')
  masters(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cityId') cityId?: string,
  ) {
    return this.reports.masters(user.userId, user.role, cityId, from, to);
  }

  @Get('claims')
  claims(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cityId') cityId?: string,
  ) {
    return this.reports.claims(user.userId, user.role, cityId, from, to);
  }

  @Get('ads')
  ads(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cityId') cityId?: string,
  ) {
    return this.reports.ads(user.userId, user.role, cityId, from, to);
  }
}
