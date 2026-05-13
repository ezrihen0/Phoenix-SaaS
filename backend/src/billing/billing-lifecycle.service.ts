import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { apiError } from "../common/api-response";
import type { OrganizationBillingStatus, PhoenixPlanKey } from "./billing.constants";
import { rejectLikelyRawCardNumber } from "./billing-payload-guard";
import { CloverEcommerceClient } from "./clover-ecommerce.client";
import { CloverRecurringClient } from "./clover-recurring.client";
import { OrganizationBillingService } from "./organization-billing.service";
import { resolveCloverPlanIdForPhoenixPlan } from "./plan-catalog";

const blockingSubscribeStatuses: OrganizationBillingStatus[] = ["active", "trialing", "past_due"];

@Injectable()
export class BillingLifecycleService {
  constructor(
    private readonly configService: ConfigService,
    private readonly organizationBillingService: OrganizationBillingService,
    private readonly cloverEcommerceClient: CloverEcommerceClient,
    private readonly cloverRecurringClient: CloverRecurringClient,
  ) {}

  isEcommerceConfigured(): boolean {
    return this.cloverEcommerceClient.isConfigured();
  }

  /**
   * Values for browser-side Clover tokenization (public apiAccessKey + merchant id).
   * Authenticated route only; do not widen without proving Clover requires anonymous access.
   */
  getTokenizationConfigForClient() {
    const merchantId = this.configService.get<string>("CLOVER_MERCHANT_ID")?.trim() ?? "";
    const apiAccessKey = this.configService.get<string>("CLOVER_ECOMMERCE_PUBLIC_KEY")?.trim() ?? "";
    const ecommerceSclBaseUrl = (
      this.configService.get<string>("CLOVER_ECOMMERCE_API_BASE_URL")?.trim()
      ?? "https://scl-sandbox.dev.clover.com"
    ).replace(/\/$/, "");
    const recurringHost = this.configService.get<string>("CLOVER_API_BASE_URL")?.trim()
      ?? "https://apisandbox.dev.clover.com";
    const environment = recurringHost.includes("apisandbox") || ecommerceSclBaseUrl.includes("sandbox")
      ? "sandbox"
      : "production";

    return {
      configured: Boolean(merchantId && apiAccessKey),
      merchant_id: merchantId,
      api_access_key: apiAccessKey,
      ecommerce_scl_base_url: ecommerceSclBaseUrl,
      environment,
    };
  }

  isTokenizationConfigReady(): boolean {
    const c = this.getTokenizationConfigForClient();
    return c.configured;
  }

  async subscribeWithCardToken(
    organizationId: string,
    input: {
      planKey: PhoenixPlanKey;
      source: string;
      email?: string;
      firstName?: string;
      lastName?: string;
    },
  ) {
    rejectLikelyRawCardNumber(input.source);

    this.assertCloverStackReady();

    const planId = resolveCloverPlanIdForPhoenixPlan(this.configService, input.planKey);
    if (!planId) {
      apiError(
        503,
        "clover_plan_not_configured",
        `Clover recurring plan id is not configured for plan "${input.planKey}".`,
      );
    }

    const row = await this.organizationBillingService.getOrCreateProfile(organizationId);
    if (
      row.clover_subscription_id?.trim()
      && blockingSubscribeStatuses.includes(row.billing_status)
    ) {
      apiError(
        409,
        "billing_subscription_already_active",
        "This organization already has a subscription in a billable state. Use change plan or cancel first.",
      );
    }

    let customerId = row.clover_customer_id?.trim() ?? null;
    if (!customerId) {
      const created = await this.cloverEcommerceClient.createCustomerWithSource({
        source: input.source,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
      });
      customerId = typeof created?.id === "string" ? created.id.trim() : null;
      if (!customerId) {
        apiError(
          502,
          "clover_ecommerce_customer_failed",
          "Clover did not return a customer id after saving the card token.",
        );
      }
    } else {
      const updated = await this.cloverEcommerceClient.updateCustomerSource(customerId, input.source);
      if (updated === null) {
        apiError(
          502,
          "clover_ecommerce_source_failed",
          "Clover did not accept the card token for this customer.",
        );
      }
    }

    const remote = await this.cloverRecurringClient.createSubscription(planId, {
      customerId,
      collectionMethod: "CHARGE_AUTOMATICALLY",
    });
    const subscriptionId = typeof remote?.id === "string" ? remote.id.trim() : null;
    if (!subscriptionId) {
      apiError(
        502,
        "clover_subscription_create_failed",
        "Clover did not return a subscription id. No local plan change was applied.",
      );
    }

    const remotePlanId = typeof remote?.plan?.id === "string" ? remote.plan.id.trim() : planId;
    const now = new Date();

    await this.organizationBillingService.updateBillingFields(organizationId, {
      clover_customer_id: customerId,
      clover_subscription_id: subscriptionId,
      clover_plan_id: remotePlanId,
      plan_key: input.planKey,
      billing_status: remote?.active === false ? "deactivated" : "active",
      last_clover_sync_at: now,
      attention_reason: null,
      deactivated_at: remote?.active === false ? now : null,
      canceled_at: null,
      cancel_at_period_end: false,
    });

    return this.organizationBillingService.getOrCreateProfile(organizationId);
  }

