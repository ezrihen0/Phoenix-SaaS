import type { ConfigService } from "@nestjs/config";

import type { BillingPlanKey } from "../billing.constants";
import { resolveStripeSubscriptionItem, type ResolvedStripeSubscriptionItem } from "../language-store-entitlement.helpers";

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
  return resolveStripeSubscriptionCatalogEntry(configService, priceId)?.plan_key ?? null;
}

export function resolveStripePriceIdForLanguageSlotPack(configService: ConfigService): string | null {
  return configService.get<string>("STRIPE_PRICE_LANGUAGE_SLOT_PACK")?.trim() || null;
}

export function resolveStripePriceIdForTranslationUsagePack(configService: ConfigService): string | null {
  return configService.get<string>("STRIPE_PRICE_TRANSLATION_USAGE_PACK")?.trim() || null;
}

export function resolveStripeSubscriptionCatalogEntry(
  configService: ConfigService,
  priceId: string | null | undefined,
): ResolvedStripeSubscriptionItem | null {
  return resolveStripeSubscriptionItem(configService, priceId);
}
