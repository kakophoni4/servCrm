import {Body,Controller,Get,Param,Post,Put,UseGuards} from '@nestjs/common';
import {Role} from '@prisma/client';
import {Type} from 'class-transformer';
import {ArrayMaxSize,ArrayUnique,IsArray,IsInt,IsString,Max,MaxLength,Min,MinLength,ValidateNested} from 'class-validator';
import {Roles} from '../common/decorators/roles.decorator';
import {JwtAuthGuard} from '../common/guards/jwt-auth.guard';
import {RolesGuard} from '../common/guards/roles.guard';
import {InventoryService} from './inventory.service';
class PartInfoDto {
 @IsString() @MinLength(1) @MaxLength(120) name!:string;
 @IsString() @MaxLength(80) category!:string;
 @IsInt() @Min(0) @Max(1000000) minimum!:number;
}
class PartDto extends PartInfoDto {
 @IsInt() @Min(0) @Max(1000000) quantity!:number;
}
class ReceiptDto {
 @IsInt() @Min(-1000000) @Max(1000000) delta!:number;
 @IsString() @MinLength(1) @MaxLength(200) reason!:string;
 @IsString() @MinLength(10) @MaxLength(80) requestId!:string;
}
class UsageLine {
 @IsString() @MinLength(1) partId!:string;
 @IsInt() @Min(1) @Max(1000000) quantity!:number;
}
class UsageDto {
 @IsArray() @ArrayMaxSize(100) @ArrayUnique((x:UsageLine)=>x.partId) @ValidateNested({each:true}) @Type(()=>UsageLine) items!:UsageLine[];
}
@Controller('inventory') @UseGuards(JwtAuthGuard,RolesGuard) @Roles(Role.OWNER)
export class InventoryController {
 constructor(private readonly stock:InventoryService){}
 @Get() list(){return this.stock.list();}
 @Post() create(@Body() dto:PartDto){return this.stock.create(dto);}
 @Put(':id') edit(@Param('id') id:string,@Body() dto:PartInfoDto){return this.stock.edit(id,dto);}
 @Post(':id/receipt') receipt(@Param('id') id:string,@Body() dto:ReceiptDto){return this.stock.receive(id,dto);}
 @Get('history') history(){return this.stock.history();}
 @Get('orders/:id') order(@Param('id') id:string){return this.stock.order(id);}
 @Put('orders/:id') save(@Param('id') id:string,@Body() dto:UsageDto){return this.stock.save(id,dto.items);}
}
