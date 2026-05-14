import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { requirePermission } from "../auth/permissions";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { parseBillingPlanKey } from "./billing.constants";
import { BillingOrchestrationService } from "./billing-orchestration.service";
import { OrganizationBillingService } from "./organization-billing.service";
import { resolveStripePriceIdForPlan } from "./stripe/stripe-price-catalog";

@Controller("api/billing")
@UseGuards(SessionGuard)
export class BillingController {
  constructor(
    private readonly configService: ConfigService,
    private readonly organizationBillingService: OrganizationBillingService,
    private readonly billingOrchestrationService: BillingOrchestrationService,
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
      active_provider: this.billingOrchestrationService.getActiveProviderName(),
      provider_checkout_configured: this.billingOrchestrationService.isActiveProviderConfigured(),
      checkout_urls_configured: this.billingOrchestrationService.getStripeCheckoutUrlsConfigured(),
      webhook_verification_configured: Boolean(this.configService.get<string>("STRIPE_WEBHOOK_SECRET")?.trim()),
      stripe_price_env_configured: {
        starter: Boolean(resolveStripePriceIdForPlan(this.configService, "starter")),
        pro: Boolean(resolveStripePriceIdForPlan(this.configService, "pro")),
        business: Boolean(resolveStripePriceIdForPlan(this.configService, "business")),
      },
    });
  }

  @Post("checkout-session")
  async checkoutSession(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requirePermission(
      request.actor,
      "billing.manage",
      "billing_manage_forbidden",
      "Only an organization owner can start WizField billing checkout for this workspace.",
    );
    const organizationId = this.requireOrganizationId(actor);
    const planKey = readPlanKeyFromBody(body);
    return apiSuccess(await this.billingOrchestrationService.createCheckoutSessionForOrganization({
      organizationId,
      userId: actor.user.id,
      userEmail: actor.user.email ?? null,
      planKey,
    }));
  }

  private requireOrganizationId(actor: RequestWithActor["actor"]) {
    const organizationId = actor?.organization_id;
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for billing.");
    }
    return organizationId;
  }
}

function readPlanKeyFromBody(body: unknown): NonNullable<ReturnType<typeof parseBillingPlanKey>> {
  if (!body || typeof body !== "object") {
    apiError(400, "billing_payload_invalid", "Expected a JSON object.");
  }
  const o = body as Record<string, unknown>;
  const planKey = parseBillingPlanKey(o.plan_key);
  if (!planKey) {
    apiError(400, "billing_plan_key_invalid", "Field plan_key must be starter, pro, or business.");
  }
  return planKey;
}
