import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { extname } from 'path';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

function mimeFromName(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.heic') return 'image/heic';
  return 'application/octet-stream';
}
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
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
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AdsController {
  constructor(
    private readonly ads: AdsService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('ads.read')
  list(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('cityId') cityId?: string,
  ) {
    return this.ads.list(user.userId, user.role, cityId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('ads.write')
  create(
    @Body() dto: CreateAdDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.ads.create(dto, user.userId, user.role);
  }

  @Post(':id/screenshot')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('ads.write')
  @UseInterceptors(FileInterceptor('file'))
  attach(
    @Param('id') id: string,
    @UploadedFile() file: UploadedMemoryFile,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.ads.attachScreenshot(id, file, user.userId, user.role);
  }

  @Get(':id/screenshot')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('ads.read')
  async screenshot(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: Role },
    @Res({ passthrough: true }) res: Response,
  ) {
    const relPath = await this.ads.getScreenshot(id, user.userId, user.role);
    const fileName = relPath.split('/').pop() || `ad-${id}`;
    res.set({
      'Content-Type': mimeFromName(fileName),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(
        fileName,
      )}`,
    });
    return new StreamableFile(this.storage.stream(relPath));
  }
}
