import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UsersService } from './users.service';

class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  login!: string;

  @IsString()
  @MinLength(4)
  password!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  cityId?: string;
}

class FireDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsBoolean()
  recommendedHire!: boolean;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  list(@Query('status') status?: UserStatus) {
    return this.users.list(status);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Post(':id/fire')
  @Roles(Role.OWNER, Role.DIRECTOR)
  fire(@Param('id') id: string, @Body() dto: FireDto) {
    return this.users.fire(id, dto);
  }

  @Post(':id/restore')
  @Roles(Role.OWNER)
  restore(@Param('id') id: string) {
    return this.users.restore(id);
  }
}
