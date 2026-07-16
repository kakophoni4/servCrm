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
import {
  CashExpenseBasis,
  CashIncomeBasis,
  Role,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type { Response } from 'express';
import { extname } from 'path';
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
import { CashService } from './cash.service';

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

class IncomeDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(CashIncomeBasis)
  incomeBasis!: CashIncomeBasis;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  /** Опционально: только для основания «Штраф». */
  @IsOptional()
  @IsString()
  masterId?: string;

  @IsOptional()
  @IsString()
  documentPath?: string;
}

class ExpenseDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(CashExpenseBasis)
  expenseBasis!: CashExpenseBasis;

  @IsOptional()
  @IsString()
  expenseSubtype?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  documentPath?: string;
}

class CollectionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  cityId!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@Controller('cash')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CashController {
  constructor(
    private readonly cash: CashService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('cash.read')
  list(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cityId') cityId?: string,
  ) {
    return this.cash.list(user.userId, user.role, cityId, from, to);
  }

  @Post('income')
  @Roles(Role.ADMIN, Role.OWNER)
  @RequirePermissions('cash.income')
  @UseInterceptors(FileInterceptor('file'))
  income(
    @Body() dto: IncomeDto,
    @UploadedFile() file: UploadedMemoryFile | undefined,
    @CurrentUser() user: { userId: string; role: Role },
    @Query('cityId') cityId?: string,
  ) {
    return this.cash.income(
      {
        ...dto,
        cityId: cityId ?? dto.cityId,
        documentPath: this.resolveDocumentPath(dto.documentPath, file),
      },
      user.userId,
      user.role,
    );
  }

  @Post('expense')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('cash.expense')
  @UseInterceptors(FileInterceptor('file'))
  expense(
    @Body() dto: ExpenseDto,
    @UploadedFile() file: UploadedMemoryFile | undefined,
    @CurrentUser() user: { userId: string; role: Role },
    @Query('cityId') cityId?: string,
  ) {
    return this.cash.expense(
      {
        ...dto,
        cityId: cityId ?? dto.cityId,
        documentPath: this.resolveDocumentPath(dto.documentPath, file),
      },
      user.userId,
      user.role,
    );
  }

  @Post('collection')
  @Roles(Role.OWNER)
  @RequirePermissions('cash.collection')
  collection(
    @Body() dto: CollectionDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.cash.collection(dto, user.userId, user.role);
  }

  @Get(':id/document')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('cash.read')
  async document(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: Role },
    @Res({ passthrough: true }) res: Response,
  ) {
    const doc = await this.cash.getDocument(id, user.userId, user.role);
    res.set({
      'Content-Type': mimeFromName(doc.fileName),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(
        doc.fileName,
      )}`,
    });
    return new StreamableFile(this.storage.stream(doc.relPath));
  }

  private resolveDocumentPath(
    existing: string | undefined,
    file: UploadedMemoryFile | undefined,
  ): string | undefined {
    if (file) {
      return this.storage.save('cash', file).relPath;
    }
    return existing;
  }
}
