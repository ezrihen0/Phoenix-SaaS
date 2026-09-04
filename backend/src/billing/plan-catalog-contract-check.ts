/**
 * Plan catalog contract assertions (no DB, no payment provider).
 * Run: npm run billing:plan-catalog:check --workspace backend
 */
import assert from "node:assert/strict";

import {
  billingPlanKeys,
  billingPlanOrganizationLimits,
  resolveOrganizationLimitForPlan,
} from "./billing.constants";
import { getPlanCatalogEntry, listPlanCatalogKeys, PLAN_CATALOG } from "./plan-catalog";

assert.equal(PLAN_CATALOG.length, billingPlanKeys.length, "Plan catalog must cover every billing plan key.");

for (const planKey of billingPlanKeys) {
  const entry = getPlanCatalogEntry(planKey);
  assert.equal(entry.key, planKey, `Catalog entry key must match ${planKey}.`);
  assert.equal(
    entry.organizationLimit,
    billingPlanOrganizationLimits[planKey],
    `Catalog org limit must match billing.constants for ${planKey}.`,
  );
  assert.equal(
    entry.organizationLimit,
    resolveOrganizationLimitForPlan(planKey),
    `resolveOrganizationLimitForPlan must match catalog for ${planKey}.`,
  );
  assert.match(entry.monthlyPriceEnvKey, /^NEXT_PUBLIC_PLAN_/);
  assert.ok(entry.title.trim().length > 0);
  assert.ok(entry.features.length > 0);
}

assert.deepEqual(listPlanCatalogKeys(), [...billingPlanKeys]);

assert.equal(billingPlanOrganizationLimits.starter, 1);
assert.equal(billingPlanOrganizationLimits.pro, 3);
assert.equal(billingPlanOrganizationLimits.business, null);

console.log("billing:plan-catalog:check passed");

