/**
 * Add New Item create-contract assertions (no DB).
 * Run: npm run pricebook:add-item:check --workspace backend
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseOptionalPricebookImage } from "./pricebook-image";
import { parseCreatePricebookItemPayload } from "./validation";

function expectError(label: string, fn: () => unknown, messagePattern: RegExp) {
  try {
    fn();
    throw new Error(`Expected ${label} to throw.`);
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), messagePattern);
  }
}

const simpleCreate = {
  systemId: "11111111-1111-4111-8111-111111111111",
  category: "Parts",
  name: "OEM SIT Pilot Assembly",
  customerPriceCents: 12500,
};

const createdOff = parseCreatePricebookItemPayload(simpleCreate);
assert.equal(createdOff.categoryName, "Parts");
assert.equal(createdOff.systemId, "11111111-1111-4111-8111-111111111111");
assert.equal(createdOff.categoryId, null);
assert.equal(createdOff.tradeArea, null);
assert.equal(createdOff.name, "OEM SIT Pilot Assembly");
assert.equal(createdOff.customerPriceCents, 12500);
assert.equal(createdOff.warrantyMonths, null);
assert.equal(createdOff.image, null);
assert.equal(createdOff.internalSku, null);
assert.equal(createdOff.itemType, "product");
assert.equal(createdOff.unitOfMeasure, "each");
assert.equal(createdOff.baseCostCents, 0);
assert.equal(createdOff.inventoryTrackingMode, "none");
assert.equal(createdOff.requiresPermit, false);
assert.equal(createdOff.isPopular, false);
assert.equal(createdOff.isActive, true);
assert.equal(createdOff.sortOrder, 0);

const createdOn = parseCreatePricebookItemPayload({
  ...simpleCreate,
  warrantyEnabled: true,
  warrantyMonths: 12,
});
assert.equal(createdOn.warrantyMonths, 12);

const createdOffExplicit = parseCreatePricebookItemPayload({
  ...simpleCreate,
  warrantyEnabled: false,
  warrantyMonths: 36,
});
assert.equal(createdOffExplicit.warrantyMonths, null);

expectError(
  "warranty duration required when on",
  () => parseCreatePricebookItemPayload({ ...simpleCreate, warrantyEnabled: true }),
  /warrantyMonths is required/,
);

const createdWithTradeArea = parseCreatePricebookItemPayload({
  ...simpleCreate,
  tradeArea: "Gas",
});
assert.equal(createdWithTradeArea.categoryName, "Parts");
assert.equal(createdWithTradeArea.tradeArea, "Gas");

const createdWithCategoryId = parseCreatePricebookItemPayload({
  categoryId: "22222222-2222-4222-8222-222222222222",
  name: "OEM SIT Pilot Assembly",
  customerPriceCents: 12500,
});
assert.equal(createdWithCategoryId.categoryId, "22222222-2222-4222-8222-222222222222");
assert.equal(createdWithCategoryId.categoryName, null);
assert.equal(createdWithCategoryId.systemId, null);
assert.equal(createdWithCategoryId.tradeArea, null);

expectError(
  "system required for new category name",
  () => parseCreatePricebookItemPayload({
    category: "Parts",
    name: "OEM SIT Pilot Assembly",
    customerPriceCents: 12500,
  }),
  /systemId is required/i,
);

expectError(
  "category required",
  () => parseCreatePricebookItemPayload({
    name: "OEM SIT Pilot Assembly",
    customerPriceCents: 12500,
  }),
  /category is required/i,
);

expectError(
  "tradeArea is not category",
  () => parseCreatePricebookItemPayload({
    tradeArea: "Parts",
    name: "OEM SIT Pilot Assembly",
    customerPriceCents: 12500,
  }),
  /category is required/i,
);

expectError(
  "name required",
  () => parseCreatePricebookItemPayload({
    category: "Parts",
    customerPriceCents: 12500,
  }),
  /name is required/i,
);

expectError(
  "price required",
  () => parseCreatePricebookItemPayload({
    category: "Parts",
    name: "OEM SIT Pilot Assembly",
  }),
  /customerPriceCents must be a non-negative integer/,
);

expectError(
  "negative price rejected",
  () => parseCreatePricebookItemPayload({
    ...simpleCreate,
    customerPriceCents: -1,
  }),
  /non-negative integer/,
);

assert.equal(parseCreatePricebookItemPayload({ ...simpleCreate, customerPriceCents: 0 }).customerPriceCents, 0);
assert.equal(parseOptionalPricebookImage(undefined), null);
assert.equal(parseOptionalPricebookImage(null), null);
assert.equal(parseCreatePricebookItemPayload({ ...simpleCreate, imageDataUrl: null }).image, null);

const pngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const parsedImage = parseOptionalPricebookImage(pngDataUrl);
assert.equal(parsedImage?.contentType, "image/png");
assert.equal(parsedImage?.extension, "png");
assert.ok((parsedImage?.buffer.length ?? 0) > 0);

expectError(
  "invalid image rejected",
  () => parseOptionalPricebookImage("data:text/plain;base64,QQ=="),
  /JPEG, PNG, or WebP/,
);

const controllerSource = readFileSync(resolve(__dirname, "pricebook.controller.ts"), "utf8");
const serviceSource = readFileSync(resolve(__dirname, "pricebook.service.ts"), "utf8");
const validationSource = readFileSync(resolve(__dirname, "validation.ts"), "utf8");
assert.match(controllerSource, /@Post\("items"\)[\s\S]*requirePricebookManage/);
assert.match(controllerSource, /"pricebook\.manage"/);
assert.match(serviceSource, /pricebookCategoryRepository/);
assert.match(serviceSource, /category_id: category\.id/);
assert.doesNotMatch(serviceSource, /category:\s*item\.trade_area/);
assert.doesNotMatch(validationSource, /payload\.category !== undefined \? payload\.category : payload\.tradeArea/);

console.log("pricebook-add-item-unit-check: ok");
