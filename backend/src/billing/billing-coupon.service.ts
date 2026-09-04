import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import { PHOENIX_OWNER_EMAIL } from "../database/phoenix-owner-credentials";
import { LanguageStoreEntitlementService } from "./language-store-entitlement.service";
import { OrganizationBillingService } from "./organization-billing.service";

const PHOENIX_COUPON_ALIASES = ["PHOENIXFULL"] as const;

@Injectable()
export class BillingCouponService {
  constructor(
    private readonly configService: ConfigService,
    private readonly organizationBillingService: OrganizationBillingService,
    private readonly languageStoreEntitlementService: LanguageStoreEntitlementService,
  ) {}

  async redeemCoupon(actor: ActorContext, organizationId: string, rawCode: string) {
    const normalizedCode = rawCode.trim().toUpperCase();
    if (!normalizedCode) {
      apiError(400, "invalid_coupon_code", "Enter a coupon code.");
    }

    const configuredCode = (
      this.configService.get<string>("PHOENIX_BILLING_COUPON_CODE") ?? "PHOENIXFIREPLACE0"
    )
      .trim()
      .toUpperCase();

    const acceptedCodes = new Set<string>([configuredCode, ...PHOENIX_COUPON_ALIASES]);
    if (!acceptedCodes.has(normalizedCode)) {
      apiError(400, "invalid_coupon_code", "That coupon code is not recognized.");
    }

    const eligibleEmail = (
      this.configService.get<string>("PHOENIX_BILLING_COUPON_ELIGIBLE_EMAIL") ?? PHOENIX_OWNER_EMAIL
    )
      .trim()
      .toLowerCase();

    const actorEmail = actor.user.email?.trim().toLowerCase();
    if (!actorEmail || actorEmail !== eligibleEmail) {
      apiError(
        403,
        "coupon_not_eligible",
        "This coupon code is restricted to the Phoenix Fireplace owner account.",
      );
    }

    await this.organizationBillingService.updateBillingFields(organizationId, {
      plan_key: "business",
      billing_status: "active",
      attention_reason: null,
      deactivated_at: null,
      canceled_at: null,
      cancel_at_period_end: false,
    });

    const refreshed = await this.organizationBillingService.getOrCreateContextForOrganization(organizationId);
    await this.languageStoreEntitlementService.reprojectBillingAccount(refreshed.account);

    return {
      coupon_code: normalizedCode,
      billing: this.organizationBillingService.getPublicSummary(refreshed),
      message: "Business plan access is now active for this billing account.",
    };
  }
}
