import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { requirePermission } from "../auth/permissions";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import type { OrganizationBillingStatus } from "./billing.constants";
import { parsePhoenixPlanKey } from "./billing.constants";
import { BillingLifecycleService } from "./billing-lifecycle.service";
import { CloverRecurringClient } from "./clover-recurring.client";
import { OrganizationBillingService } from "./organization-billing.service";
import { resolveCloverPlanIdForPhoenixPlan } from "./plan-catalog";

@Controller("api/billing")
@UseGuards(SessionGuard)
export class BillingController {
  constructor(
    private readonly configService: ConfigService,
    private readonly organizationBillingService: OrganizationBillingService,
    private readonly cloverRecurringClient: CloverRecurringClient,
    private readonly billingLifecycleService: BillingLifecycleService,
  ) {}

  @Get("summary")
  async summary(@Req() request: RequestWithActor) {
    const actor = requirePermission(
      request.actor,
      "billing.manage",
      "billing_manage_forbidden",
      "Only an organization owner can view PhoenixOS billing for this workspace.",
    );
    const organizationId = this.requireOrganizationId(actor);
    const row = await this.organizationBillingService.getOrCreateProfile(organizationId);
    return apiSuccess({
      billing: this.organizationBillingService.getPublicSummary(row),
      clover_reconcile_configured: this.cloverRecurringClient.isConfigured(),
      clover_ecommerce_configured: this.billingLifecycleService.isEcommerceConfigured(),
      billing_tokenization_configured: this.billingLifecycleService.isTokenizationConfigReady(),
      clover_plan_env_configured: {
        starter: Boolean(resolveCloverPlanIdForPhoenixPlan(this.configService, "starter")),
        pro: Boolean(resolveCloverPlanIdForPhoenixPlan(this.configService, "pro")),
        business: Boolean(resolveCloverPlanIdForPhoenixPlan(this.configService, "business")),
      },
    });
  }

  /**
   * Authenticated tokenization bootstrap (merchant id + public apiAccessKey for Clover.js).
   * Kept owner-only; widen to anonymous only if Clover proves it is required.
   */
  @Get("tokenization-config")
  async tokenizationConfig(@Req() request: RequestWithActor) {
    requirePermission(
      request.actor,
      "billing.manage",
      "billing_manage_forbidden",
      "Only an organization owner can load Clover tokenization settings for this workspace.",
    );
    return apiSuccess(this.billingLifecycleService.getTokenizationConfigForClient());
  }

  @Post("subscribe")
  async subscribe(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requirePermission(
      request.actor,
      "billing.manage",
      "billing_manage_forbidden",
      "Only an organization owner can start PhoenixOS billing for this workspace.",
    );
    const organizationId = this.requireOrganizationId(actor);
    const parsed = parseSubscribeBody(body);
    const row = await this.billingLifecycleService.subscribeWithCardToken(organizationId, parsed);
    return apiSuccess({
      billing: this.organizationBillingService.getPublicSummary(row),
    });
  }

  @Post("change-plan")
  async changePlan(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requirePermission(
      request.actor,
      "billing.manage",
      "billing_manage_forbidden",
      "Only an organization owner can change PhoenixOS billing plan for this workspace.",
    );
    const organizationId = this.requireOrganizationId(actor);
    const planKey = readPlanKeyFromBody(body);
    const row = await this.billingLifecycleService.changePlan(organizationId, planKey);
    return apiSuccess({
      billing: this.organizationBillingService.getPublicSummary(row),
    });
  }

  @Post("cancel-subscription")
  async cancelSubscription(@Req() request: RequestWithActor) {
    const actor = requirePermission(
      request.actor,
      "billing.manage",
      "billing_manage_forbidden",
      "Only an organization owner can cancel PhoenixOS billing for this workspace.",
    );
    const organizationId = this.requireOrganizationId(actor);
    const row = await this.billingLifecycleService.cancelSubscription(organizationId);
    return apiSuccess({
      billing: this.organizationBillingService.getPublicSummary(row),
    });
  }

