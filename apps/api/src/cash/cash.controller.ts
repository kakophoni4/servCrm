import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  CashExpenseBasis,
  CashIncomeBasis,
  Role,
} from '@prisma/client';
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
import { CashService } from './cash.service';

class IncomeDto {
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

  @IsString()
  documentPath!: string;
}

class CollectionDto {
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
  constructor(private readonly cash: CashService) {}

  @Get()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.cash.list(from, to);
  }

  @Post('income')
  @Roles(Role.ADMIN, Role.OWNER)
  income(
    @Body() dto: IncomeDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.cash.income(dto, user.userId, user.role);
  }

  @Post('expense')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  expense(
    @Body() dto: ExpenseDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.cash.expense(dto, user.userId, user.role);
  }

  @Post('collection')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  collection(
    @Body() dto: CollectionDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.cash.collection(dto, user.userId, user.role);
  }
}
