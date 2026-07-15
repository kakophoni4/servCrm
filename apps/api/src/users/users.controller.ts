import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Role, UserStatus } from '@prisma/client';
import type { Response } from 'express';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UploadedMemoryFile } from '../common/storage/storage.service';
import { CreateUserFiles, UsersService } from './users.service';

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

  @IsOptional()
  @IsString()
  telegramId?: string;

  @IsOptional()
  @IsDateString()
  hiredAt?: string;

  @IsOptional()
  @IsString()
  passportNumber?: string;
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

  @Get(':id/passport')
  @Roles(Role.OWNER, Role.DIRECTOR)
  async downloadPassport(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.users.getPassportPhoto(id);
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
        file.fileName,
      )}`,
    });
    return new StreamableFile(file.buffer);
  }

  @Get(':id/employee-photo')
  @Roles(Role.OWNER, Role.DIRECTOR)
  async downloadEmployeePhoto(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.users.getEmployeePhoto(id);
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
        file.fileName,
      )}`,
    });
    return new StreamableFile(file.buffer);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'passportPhoto', maxCount: 1 },
      { name: 'contractPhoto', maxCount: 1 },
      { name: 'employeePhoto', maxCount: 1 },
    ]),
  )
  create(
    @Body() dto: CreateUserDto,
    @UploadedFiles()
    files: {
      passportPhoto?: UploadedMemoryFile[];
      contractPhoto?: UploadedMemoryFile[];
      employeePhoto?: UploadedMemoryFile[];
    },
  ) {
    return this.users.create(dto, files as CreateUserFiles);
  }

  @Post(':id/fire')
  @Roles(Role.OWNER, Role.DIRECTOR)
  fire(@Param('id') id: string, @Body() dto: FireDto) {
    return this.users.fire(id, dto);
  }

  @Post(':id/restore')
  @Roles(Role.OWNER, Role.DIRECTOR)
  restore(@Param('id') id: string) {
    return this.users.restore(id);
  }
}
