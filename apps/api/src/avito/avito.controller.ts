import {Body,Controller,Get,Param,Post,Query,UseGuards} from '@nestjs/common';
import {Transform,Type} from 'class-transformer';
import {IsInt,IsOptional,IsString,Max,MaxLength,Min,MinLength} from 'class-validator';
import {Role} from '@prisma/client';
import {Roles} from '../common/decorators/roles.decorator';
import {JwtAuthGuard} from '../common/guards/jwt-auth.guard';
import {RolesGuard} from '../common/guards/roles.guard';
import {AvitoService} from './avito.service';
class PageQuery {@IsOptional() @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset?:number;}
class SendMessageDto {@Transform(({value})=>typeof value==='string'?value.trim():value) @IsString() @MinLength(1) @MaxLength(1000) text!:string;}
@Controller('avito') @UseGuards(JwtAuthGuard,RolesGuard) @Roles(Role.OWNER)
export class AvitoController {
 constructor(private readonly avito:AvitoService){}
 @Get('profile') profile(){return this.avito.profile();}
 @Get('chats') chats(@Query() q:PageQuery){return this.avito.chats(q.offset||0);}
 @Get('chats/:id/messages') messages(@Param('id') id:string,@Query() q:PageQuery){return this.avito.messages(id,q.offset||0);}
 @Get('draft/:id') draft(@Param('id') id:string){return this.avito.draft(id);}
 @Post('chats/:id/messages') send(@Param('id') id:string,@Body() dto:SendMessageDto){return this.avito.send(id,dto.text);}
}