  async changePlan(organizationId: string, nextPlanKey: PhoenixPlanKey) {
    const row = await this.organizationBillingService.getOrCreateProfile(organizationId);
    if (row.plan_key === nextPlanKey) {
      return row;
    }

    this.assertCloverStackReady();
    const oldSubId = row.clover_subscription_id?.trim();
    if (!oldSubId) {
      apiError(400, "billing_subscription_missing", "No Clover subscription is stored for this organization yet.");
    }

    const customerId = row.clover_customer_id?.trim();
    if (!customerId) {
      apiError(400, "billing_customer_missing", "No Clover customer id is stored for this organization.");
    }

    const newPlanId = resolveCloverPlanIdForPhoenixPlan(this.configService, nextPlanKey);
    if (!newPlanId) {
      apiError(
        503,
        "clover_plan_not_configured",
        `Clover recurring plan id is not configured for plan "${nextPlanKey}".`,
      );
    }

    const deactivated = await this.cloverRecurringClient.updateSubscription(oldSubId, { active: false });
    if (!deactivated) {
      apiError(502, "clover_subscription_deactivate_failed", "Clover did not confirm deactivation of the current subscription.");
    }

    const remote = await this.cloverRecurringClient.createSubscription(newPlanId, {
      customerId,
      collectionMethod: "CHARGE_AUTOMATICALLY",
    });
    const newSubId = typeof remote?.id === "string" ? remote.id.trim() : null;
    const now = new Date();

    if (!newSubId) {
      await this.organizationBillingService.updateBillingFields(organizationId, {
        billing_status: "unknown",
        last_clover_sync_at: now,
        attention_reason:
          "Plan change failed: the previous subscription was deactivated in Clover but a new subscription was not created. Resolve in Clover or retry after restoring payment method.",
      });
      apiError(
        502,
        "clover_subscription_create_failed",
        "The old subscription was deactivated, but Clover did not return a new subscription id. Local plan was not updated.",
      );
    }

    const remotePlanId = typeof remote?.plan?.id === "string" ? remote.plan.id.trim() : newPlanId;

    await this.organizationBillingService.updateBillingFields(organizationId, {
      clover_subscription_id: newSubId,
      clover_plan_id: remotePlanId,
      plan_key: nextPlanKey,
      billing_status: remote?.active === false ? "deactivated" : "active",
      last_clover_sync_at: now,
      attention_reason: null,
      deactivated_at: remote?.active === false ? now : null,
    });

    return this.organizationBillingService.getOrCreateProfile(organizationId);
  }

  async cancelSubscription(organizationId: string) {
    this.assertRecurringReady();

    const row = await this.organizationBillingService.getOrCreateProfile(organizationId);
    const subId = row.clover_subscription_id?.trim();
    if (!subId) {
      apiError(400, "billing_subscription_missing", "No Clover subscription id is stored for this organization.");
    }

    const updated = await this.cloverRecurringClient.updateSubscription(subId, { active: false });
    if (!updated) {
      apiError(502, "clover_subscription_deactivate_failed", "Clover did not confirm subscription cancellation.");
    }

    const now = new Date();
    await this.organizationBillingService.updateBillingFields(organizationId, {
      billing_status: "deactivated",
      deactivated_at: now,
      last_clover_sync_at: now,
      attention_reason: null,
      canceled_at: now,
    });

    return this.organizationBillingService.getOrCreateProfile(organizationId);
  }

  private assertCloverStackReady() {
    if (!this.cloverEcommerceClient.isConfigured()) {
      apiError(
        503,
        "clover_ecommerce_not_configured",
        "Clover ecommerce credentials are not configured (e.g. CLOVER_ECOMMERCE_ACCESS_TOKEN or CLOVER_ACCESS_TOKEN).",
      );
    }
    this.assertRecurringReady();
  }

  private assertRecurringReady() {
    if (!this.cloverRecurringClient.isConfigured()) {
      apiError(
        503,
        "clover_billing_not_configured",
        "Clover merchant credentials are not configured on the server.",
      );
    }
  }
}
