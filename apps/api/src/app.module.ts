import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BranchModule } from './common/branch/branch.module';
import { StorageModule } from './common/storage/storage.module';
import { AdsModule } from './ads/ads.module';
import { AssetsModule } from './assets/assets.module';
import { AuthModule } from './auth/auth.module';
import { BotModule } from './bot/bot.module';
import { CashModule } from './cash/cash.module';
import { ChatModule } from './chat/chat.module';
import { CitiesModule } from './cities/cities.module';
import { ClaimsModule } from './claims/claims.module';
import { ClientsModule } from './clients/clients.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthController } from './health.controller';
import { MastersModule } from './masters/masters.module';
import { OrdersModule } from './orders/orders.module';
import { PartnersModule } from './partners/partners.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { SalaryModule } from './salary/salary.module';
import { SettingsModule } from './settings/settings.module';
import { SettlementsModule } from './settlements/settlements.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    BranchModule,
    StorageModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    OrdersModule,
    MastersModule,
    CitiesModule,
    PartnersModule,
    ClaimsModule,
    DocumentsModule,
    SalaryModule,
    CashModule,
    SettlementsModule,
    ReportsModule,
    AdsModule,
    AssetsModule,
    ChatModule,
    SettingsModule,
    BotModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
