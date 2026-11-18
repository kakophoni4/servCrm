import {Body,Controller,Get,Post,Param,Query,Res,StreamableFile,UploadedFiles,UseGuards,UseInterceptors} from '@nestjs/common';
import {FilesInterceptor} from '@nestjs/platform-express';
import {IsString,IsIn,IsOptional,IsNumber,MaxLength,MinLength} from 'class-validator';
import {DocKind,Role} from '@prisma/client';
import {CurrentUser} from '../common/decorators/current-user.decorator';
import {Roles} from '../common/decorators/roles.decorator';
import {JwtAuthGuard} from '../common/guards/jwt-auth.guard';
import {RolesGuard} from '../common/guards/roles.guard';
import {StorageService} from '../common/storage/storage.service';
import {MasterPortalService,Actor} from './master-portal.service';
class AccessDto {@IsString() @MaxLength(60) login!:string;@IsString() @MinLength(8) @MaxLength(100) password!:string;}
class MessageDto {@IsString() @MinLength(1) @MaxLength(4000) body!:string;}
class ActionDto {@IsIn(['accept','arrive','leave','sd','close']) action!:string;@IsString() version!:string;@IsOptional() @IsNumber() paid?:number;@IsOptional() @IsNumber() partsCost?:number;@IsOptional() @IsNumber() prepay?:number;@IsOptional() @IsNumber() sdDaysFrom?:number;@IsOptional() @IsNumber() sdDaysTo?:number;}
@Controller('master-portal') @UseGuards(JwtAuthGuard,RolesGuard)
export class MasterPortalController {
 constructor(private service:MasterPortalService,private storage:StorageService){}
 @Get('orders') @Roles(Role.MASTER) list(@CurrentUser() u:Actor){return this.service.list(u)}
 @Get('inbox') @Roles(Role.MASTER,Role.OWNER,Role.ADMIN,Role.DIRECTOR,Role.DISPATCHER) inbox(@CurrentUser() u:Actor){return this.service.inbox(u)}
 @Get('orders/paged') @Roles(Role.MASTER) listPage(@CurrentUser() u:Actor,@Query('closed') closed?:string,@Query('page') page?:string){return this.service.listPage(u,closed==='1',Number(page||1))}
 @Get('inbox/paged') @Roles(Role.MASTER,Role.OWNER,Role.ADMIN,Role.DIRECTOR,Role.DISPATCHER) inboxPage(@CurrentUser() u:Actor,@Query('q') q?:string,@Query('page') page?:string){return this.service.inboxPage(u,q||'',Number(page||1))}
 @Get('orders/:id/messages/paged') @Roles(Role.MASTER,Role.OWNER,Role.ADMIN,Role.DIRECTOR,Role.DISPATCHER) messagePage(@CurrentUser() u:Actor,@Param('id') id:string,@Query('before') before?:string){return this.service.messagePage(u,id,before)}
 @Post('masters/:id/access') @Roles(Role.OWNER) access(@Param('id') id:string,@Body() d:AccessDto){return this.service.access(id,d.login,d.password)}
 @Get('orders/:id') @Roles(Role.MASTER) detail(@CurrentUser() u:Actor,@Param('id') id:string){return this.service.detail(u,id)}
 @Post('orders/:id/action') @Roles(Role.MASTER) action(@CurrentUser() u:Actor,@Param('id') id:string,@Body() d:ActionDto){return this.service.action(u,id,d)}
 @Get('orders/:id/messages') @Roles(Role.MASTER,Role.OWNER,Role.ADMIN,Role.DIRECTOR,Role.DISPATCHER) messages(@CurrentUser() u:Actor,@Param('id') id:string){return this.service.messages(u,id)}
 @Post('orders/:id/messages') @Roles(Role.MASTER,Role.OWNER,Role.ADMIN,Role.DIRECTOR,Role.DISPATCHER) message(@CurrentUser() u:Actor,@Param('id') id:string,@Body() d:MessageDto){return this.service.message(u,id,d.body)}
 @Post('orders/:id/documents') @Roles(Role.MASTER) @UseInterceptors(FilesInterceptor('files',30,{limits:{fileSize:10*1024*1024}})) upload(@CurrentUser() u:Actor,@Param('id') id:string,@Query('kind') kind:DocKind,@UploadedFiles() files:any[]){return this.service.upload(u,id,kind||DocKind.CONTRACT,files||[])}
 @Get('orders/:id/documents/:docId/download') @Roles(Role.MASTER) async download(@CurrentUser() u:Actor,@Param('id') id:string,@Param('docId') docId:string,@Res({passthrough:true}) res:any){const d=await this.service.document(u,id,docId);res.set({'Content-Type':d.mimeType||'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(d.fileName)});return new StreamableFile(this.storage.stream(d.filePath))}
}
