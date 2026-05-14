import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { BillingAccountEntity } from "../database/entities/billing-account.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { OrganizationBillingEntity } from "../database/entities/organization-billing.entity";
import { BillingController } from "./billing.controller";
import { BillingOrchestrationService } from "./billing-orchestration.service";
import { BillingProviderRegistryService } from "./billing-provider-registry.service";
import { BillingWebhookController } from "./billing-webhook.controller";
import { EntitlementService } from "./entitlement.service";
import { OrganizationBillingService } from "./organization-billing.service";
import { StripeBillingProvider } from "./stripe/stripe-billing.provider";
import { StripeClient } from "./stripe/stripe.client";
import { StripeWebhookService } from "./stripe/stripe-webhook.service";

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    TypeOrmModule.forFeature([BillingAccountEntity, OrganizationBillingEntity, OrganizationEntity]),
  ],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    StripeClient,
    StripeBillingProvider,
    StripeWebhookService,
    BillingProviderRegistryService,
    BillingOrchestrationService,
    OrganizationBillingService,
    EntitlementService,
  ],
  exports: [EntitlementService, OrganizationBillingService, BillingOrchestrationService],
})
export class BillingModule {}
