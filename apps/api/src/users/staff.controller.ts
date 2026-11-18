import {Body,Controller,Get,Post,Param,UseGuards,BadRequestException,NotFoundException} from '@nestjs/common';
import {IsString,MinLength,IsIn,IsBoolean} from 'class-validator';
import {Role} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {PrismaService} from '../prisma/prisma.service';
import {Roles} from '../common/decorators/roles.decorator';
import {JwtAuthGuard} from '../common/guards/jwt-auth.guard';
import {RolesGuard} from '../common/guards/roles.guard';
export const STAFF_BASE=['orders.read','orders.write','orders.assign_master','orders.edit_schedule','orders.edit_admin_fields','clients.read','clients.comment','masters.read','claims.read','claims.write','cities.read','partners.read'];
class CreateStaff { @IsString() @MinLength(1) fullName!:string; @IsString() @MinLength(3) login!:string; @IsString() @MinLength(8) password!:string; @IsIn(['logistic','assistant']) profile!:'logistic'|'assistant'; }
class StaffPassword { @IsString() @MinLength(8) password!:string; }
class StaffActive { @IsBoolean() active!:boolean; }
@Controller('staff') @UseGuards(JwtAuthGuard,RolesGuard) @Roles(Role.OWNER)
export class StaffController {
 constructor(private readonly prisma:PrismaService){}
 private select={id:true,fullName:true,login:true,status:true,permissions:true} as const;
 @Get() list(){return this.prisma.user.findMany({where:{role:Role.ADMIN,permissions:{hasSome:['staff.logistic','staff.assistant']}},select:this.select,orderBy:{createdAt:'desc'}})}
 @Post() async create(@Body() dto:CreateStaff){const login=dto.login.trim().toLowerCase();if(!login||!dto.fullName.trim())throw new BadRequestException('Укажите имя и логин');if(await this.prisma.user.findUnique({where:{login}}))throw new BadRequestException('Логин занят');return this.prisma.user.create({data:{login,fullName:dto.fullName.trim(),passwordHash:await bcrypt.hash(dto.password,10),role:Role.ADMIN,permissions:[...STAFF_BASE,'staff.'+dto.profile,...(dto.profile==='assistant'?['orders.edit_payments','documents.read','documents.write']:[])],status:'ACTIVE'},select:this.select})}
 private async target(id:string){const u=await this.prisma.user.findUnique({where:{id}});if(!u||u.role!==Role.ADMIN||!u.permissions.some(p=>p==='staff.logistic'||p==='staff.assistant'))throw new NotFoundException('Сотрудник не найден');return u}
 @Post(':id/active') async active(@Param('id') id:string,@Body() dto:StaffActive){await this.target(id);return this.prisma.user.update({where:{id},data:{status:dto.active?'ACTIVE':'FIRED'},select:this.select})}
 @Post(':id/password') async password(@Param('id') id:string,@Body() dto:StaffPassword){await this.target(id);await this.prisma.user.update({where:{id},data:{passwordHash:await bcrypt.hash(dto.password,10)}});return {ok:true}}
}
