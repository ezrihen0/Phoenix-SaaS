import { Injectable } from "@nestjs/common";

import { apiError } from "../common/api-response";
import { OrganizationBillingService } from "./organization-billing.service";

export type MonetizedFeature = "automations" | "inventory_manage";

@Injectable()
export class EntitlementService {
  constructor(private readonly organizationBillingService: OrganizationBillingService) {}

  async requireAutomationsEntitled(organizationId: string) {
    const row = await this.organizationBillingService.getOrCreateContextForOrganization(organizationId);
    this.assertSubscriptionPaid(row.account.billing_status);
    if (row.account.plan_key !== "business") {
      apiError(
        403,
        "plan_automations_forbidden",
        "Automations are available on the Business plan for this organization.",
      );
    }
  }

  async requireInventoryManageEntitled(organizationId: string) {
    const row = await this.organizationBillingService.getOrCreateContextForOrganization(organizationId);
    this.assertSubscriptionPaid(row.account.billing_status);
    if (row.account.plan_key !== "business") {
      apiError(
        403,
        "plan_inventory_manage_forbidden",
        "Inventory management is available on the Business plan for this organization.",
      );
    }
  }

  async requireOrganizationCreationEntitled(organizationId: string) {
    const context = await this.organizationBillingService.getOrCreateContextForOrganization(organizationId);
    await this.organizationBillingService.requireOrganizationSlotAvailable(context.account.id);
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
