/**
 * Pricebook warranty validation and persistence assertions (no DB).
 * Run: npm run pricebook:warranty:check --workspace backend
 */
import assert from "node:assert/strict";

import {
  parseCreatePricebookItemPayload,
  parseUpdatePricebookItemPayload,
  parseWarrantyMonths,
  persistWarrantyMonths,
} from "./validation";

function expectError(label: string, fn: () => unknown, messagePattern: RegExp) {
  try {
    fn();
    throw new Error(`Expected ${label} to throw.`);
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), messagePattern);
  }
}

const baseCreatePayload = {
  systemId: "11111111-1111-4111-8111-111111111111",
  category: "Service",
  internalSku: "TEST-SKU-001",
  name: "Diagnostic Inspection",
  itemType: "service",
  unitOfMeasure: "each",
  baseCostCents: 0,
  materialCostCents: 0,
  laborCostCents: 0,
  customerPriceCents: 12500,
};

assert.equal(parseWarrantyMonths(undefined), undefined);
assert.equal(parseWarrantyMonths(null), null);
assert.equal(parseWarrantyMonths(""), null);
assert.equal(parseWarrantyMonths(0), null);
assert.equal(parseWarrantyMonths(3), 3);
assert.equal(parseWarrantyMonths(12), 12);
assert.equal(parseWarrantyMonths(36), 36);
expectError("negative warranty", () => parseWarrantyMonths(-1), /positive whole number/);
expectError("decimal warranty", () => parseWarrantyMonths(1.5), /positive whole number/);
expectError("string warranty", () => parseWarrantyMonths("12"), /positive whole number/);

assert.equal(persistWarrantyMonths(undefined), undefined);
assert.equal(persistWarrantyMonths(null), null);
assert.equal(persistWarrantyMonths(0), null);
assert.equal(persistWarrantyMonths(-3), null);
assert.equal(persistWarrantyMonths(12), 12);

assert.equal(parseCreatePricebookItemPayload(baseCreatePayload).categoryName, "Service");
assert.equal(parseCreatePricebookItemPayload(baseCreatePayload).tradeArea, null);
assert.equal(parseCreatePricebookItemPayload(baseCreatePayload).warrantyMonths, null);
assert.equal(parseCreatePricebookItemPayload({
  ...baseCreatePayload,
  warrantyMonths: null,
}).warrantyMonths, null);
assert.equal(parseCreatePricebookItemPayload({
  ...baseCreatePayload,
  warrantyMonths: 0,
}).warrantyMonths, null);
assert.equal(parseCreatePricebookItemPayload({
  ...baseCreatePayload,
  warrantyMonths: 12,
}).warrantyMonths, 12);

expectError(
  "create with invalid duration",
  () => parseCreatePricebookItemPayload({ ...baseCreatePayload, warrantyMonths: -4 }),
  /positive whole number/,
);

assert.equal(parseUpdatePricebookItemPayload({ name: "Keep warranty unchanged" }).warrantyMonths, undefined);
assert.equal(parseUpdatePricebookItemPayload({ warrantyMonths: null }).warrantyMonths, null);
assert.equal(parseUpdatePricebookItemPayload({ warrantyMonths: 0 }).warrantyMonths, null);
assert.equal(parseUpdatePricebookItemPayload({ warrantyMonths: 36 }).warrantyMonths, 36);

expectError(
  "update with invalid duration",
  () => parseUpdatePricebookItemPayload({ warrantyMonths: 2.5 }),
  /positive whole number/,
);

console.log("pricebook-warranty-unit-check: ok");
