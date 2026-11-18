import {Controller,Get,Query,UseGuards} from '@nestjs/common';
import {IsString,Matches} from 'class-validator';
import {Role} from '@prisma/client';
import {Roles} from '../common/decorators/roles.decorator';
import {JwtAuthGuard} from '../common/guards/jwt-auth.guard';
import {RolesGuard} from '../common/guards/roles.guard';
import {AvitoStatsService} from './avito-stats.service';
class StatsQuery {
 @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) from!:string;
 @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) to!:string;
}
@Controller('avito') @UseGuards(JwtAuthGuard,RolesGuard) @Roles(Role.OWNER)
export class AvitoStatsController {
 constructor(private readonly statsService:AvitoStatsService){}
 @Get('stats') stats(@Query() q:StatsQuery){return this.statsService.stats(q.from,q.to);}
}
