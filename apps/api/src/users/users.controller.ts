import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
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

  /** CSV id городов, которыми управляет директор. */
  @IsOptional()
  @IsString()
  managedCityIds?: string;

  /** JSON-массив или CSV ключей разрешений (для ADMIN/DIRECTOR/OWNER). */
  @IsOptional()
  @IsString()
  permissions?: string;
}

class SetBranchesDto {
  @IsArray()
  @IsString({ each: true })
  cityIds!: string[];
}

class FireDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsBoolean()
  recommendedHire!: boolean;
}

class UpdatePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

class UpdateTelegramDto {
  @IsOptional()
  @IsString()
  telegramId?: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('permission-catalog')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('users.read')
  permissionCatalog() {
    return this.users.permissionCatalog();
  }

  @Get()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('users.read')
  list(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('status') status?: UserStatus,
    @Query('cityId') cityId?: string,
  ) {
    return this.users.list(user.userId, user.role, cityId, status);
  }

  @Get(':id/passport')
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('users.passport')
  async downloadPassport(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: Role },
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.users.getPassportPhoto(id, user.userId, user.role);
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
  @RequirePermissions('users.passport')
  async downloadEmployeePhoto(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: Role },
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.users.getEmployeePhoto(id, user.userId, user.role);
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
  @RequirePermissions('users.read')
  get(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.users.get(id, user.userId, user.role);
  }

  @Post()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('users.create')
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

  @Post(':id/branches')
  @Roles(Role.OWNER)
  @RequirePermissions('users.branches')
  setBranches(@Param('id') id: string, @Body() dto: SetBranchesDto) {
    return this.users.setBranches(id, dto.cityIds);
  }

  @Patch(':id/permissions')
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('users.create')
  updatePermissions(
    @Param('id') id: string,
    @Body() dto: UpdatePermissionsDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.users.updatePermissions(
      id,
      dto.permissions,
      user.userId,
      user.role,
    );
  }

  @Patch(':id/telegram')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('users.create')
  updateTelegram(
    @Param('id') id: string,
    @Body() dto: UpdateTelegramDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.users.updateTelegramId(
      id,
      dto.telegramId,
      user.userId,
      user.role,
    );
  }

  @Post(':id/fire')
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('users.fire')
  fire(
    @Param('id') id: string,
    @Body() dto: FireDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.users.fire(id, dto, user.userId, user.role);
  }

  @Post(':id/restore')
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('users.restore')
  restore(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.users.restore(id, user.userId, user.role);
  }
}
