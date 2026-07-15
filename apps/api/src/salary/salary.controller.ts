import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SalaryService } from './salary.service';

class SalaryDto {
  @IsNumber()
  @Min(0)
  minSum!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxSum?: number | null;

  @IsNumber()
  @Min(0)
  @Max(1)
  percent!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

@Controller('salary-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalaryController {
  constructor(private readonly salary: SalaryService) {}

  @Get()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  list() {
    return this.salary.list();
  }

  @Post()
  @Roles(Role.DIRECTOR, Role.OWNER)
  create(@Body() dto: SalaryDto) {
    return this.salary.create(dto);
  }

  @Patch(':id')
  @Roles(Role.DIRECTOR, Role.OWNER)
  update(@Param('id') id: string, @Body() dto: Partial<SalaryDto>) {
    return this.salary.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  remove(@Param('id') id: string) {
    return this.salary.remove(id);
  }
}
