import type { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";

import { AuthService } from "../auth/auth.service";
import { BillingOrchestrationService } from "../billing/billing-orchestration.service";
import { BillingProviderRegistryService } from "../billing/billing-provider-registry.service";
import { LanguageStoreEntitlementService } from "../billing/language-store-entitlement.service";
import { OrganizationBillingService } from "../billing/organization-billing.service";
import { AuthSessionEntity } from "./entities/auth-session.entity";
import { BillingAccountEntity } from "./entities/billing-account.entity";
import { BillingAccountSubscriptionItemEntity } from "./entities/billing-account-subscription-item.entity";
import { ControlledAccessGrantEntity } from "./entities/controlled-access-grant.entity";
import { PlatformOperatorGrantEntity } from "./entities/platform-operator-grant.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationBillingEntity } from "./entities/organization-billing.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationLanguageEntitlementEntity } from "./entities/organization-language-entitlement.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { TechnicianEntity } from "./entities/technician.entity";
import { UserEntity } from "./entities/user.entity";

export class SmokeConfigService {
  get(key: string): string | undefined {
    if (key === "STRIPE_PRICE_STARTER") return "price_smoke_starter";
    if (key === "STRIPE_PRICE_PRO") return "price_smoke_pro";
    if (key === "STRIPE_PRICE_BUSINESS") return "price_smoke_business";
    return process.env[key];
  }
}

export type BillingSmokeHarness = {
  authService: AuthService;
  orchestration: BillingOrchestrationService;
  organizationBillingService: OrganizationBillingService;
};

export function buildBillingSmokeHarness(dataSource: DataSource): BillingSmokeHarness {
  const configService = new SmokeConfigService() as ConfigService;
  const billingProviderRegistryService = new BillingProviderRegistryService();
  const languageStoreEntitlementService = new LanguageStoreEntitlementService(
    configService,
    dataSource.getRepository(OrganizationBillingEntity),
    dataSource.getRepository(BillingAccountSubscriptionItemEntity),
    dataSource.getRepository(OrganizationLanguageEntitlementEntity),
  );
  const organizationBillingService = new OrganizationBillingService(
    dataSource.getRepository(BillingAccountEntity),
    dataSource.getRepository(OrganizationBillingEntity),
    dataSource.getRepository(OrganizationEntity),
    languageStoreEntitlementService,
  );
  const orchestration = new BillingOrchestrationService(
    dataSource,
    organizationBillingService,
    billingProviderRegistryService,
    languageStoreEntitlementService,
  );
  const authService = new AuthService(
    dataSource.getRepository(UserEntity),
    dataSource.getRepository(ProfileEntity),
    dataSource.getRepository(TechnicianEntity),
    dataSource.getRepository(OrganizationEntity),
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(AuthSessionEntity),
    dataSource.getRepository(ControlledAccessGrantEntity),
    dataSource.getRepository(PlatformOperatorGrantEntity),
    organizationBillingService,
    configService,
    dataSource,
  );

  return {
    authService,
    orchestration,
    organizationBillingService,
  };
}
