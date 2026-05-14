import type { ConfigService } from "@nestjs/config";

import type { BillingPlanKey } from "../billing.constants";

export function resolveStripePriceIdForPlan(
  configService: ConfigService,
  planKey: BillingPlanKey,
): string | null {
  const envKey =
    planKey === "starter"
      ? "STRIPE_PRICE_STARTER"
      : planKey === "pro"
        ? "STRIPE_PRICE_PRO"
        : "STRIPE_PRICE_BUSINESS";
  const value = configService.get<string>(envKey)?.trim();
  return value || null;
}

export function resolvePlanKeyForStripePriceId(
  configService: ConfigService,
  priceId: string | null | undefined,
): BillingPlanKey | null {
  const normalizedPriceId = priceId?.trim();
  if (!normalizedPriceId) {
    return null;
  }

  const matchesStarter = resolveStripePriceIdForPlan(configService, "starter") === normalizedPriceId;
  if (matchesStarter) {
    return "starter";
  }

  const matchesPro = resolveStripePriceIdForPlan(configService, "pro") === normalizedPriceId;
  if (matchesPro) {
    return "pro";
  }

  const matchesBusiness = resolveStripePriceIdForPlan(configService, "business") === normalizedPriceId;
  if (matchesBusiness) {
    return "business";
  }

  return null;
}