  @Post("reconcile")
  async reconcile(@Req() request: RequestWithActor) {
    const actor = requirePermission(
      request.actor,
      "billing.manage",
      "billing_manage_forbidden",
      "Only an organization owner can reconcile PhoenixOS billing for this workspace.",
    );
    const organizationId = this.requireOrganizationId(actor);
    const row = await this.organizationBillingService.getOrCreateProfile(organizationId);

    if (!row.clover_subscription_id?.trim()) {
      apiError(
        400,
        "billing_subscription_missing",
        "No Clover subscription id is stored for this organization yet.",
      );
    }

    if (!this.cloverRecurringClient.isConfigured()) {
      apiError(
        503,
        "clover_billing_not_configured",
        "Clover merchant credentials are not configured on the server.",
      );
    }

    const remote = await this.cloverRecurringClient.getSubscription(row.clover_subscription_id.trim());
    if (!remote) {
      await this.organizationBillingService.setAttention(
        organizationId,
        "Clover subscription reconciliation failed (no response).",
        "unknown",
      );
      const next = await this.organizationBillingService.getOrCreateProfile(organizationId);
      return apiSuccess({
        billing: this.organizationBillingService.getPublicSummary(next),
        reconciled: false,
      });
    }

    const nextStatus = mapRemoteToBillingStatus(remote);
    const planId = typeof remote.plan?.id === "string" ? remote.plan.id : row.clover_plan_id;

    await this.organizationBillingService.updateFromReconciliation(organizationId, {
      billing_status: nextStatus,
      clover_plan_id: planId,
      last_clover_sync_at: new Date(),
      attention_reason: null,
      deactivated_at: remote.active === false ? new Date() : null,
    });

    const next = await this.organizationBillingService.getOrCreateProfile(organizationId);
    return apiSuccess({
      billing: this.organizationBillingService.getPublicSummary(next),
      reconciled: true,
    });
  }

  private requireOrganizationId(actor: RequestWithActor["actor"]) {
    const organizationId = actor?.organization_id;
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for billing.");
    }
    return organizationId;
  }
}

function mapRemoteToBillingStatus(remote: { active?: boolean }): OrganizationBillingStatus {
  if (remote.active === false) {
    return "deactivated";
  }
  if (remote.active === true) {
    return "active";
  }
  return "unknown";
}

function parseSubscribeBody(body: unknown): {
  planKey: NonNullable<ReturnType<typeof parsePhoenixPlanKey>>;
  source: string;
  email?: string;
  firstName?: string;
  lastName?: string;
} {
  if (!body || typeof body !== "object") {
    apiError(400, "billing_payload_invalid", "Expected a JSON object.");
  }
  const o = body as Record<string, unknown>;
  const planKey = parsePhoenixPlanKey(o.plan_key);
  if (!planKey) {
    apiError(400, "billing_plan_key_invalid", "Field plan_key must be starter, pro, or business.");
  }
  const source = typeof o.source === "string" ? o.source.trim() : "";
  if (!source) {
    apiError(400, "billing_source_required", "Field source must be a non-empty Clover card token.");
  }
  const email = typeof o.email === "string" ? o.email.trim() : undefined;
  const firstName = typeof o.first_name === "string" ? o.first_name.trim() : undefined;
  const lastName = typeof o.last_name === "string" ? o.last_name.trim() : undefined;
  return { planKey, source, email, firstName, lastName };
}

function readPlanKeyFromBody(body: unknown): NonNullable<ReturnType<typeof parsePhoenixPlanKey>> {
  if (!body || typeof body !== "object") {
    apiError(400, "billing_payload_invalid", "Expected a JSON object.");
  }
  const o = body as Record<string, unknown>;
  const planKey = parsePhoenixPlanKey(o.plan_key);
  if (!planKey) {
    apiError(400, "billing_plan_key_invalid", "Field plan_key must be starter, pro, or business.");
  }
  return planKey;
}
