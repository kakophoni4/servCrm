import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { OrderStatus, OrderType, SourceKind, SourceOur } from '@prisma/client';

export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(OrderType)
  type?: OrderType;

  @IsOptional()
  @IsEnum(SourceKind)
  sourceKind?: SourceKind;

  @IsOptional()
  @IsEnum(SourceOur)
  sourceOur?: SourceOur | null;

  @IsOptional()
  @IsString()
  partnerId?: string | null;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  ageCategoryId?: string | null;

  @IsOptional()
  @IsString()
  comment?: string | null;

  @IsOptional()
  @IsString()
  masterId?: string | null;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsBoolean()
  isClaim?: boolean;

  @IsOptional()
  @IsBoolean()
  isWarranty?: boolean;

  @IsOptional()
  @IsBoolean()
  isRepeat?: boolean;

  @IsOptional()
  @IsBoolean()
  isProfile?: boolean;

  @IsOptional()
  @IsString()
  typeTech?: string | null;

  @IsOptional()
  @IsString()
  branchComment?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  paid?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  prepay?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  partsCost?: number;

  @IsOptional()
  @IsBoolean()
  partsYesNo?: boolean;
}
