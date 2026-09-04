import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";

import { requirePermission } from "../auth/permissions";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { BillingCouponService } from "./billing-coupon.service";
import { OrganizationBillingService } from "./organization-billing.service";

type RedeemCouponPayload = {
  code?: unknown;
};

@Controller("api/billing")
@UseGuards(SessionGuard)
export class BillingController {
  constructor(
    private readonly organizationBillingService: OrganizationBillingService,
    private readonly billingCouponService: BillingCouponService,
  ) {}

  @Get("summary")
  async summary(@Req() request: RequestWithActor) {
    const actor = requirePermission(
      request.actor,
      "billing.manage",
      "billing_manage_forbidden",
      "Only an organization owner can view WizField billing for this workspace.",
    );
    const organizationId = this.requireOrganizationId(actor);
    const row = await this.organizationBillingService.getOrCreateContextForOrganization(organizationId);
    return apiSuccess({
      billing: this.organizationBillingService.getPublicSummary(row),
      platform_billing_enabled: false,
      active_provider: null,
      provider_checkout_configured: false,
      checkout_urls_configured: false,
      webhook_verification_configured: false,
      checkout_disabled_reason: "WizField SaaS subscription billing is disabled for the active Phoenix runtime.",
    });
  }

  @Post("redeem-coupon")
  async redeemCoupon(@Req() request: RequestWithActor, @Body() body: RedeemCouponPayload) {
    const actor = requirePermission(
      request.actor,
      "billing.manage",
      "billing_manage_forbidden",
      "Only an organization owner can apply billing coupon codes for this workspace.",
    );
    const organizationId = this.requireOrganizationId(actor);
    const code = typeof body?.code === "string" ? body.code : "";
    const result = await this.billingCouponService.redeemCoupon(actor, organizationId, code);
    return apiSuccess(result);
  }

  @Post("checkout-session")
  async checkoutSession(@Req() request: RequestWithActor) {
    requirePermission(
      request.actor,
      "billing.manage",
      "billing_manage_forbidden",
      "Only an organization owner can start WizField billing checkout for this workspace.",
    );
    apiError(
      410,
      "platform_subscription_billing_disabled",
      "WizField SaaS subscription checkout is disabled for this runtime. Phoenix operational access does not require Stripe.",
    );
  }

  private requireOrganizationId(actor: RequestWithActor["actor"]) {
    const organizationId = actor?.organization_id;
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for billing.");
    }
    return organizationId;
  }
}
