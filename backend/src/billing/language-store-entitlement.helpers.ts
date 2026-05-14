import type { ConfigService } from "@nestjs/config";

import type { BillingPlanKey, OrganizationBillingStatus } from "./billing.constants";
import {
  additionalLanguageSlotPackSize,
  languageStorePlanBaselines,
  translationUsagePackUnits,
} from "../language-store/language-store.constants";

export const billingSubscriptionItemKinds = [
  "base_plan",
  "language_additional_slot_pack",
  "language_translation_usage_pack",
] as const;
export type BillingSubscriptionItemKind = (typeof billingSubscriptionItemKinds)[number];

export type ResolvedStripeSubscriptionItem = {
  item_kind: BillingSubscriptionItemKind;
  plan_key: BillingPlanKey | null;
  additional_language_slots_per_quantity: number;
  translation_units_per_quantity: number;
};

export type ProjectedLanguageEntitlement = {
  source_plan_key: BillingPlanKey;
  billing_status: OrganizationBillingStatus;
  language_store_enabled: boolean;
  included_additional_language_slots: number;
  addon_additional_language_slots: number;
  total_additional_language_slots: number;
  included_translation_units: number;
  addon_translation_units: number;
  total_translation_units: number;
};

export type ProjectedLanguageEntitlementInput = {
  planKey: BillingPlanKey;
  billingStatus: OrganizationBillingStatus;
  activeItems: Array<{
    item_kind: BillingSubscriptionItemKind;
    quantity: number;
  }>;
};

export function resolveStripeSubscriptionItem(
  configService: Pick<ConfigService, "get">,
  priceId: string | null | undefined,
): ResolvedStripeSubscriptionItem | null {
  const normalizedPriceId = priceId?.trim();
  if (!normalizedPriceId) {
    return null;
  }

  const planMatch = resolvePlanKeyForAnyStripePriceId(configService, normalizedPriceId);
  if (planMatch) {
    return {
      item_kind: "base_plan",
      plan_key: planMatch,
      additional_language_slots_per_quantity: 0,
      translation_units_per_quantity: 0,
    };
  }

  const additionalLanguageSlotPackPriceId = configService.get<string>("STRIPE_PRICE_LANGUAGE_SLOT_PACK")?.trim();
  if (additionalLanguageSlotPackPriceId && additionalLanguageSlotPackPriceId === normalizedPriceId) {
    return {
      item_kind: "language_additional_slot_pack",
      plan_key: null,
      additional_language_slots_per_quantity: additionalLanguageSlotPackSize,
      translation_units_per_quantity: 0,
    };
  }

  const translationUsagePackPriceId = configService.get<string>("STRIPE_PRICE_TRANSLATION_USAGE_PACK")?.trim();
  if (translationUsagePackPriceId && translationUsagePackPriceId === normalizedPriceId) {
    return {
      item_kind: "language_translation_usage_pack",
      plan_key: null,
      additional_language_slots_per_quantity: 0,
      translation_units_per_quantity: translationUsagePackUnits,
    };
  }

  return null;
}

export function projectLanguageEntitlement(input: ProjectedLanguageEntitlementInput): ProjectedLanguageEntitlement {
  const baseline = languageStorePlanBaselines[input.planKey];

  const addonAdditionalLanguageSlots = input.activeItems
    .filter((item) => item.item_kind === "language_additional_slot_pack")
    .reduce((total, item) => total + Math.max(0, item.quantity) * additionalLanguageSlotPackSize, 0);

  const addonTranslationUnits = input.activeItems
    .filter((item) => item.item_kind === "language_translation_usage_pack")
    .reduce((total, item) => total + Math.max(0, item.quantity) * translationUsagePackUnits, 0);

  return {
    source_plan_key: input.planKey,
    billing_status: input.billingStatus,
    language_store_enabled:
      baseline.enabled || addonAdditionalLanguageSlots > 0 || addonTranslationUnits > 0,
    included_additional_language_slots: baseline.included_additional_language_slots,
    addon_additional_language_slots: addonAdditionalLanguageSlots,
    total_additional_language_slots: baseline.included_additional_language_slots + addonAdditionalLanguageSlots,
    included_translation_units: baseline.included_translation_units,
    addon_translation_units: addonTranslationUnits,
    total_translation_units: baseline.included_translation_units + addonTranslationUnits,
  };
}

function resolvePlanKeyForAnyStripePriceId(
  configService: Pick<ConfigService, "get">,
  priceId: string,
): BillingPlanKey | null {
  const starter = configService.get<string>("STRIPE_PRICE_STARTER")?.trim();
  if (starter && starter === priceId) {
    return "starter";
  }

  const pro = configService.get<string>("STRIPE_PRICE_PRO")?.trim();
  if (pro && pro === priceId) {
    return "pro";
  }

  const business = configService.get<string>("STRIPE_PRICE_BUSINESS")?.trim();
  if (business && business === priceId) {
    return "business";
  }

  return null;
}
