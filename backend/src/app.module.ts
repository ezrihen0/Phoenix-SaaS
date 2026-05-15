import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AiModule } from "./ai/ai.module";
import { AutomationsModule } from "./automations/automations.module";
import { BillingModule } from "./billing/billing.module";
import { AuthModule } from "./auth/auth.module";
import { AuthService } from "./auth/auth.service";
import { CrmModule } from "./crm/crm.module";
import { CustomerPortalModule } from "./customer-portal/customer-portal.module";
import { buildTypeOrmModuleOptions } from "./database/typeorm.config";
import { InspectionsModule } from "./inspections/inspections.module";
import { InventoryModule } from "./inventory/inventory.module";
import { LanguageStoreModule } from "./language-store/language-store.module";
import { MarketingModule } from "./marketing/marketing.module";
import { MessagingModule } from "./messaging/messaging.module";
import { PricebookModule } from "./pricebook/pricebook.module";
import { PublicBookingsModule } from "./public/public-bookings.module";
import { SearchModule } from "./search/search.module";
import { SettingsModule } from "./settings/settings.module";
import { TelephonyModule } from "./telephony/telephony.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => buildTypeOrmModuleOptions(configService),
    }),
    AuthModule,
    CrmModule,
    AiModule,
    SearchModule,
    SettingsModule,
    PublicBookingsModule,
    InspectionsModule,
    CustomerPortalModule,
    MessagingModule,
    MarketingModule,
    LanguageStoreModule,
    InventoryModule,
    PricebookModule,
    TelephonyModule,
    AutomationsModule,
    BillingModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly authService: AuthService) {}

  async onModuleInit() {
    await this.authService.ensureBootstrapAdmin();
  }
}
