import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { CustomerOutputTranslationRecordEntity } from "../database/entities/customer-output-translation-record.entity";
import { OrganizationEnabledLanguageEntity } from "../database/entities/organization-enabled-language.entity";
import { OrganizationLanguageEntitlementEntity } from "../database/entities/organization-language-entitlement.entity";
import { TranslationUsageLedgerEntity } from "../database/entities/translation-usage-ledger.entity";
import { UserOrganizationLanguagePreferenceEntity } from "../database/entities/user-organization-language-preference.entity";
import { CustomerOutputTranslationController } from "./customer-output-translation.controller";
import { GeminiCustomerOutputTranslationProvider } from "./customer-output-translation.gemini-provider";
import { customerOutputTranslationProviderToken } from "./customer-output-translation.provider";
import { CustomerOutputTranslationService } from "./customer-output-translation.service";
import { LanguageStoreController } from "./language-store.controller";
import { LanguageStoreService } from "./language-store.service";

@Module({
  imports: [
    AuthModule,
    BillingModule,
    TypeOrmModule.forFeature([
      OrganizationEnabledLanguageEntity,
      OrganizationLanguageEntitlementEntity,
      UserOrganizationLanguagePreferenceEntity,
      CustomerOutputTranslationRecordEntity,
      TranslationUsageLedgerEntity,
    ]),
  ],
  controllers: [LanguageStoreController, CustomerOutputTranslationController],
  providers: [
    LanguageStoreService,
    CustomerOutputTranslationService,
    GeminiCustomerOutputTranslationProvider,
    {
      provide: customerOutputTranslationProviderToken,
      useExisting: GeminiCustomerOutputTranslationProvider,
    },
  ],
  exports: [LanguageStoreService, CustomerOutputTranslationService],
})
export class LanguageStoreModule {}
