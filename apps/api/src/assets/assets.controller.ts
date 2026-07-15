import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AssetStatus, Role } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AssetsService } from './assets.service';

class CreateAssetDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsString()
  cityId?: string;
}

@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @Roles(Role.OWNER, Role.DIRECTOR, Role.ADMIN)
  list(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('status') status?: AssetStatus,
    @Query('cityId') cityId?: string,
  ) {
    return this.assets.list(user.userId, user.role, cityId, status);
  }

  @Post()
  @Roles(Role.OWNER)
  create(
    @CurrentUser() user: { userId: string; role: Role },
    @Body() dto: CreateAssetDto,
  ) {
    return this.assets.create(dto, user.userId, user.role);
  }

  @Post(':id/write-off')
  @Roles(Role.OWNER)
  writeOff(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: Role },
    @Body() body: { note?: string },
  ) {
    return this.assets.writeOff(id, body.note, user.userId, user.role);
  }
}
