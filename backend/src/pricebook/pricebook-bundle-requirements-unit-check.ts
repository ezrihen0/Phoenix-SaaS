/**
 * Pricebook bundle requirement payload assertions (no DB).
 * Run: npm run pricebook:bundle-requirements:check --workspace backend
 */
import assert from "node:assert/strict";

import {
  parseCreatePricebookBundleRequirementPayload,
  parseUpdatePricebookBundleRequirementPayload,
} from "./validation";

function expectError(label: string, fn: () => unknown, messagePattern: RegExp) {
  try {
    fn();
    throw new Error(`Expected ${label} to throw.`);
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), messagePattern);
  }
}

const categoryId = "22222222-2222-4222-8222-222222222222";

const created = parseCreatePricebookBundleRequirementPayload({
  label: "Required chimney cap",
  categoryId,
  defaultQuantity: "1",
  sortOrder: 0,
});
assert.equal(created.label, "Required chimney cap");
assert.equal(created.categoryId, categoryId);
assert.equal(created.defaultQuantity, "1.000");
assert.equal(created.sortOrder, 0);

const createdWithDefaults = parseCreatePricebookBundleRequirementPayload({
  label: "Required liner",
  categoryId,
});
assert.equal(createdWithDefaults.defaultQuantity, "1.000");
assert.equal(createdWithDefaults.sortOrder, 0);

expectError(
  "label required",
  () => parseCreatePricebookBundleRequirementPayload({ categoryId }),
  /label is required/i,
);

expectError(
  "categoryId required",
  () => parseCreatePricebookBundleRequirementPayload({ label: "Required liner" }),
  /categoryId is required/i,
);

expectError(
  "invalid categoryId",
  () => parseCreatePricebookBundleRequirementPayload({
    label: "Required liner",
    categoryId: "not-a-uuid",
  }),
  /categoryId must be a valid UUID/i,
);

expectError(
  "negative sortOrder rejected",
  () => parseCreatePricebookBundleRequirementPayload({
    label: "Required liner",
    categoryId,
    sortOrder: -1,
  }),
  /sortOrder must be a non-negative integer/i,
);

const updated = parseUpdatePricebookBundleRequirementPayload({
  label: "Updated requirement label",
  categoryId,
  defaultQuantity: "2.5",
  sortOrder: 3,
});
assert.equal(updated.label, "Updated requirement label");
assert.equal(updated.categoryId, categoryId);
assert.equal(updated.defaultQuantity, "2.500");
assert.equal(updated.sortOrder, 3);

assert.deepEqual(parseUpdatePricebookBundleRequirementPayload({}), {});

expectError(
  "invalid update quantity",
  () => parseUpdatePricebookBundleRequirementPayload({ defaultQuantity: "0" }),
  /defaultQuantity must be greater than zero/i,
);

console.log("pricebook-bundle-requirements-unit-check: ok");
