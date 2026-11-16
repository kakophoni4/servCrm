import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { OrderType, SourceKind, SourceOur } from '@prisma/client';

export class CreateOrderDto {
 @IsOptional() @IsBoolean() isPersonal?: boolean;
 @IsOptional() @IsBoolean() isServiceCenter?: boolean;
  @IsString()
  @IsNotEmpty()
  clientName!: string;

  @IsString()
  @IsNotEmpty()
  clientPhone!: string;

  @IsEnum(OrderType)
  type!: OrderType;

  @IsEnum(SourceKind)
  sourceKind!: SourceKind;

  @ValidateIf((o: CreateOrderDto) => o.sourceKind === SourceKind.OUR)
  @IsEnum(SourceOur)
  sourceOur?: SourceOur;

  @ValidateIf((o: CreateOrderDto) => o.sourceKind === SourceKind.PARTNER)
  @IsString()
  @IsNotEmpty()
  partnerId?: string;

  /** Плановое время визита — обязательно при создании. */
  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  ageCategoryId?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsBoolean()
  isClaim?: boolean;

  @IsOptional()
  @IsBoolean()
  isProfile?: boolean;

  @IsOptional()
  @IsString()
  typeTech?: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  branchComment?: string;
}
