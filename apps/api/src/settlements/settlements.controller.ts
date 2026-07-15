import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsDateString, IsNumber, IsString, Min } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SettlementsService } from './settlements.service';

class CreateSettlementDto {
  @IsString()
  masterId!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsDateString()
  periodFrom!: string;

  @IsDateString()
  periodTo!: string;
}

@Controller('settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  list() {
    return this.settlements.list();
  }

  @Get('preview')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  preview(@Query('from') from: string, @Query('to') to: string) {
    return this.settlements.preview(from, to);
  }

  @Post()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  create(@Body() dto: CreateSettlementDto) {
    return this.settlements.create(dto);
  }

  @Post(':id/confirm')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  confirm(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.settlements.confirm(id, user.userId);
  }
}
