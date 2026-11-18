import {PageQuery} from '../orders/paging';
import {
  Body,
  Patch,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsNotEmpty, IsOptional, IsString, MinLength, IsArray, ArrayUnique, IsIn } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { MastersService } from './masters.service';

class CreateMasterDto {
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(['ХД','СМ','ПММ','ТВ','ПК','Другое'],{each:true})
  repairTech?: string[];
  @IsOptional() @IsString() address?: string;
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsOptional()
  @IsString()
  login?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  telegramId?: string;
}

@Controller('masters')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class MastersController {
  constructor(private readonly masters: MastersService) {}

  @Get('paged') @Roles(Role.DISPATCHER,Role.ADMIN,Role.DIRECTOR,Role.OWNER) @RequirePermissions('masters.read')
  paged(@CurrentUser() u:{userId:string;role:Role},@Query() q:PageQuery){return this.masters.paged(u.userId,u.role,q);}
  @Get(':id/jobs') @Roles(Role.DISPATCHER,Role.ADMIN,Role.DIRECTOR,Role.OWNER) @RequirePermissions('masters.read')
  jobs(@Param('id') id:string,@CurrentUser() u:{userId:string;role:Role},@Query() q:PageQuery){return this.masters.jobs(id,u.userId,u.role,q);}

  @Get('schedule')
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('masters.read')
  schedule(@CurrentUser() user:{userId:string;role:Role},@Query('from') from:string,@Query('to') to:string) { return this.masters.schedule(user.userId,user.role,from,to); }

  @Get()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('masters.read')
  list(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('all') all?: string,
    @Query('cityId') cityId?: string,
  ) {
    return this.masters.list(user.userId, user.role, all !== '1', cityId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('masters.write')
  create(@Body() dto: CreateMasterDto) {
    return this.masters.create(dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @RequirePermissions('masters.write')
  update(@Param('id') id: string, @Body() dto: CreateMasterDto) { return this.masters.update(id, dto); }

  @Post(':id/deactivate')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('masters.write')
  deactivate(@Param('id') id: string) {
    return this.masters.deactivate(id);
  }

  @Post(':id/restore')
  @Roles(Role.OWNER, Role.DIRECTOR)
  @RequirePermissions('masters.restore')
  restore(@Param('id') id: string) {
    return this.masters.restore(id);
  }
}
