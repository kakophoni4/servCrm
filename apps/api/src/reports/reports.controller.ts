import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.DIRECTOR, Role.OWNER)
@RequirePermissions('reports.read')
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

  @Get('partners')
  partners(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cityId') cityId?: string,
  ) {
    return this.reports.partners(user.userId, user.role, cityId, from, to);
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
