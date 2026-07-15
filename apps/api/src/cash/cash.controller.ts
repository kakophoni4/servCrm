import {
  Body,
  Controller,
  Get,
  Post,
  Query,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  StorageService,
  UploadedMemoryFile,
} from '../common/storage/storage.service';
import { CashService } from './cash.service';

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

@Controller('cash')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashController {
  constructor(
    private readonly cash: CashService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.cash.list(from, to);
  }

  @Post('income')
  @Roles(Role.ADMIN, Role.OWNER)
  @UseInterceptors(FileInterceptor('file'))
  income(
    @Body() dto: IncomeDto,
    @UploadedFile() file: UploadedMemoryFile | undefined,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.cash.income(
      { ...dto, documentPath: this.resolveDocumentPath(dto.documentPath, file) },
      user.userId,
      user.role,
    );
  }

  @Post('expense')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @UseInterceptors(FileInterceptor('file'))
  expense(
    @Body() dto: ExpenseDto,
    @UploadedFile() file: UploadedMemoryFile | undefined,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.cash.expense(
      { ...dto, documentPath: this.resolveDocumentPath(dto.documentPath, file) },
      user.userId,
      user.role,
    );
  }

  @Post('collection')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @UseInterceptors(FileInterceptor('file'))
  collection(
    @Body() dto: CollectionDto,
    @UploadedFile() file: UploadedMemoryFile | undefined,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.cash.collection(
      { ...dto, documentPath: this.resolveDocumentPath(dto.documentPath, file) },
      user.userId,
      user.role,
    );
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
