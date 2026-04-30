import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { config } from '@p2p/config';
import { PrismaModule } from './config/prisma.module';
import { SecurityModule } from './common/security.module';
import { ApiLoggingModule } from './common/logging/logging.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { TradersModule } from './modules/traders/traders.module';
import { DirectionsModule } from './modules/directions/directions.module';
import { CurrenciesModule } from './modules/currencies/currencies.module';
import { BanksModule } from './modules/banks/banks.module';
import { RequisitesModule } from './modules/requisites/requisites.module';
import { FilesModule } from './modules/files/files.module';
import { AuditModule } from './modules/audit/audit.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { SettlementsModule } from './modules/settlements/settlements.module';
import { TelegramModule } from './modules/telegram/telegram.module';

import { PayinModule } from './modules/payin/payin.module';
import { PayoutModule } from './modules/payout/payout.module';
import { AppealsModule } from './modules/appeals/appeals.module';
import { AdminModule } from './modules/admin/admin.module';
import { SupportModule } from './modules/support/support.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { HealthModule } from './modules/health/health.module';
import { CascadeModule } from './modules/cascade/cascade.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { ReferralModule } from './modules/referral/referral.module';
import { BalanceTransactionsModule } from './modules/balance-transactions/balance-transactions.module';
import { CountriesModule } from './modules/countries/countries.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { MerchantDirectionsModule } from './modules/merchant-directions/merchant-directions.module';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module';
import { ExchangeRateModule } from './modules/exchange-rate/exchange-rate.module';
import { TraderWalletsModule } from './modules/trader-wallets/trader-wallets.module';

@Module({
  imports: [
    ApiLoggingModule,
    PrismaModule,
    ExchangeRateModule,
    SecurityModule,
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 600,
    }]),
    BullModule.forRoot({
      connection: {
        host: config.redis.host,
        port: config.redis.port,
      },
    }),
    BullModule.registerQueue(
      { name: 'webhook' },
      { name: 'telegram' },
      { name: 'maintenance' },
    ),
    AuthModule,
    UsersModule,
    MerchantsModule,
    TradersModule,
    DirectionsModule,
    CurrenciesModule,
    BanksModule,
    RequisitesModule,
    FilesModule,
    AuditModule,
    WebhooksModule,
    SettlementsModule,
    TelegramModule,
    PayinModule,
    PayoutModule,
    AppealsModule,
    AdminModule,
    SupportModule,
    MaintenanceModule,
    HealthModule,
    CascadeModule,
    RatingsModule,
    ReferralModule,
    BalanceTransactionsModule,
    CountriesModule,
    PaymentMethodsModule,
    MerchantDirectionsModule,
    PlatformSettingsModule,
    TraderWalletsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
