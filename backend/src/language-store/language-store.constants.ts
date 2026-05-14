import type { BillingPlanKey } from "../billing/billing.constants";

export const languageDirections = ["ltr", "rtl"] as const;
export type LanguageDirection = (typeof languageDirections)[number];

export type LanguageCatalogEntry = {
  code: string;
  label: string;
  direction: LanguageDirection;
  is_default: boolean;
  consumes_paid_slot: boolean;
  sort_order: number;
};

export const languageStoreCatalog: LanguageCatalogEntry[] = [
  {
    code: "en",
    label: "English",
    direction: "ltr",
    is_default: true,
    consumes_paid_slot: false,
    sort_order: 0,
  },
  {
    code: "es",
    label: "Spanish",
    direction: "ltr",
    is_default: false,
    consumes_paid_slot: true,
    sort_order: 1,
  },
  {
    code: "he",
    label: "Hebrew",
    direction: "rtl",
    is_default: false,
    consumes_paid_slot: true,
    sort_order: 2,
  },
  {
    code: "uk",
    label: "Ukrainian",
    direction: "ltr",
    is_default: false,
    consumes_paid_slot: true,
    sort_order: 3,
  },
  {
    code: "pl",
    label: "Polish",
    direction: "ltr",
    is_default: false,
    consumes_paid_slot: true,
    sort_order: 4,
  },
] as const;

export const languageStoreDefaultLanguageCode = "en";

export type LanguageStorePlanBaseline = {
  enabled: boolean;
  included_additional_language_slots: number;
  included_translation_units: number;
};

export const languageStorePlanBaselines: Record<BillingPlanKey, LanguageStorePlanBaseline> = {
  starter: {
    enabled: false,
    included_additional_language_slots: 0,
    included_translation_units: 0,
  },
  pro: {
    enabled: true,
    included_additional_language_slots: 2,
    included_translation_units: 250,
  },
  business: {
    enabled: true,
    included_additional_language_slots: 5,
    included_translation_units: 1000,
  },
};

export const additionalLanguageSlotPackSize = 1;
export const translationUsagePackUnits = 250;
export const translationUnitCharacterLimit = 1000;

export function isLanguageStoreCatalogCode(value: string) {
  return languageStoreCatalog.some((language) => language.code === value);
}

export function getLanguageCatalogEntry(code: string) {
  return languageStoreCatalog.find((language) => language.code === code) ?? null;
}
