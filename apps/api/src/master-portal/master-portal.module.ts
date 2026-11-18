import {Module} from '@nestjs/common';
import {MasterPortalController} from './master-portal.controller';
import {MasterPortalService} from './master-portal.service';
import {SalaryModule} from '../salary/salary.module';
import {DocumentsModule} from '../documents/documents.module';
import {SettlementsModule} from '../settlements/settlements.module';
import {BotModule} from '../bot/bot.module';
@Module({imports:[SalaryModule,DocumentsModule,SettlementsModule,BotModule],controllers:[MasterPortalController],providers:[MasterPortalService]}) export class MasterPortalModule {}
