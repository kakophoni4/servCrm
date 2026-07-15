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
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { MastersService } from './masters.service';

class CreateMasterDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsOptional()
  @IsString()
  login?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  telegramId?: string;
}

@Controller('masters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MastersController {
  constructor(private readonly masters: MastersService) {}

  @Get()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  list(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('all') all?: string,
    @Query('cityId') cityId?: string,
  ) {
    return this.masters.list(user.userId, user.role, all !== '1', cityId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  create(@Body() dto: CreateMasterDto) {
    return this.masters.create(dto);
  }

  @Post(':id/deactivate')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  deactivate(@Param('id') id: string) {
    return this.masters.deactivate(id);
  }

  @Post(':id/restore')
  @Roles(Role.OWNER, Role.DIRECTOR)
  restore(@Param('id') id: string) {
    return this.masters.restore(id);
  }
}
