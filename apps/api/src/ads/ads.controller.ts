import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  StorageService,
  UploadedMemoryFile,
} from '../common/storage/storage.service';
import { AdsService } from './ads.service';

class CreateAdDto {
  @IsDateString()
  reportDate!: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  promotersCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  leafletsIssued?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  leafletsSpread?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cardsIssued?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cardsSpread?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stickersIssued?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stickersSpread?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  avitoAdsCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  leafletsStock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cardsStock?: number;

  @IsOptional()
  @IsString()
  documentPath?: string;
}

@Controller('ads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdsController {
  constructor(
    private readonly ads: AdsService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  list() {
    return this.ads.list();
  }

  @Post()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  create(
    @Body() dto: CreateAdDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.ads.create(dto, user.userId);
  }

  @Post(':id/screenshot')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @UseInterceptors(FileInterceptor('file'))
  attach(
    @Param('id') id: string,
    @UploadedFile() file: UploadedMemoryFile,
  ) {
    return this.ads.attachScreenshot(id, file);
  }

  @Get(':id/screenshot')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  async screenshot(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const relPath = await this.ads.getScreenshot(id);
    res.set({ 'Content-Type': 'application/octet-stream' });
    return new StreamableFile(this.storage.stream(relPath));
  }
}
