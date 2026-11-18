import {AvitoStatsController} from './avito-stats.controller';
import {AvitoStatsService} from './avito-stats.service';
import {Module} from '@nestjs/common';
import {AvitoController} from './avito.controller';
import {AvitoService} from './avito.service';
@Module({controllers:[AvitoController,AvitoStatsController],providers:[AvitoService,AvitoStatsService],exports:[AvitoService]})
export class AvitoModule {}
