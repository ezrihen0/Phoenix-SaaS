import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { BillingAccountEntity } from "../database/entities/billing-account.entity";
import { BillingAccountSubscriptionItemEntity } from "../database/entities/billing-account-subscription-item.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { OrganizationBillingEntity } from "../database/entities/organization-billing.entity";
import { OrganizationLanguageEntitlementEntity } from "../database/entities/organization-language-entitlement.entity";
import { StripeWebhookEventReceiptEntity } from "../database/entities/stripe-webhook-event-receipt.entity";
import { BillingController } from "./billing.controller";
import { BillingOrchestrationService } from "./billing-orchestration.service";
import { BillingProviderRegistryService } from "./billing-provider-registry.service";
import { BillingWebhookController } from "./billing-webhook.controller";
import { EntitlementService } from "./entitlement.service";
import { LanguageStoreEntitlementService } from "./language-store-entitlement.service";
import { OrganizationBillingService } from "./organization-billing.service";
import { StripeBillingProvider } from "./stripe/stripe-billing.provider";
import { StripeClient } from "./stripe/stripe.client";
import { StripeWebhookReceiptService } from "./stripe/stripe-webhook-receipt.service";
import { StripeWebhookService } from "./stripe/stripe-webhook.service";

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    TypeOrmModule.forFeature([
      BillingAccountEntity,
      BillingAccountSubscriptionItemEntity,
      OrganizationBillingEntity,
      OrganizationEntity,
      OrganizationLanguageEntitlementEntity,
      StripeWebhookEventReceiptEntity,
    ]),
  ],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    StripeClient,
    StripeBillingProvider,
    StripeWebhookService,
    StripeWebhookReceiptService,
    BillingProviderRegistryService,
    BillingOrchestrationService,
    OrganizationBillingService,
    LanguageStoreEntitlementService,
    EntitlementService,
  ],
  exports: [
    EntitlementService,
    OrganizationBillingService,
    BillingOrchestrationService,
    LanguageStoreEntitlementService,
  ],
})
export class BillingModule {}
