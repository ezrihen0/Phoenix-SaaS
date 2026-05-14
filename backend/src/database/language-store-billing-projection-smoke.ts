import "dotenv/config";
import assert from "node:assert/strict";

import { projectLanguageEntitlement, resolveStripeSubscriptionItem } from "../billing/language-store-entitlement.helpers";

function createConfigStub(values: Record<string, string>) {
  return {
    get(key: string) {
      return values[key];
    },
  };
}

async function main() {
  const config = createConfigStub({
    STRIPE_PRICE_STARTER: "price_starter",
    STRIPE_PRICE_PRO: "price_pro",
    STRIPE_PRICE_BUSINESS: "price_business",
    STRIPE_PRICE_LANGUAGE_SLOT_PACK: "price_lang_slot",
    STRIPE_PRICE_TRANSLATION_USAGE_PACK: "price_translation_pack",
  });

  assert.deepEqual(resolveStripeSubscriptionItem(config, "price_pro"), {
    item_kind: "base_plan",
    plan_key: "pro",
    additional_language_slots_per_quantity: 0,
    translation_units_per_quantity: 0,
  });

  assert.deepEqual(resolveStripeSubscriptionItem(config, "price_lang_slot"), {
    item_kind: "language_additional_slot_pack",
    plan_key: null,
    additional_language_slots_per_quantity: 1,
    translation_units_per_quantity: 0,
  });

  assert.deepEqual(resolveStripeSubscriptionItem(config, "price_translation_pack"), {
    item_kind: "language_translation_usage_pack",
    plan_key: null,
    additional_language_slots_per_quantity: 0,
    translation_units_per_quantity: 250,
  });

  const projectedPro = projectLanguageEntitlement({
    planKey: "pro",
    billingStatus: "active",
    activeItems: [
      { item_kind: "language_additional_slot_pack", quantity: 2 },
      { item_kind: "language_translation_usage_pack", quantity: 1 },
    ],
  });

  assert.equal(projectedPro.language_store_enabled, true);
  assert.equal(projectedPro.included_additional_language_slots, 2);
  assert.equal(projectedPro.addon_additional_language_slots, 2);
  assert.equal(projectedPro.total_additional_language_slots, 4);
  assert.equal(projectedPro.included_translation_units, 250);
  assert.equal(projectedPro.addon_translation_units, 250);
  assert.equal(projectedPro.total_translation_units, 500);

  const projectedStarterWithAddOn = projectLanguageEntitlement({
    planKey: "starter",
    billingStatus: "active",
    activeItems: [
      { item_kind: "language_translation_usage_pack", quantity: 1 },
    ],
  });

  assert.equal(projectedStarterWithAddOn.language_store_enabled, true);
  assert.equal(projectedStarterWithAddOn.total_additional_language_slots, 0);
  assert.equal(projectedStarterWithAddOn.total_translation_units, 250);

  console.log("Language Store billing projection smoke passed.");
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
