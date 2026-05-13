import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { OrganizationBillingEntity } from "../database/entities/organization-billing.entity";
import { BillingController } from "./billing.controller";
import { BillingLifecycleService } from "./billing-lifecycle.service";
import { CloverEcommerceClient } from "./clover-ecommerce.client";
import { CloverRecurringClient } from "./clover-recurring.client";
import { EntitlementService } from "./entitlement.service";
import { OrganizationBillingService } from "./organization-billing.service";

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    TypeOrmModule.forFeature([OrganizationBillingEntity]),
  ],
  controllers: [BillingController],
  providers: [
    CloverEcommerceClient,
    CloverRecurringClient,
    BillingLifecycleService,
    OrganizationBillingService,
    EntitlementService,
  ],
  exports: [EntitlementService, OrganizationBillingService, CloverRecurringClient, CloverEcommerceClient],
})
export class BillingModule {}
