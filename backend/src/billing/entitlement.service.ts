import { Injectable } from "@nestjs/common";

import { apiError } from "../common/api-response";
import type { PhoenixPlanKey } from "./billing.constants";
import { OrganizationBillingService } from "./organization-billing.service";

export type MonetizedFeature = "automations" | "inventory_manage" | "pricebook_manage";

@Injectable()
export class EntitlementService {
  constructor(private readonly organizationBillingService: OrganizationBillingService) {}

  async requireAutomationsEntitled(organizationId: string) {
    const row = await this.organizationBillingService.getOrCreateProfile(organizationId);
    this.assertSubscriptionPaid(row.billing_status);
    if (row.plan_key !== "business") {
      apiError(
        403,
        "plan_automations_forbidden",
        "Automations are available on the Business plan for this organization.",
      );
    }
  }

  async requireInventoryManageEntitled(organizationId: string) {
    const row = await this.organizationBillingService.getOrCreateProfile(organizationId);
    this.assertSubscriptionPaid(row.billing_status);
    if (row.plan_key !== "business") {
      apiError(
        403,
        "plan_inventory_manage_forbidden",
        "Inventory management is available on the Business plan for this organization.",
      );
    }
  }

  async requirePricebookManageEntitled(organizationId: string) {
    const row = await this.organizationBillingService.getOrCreateProfile(organizationId);
    this.assertSubscriptionPaid(row.billing_status);
    if (!this.planAllowsPricebookManage(row.plan_key)) {
      apiError(
        403,
        "plan_pricebook_manage_forbidden",
        "Pricebook management requires Pro or Business for this organization.",
      );
    }
  }

  planAllowsPricebookManage(planKey: PhoenixPlanKey) {
    return planKey === "pro" || planKey === "business";
  }

  private assertSubscriptionPaid(status: string) {
    if (status === "active" || status === "trialing") {
      return;
    }
    apiError(
      403,
      "billing_subscription_inactive",
      "This organization does not have an active subscription state for paid features.",
    );
  }
}
