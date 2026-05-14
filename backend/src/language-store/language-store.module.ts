import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { OrganizationEnabledLanguageEntity } from "../database/entities/organization-enabled-language.entity";
import { OrganizationLanguageEntitlementEntity } from "../database/entities/organization-language-entitlement.entity";
import { UserOrganizationLanguagePreferenceEntity } from "../database/entities/user-organization-language-preference.entity";
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
    ]),
  ],
  controllers: [LanguageStoreController],
  providers: [LanguageStoreService],
  exports: [LanguageStoreService],
})
export class LanguageStoreModule {}
