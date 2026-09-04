import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const modelSource = readFileSync(resolve(__dirname, "../lib/crm/pricebook-model.ts"), "utf8");
const formSource = readFileSync(resolve(__dirname, "../components/pricebook-add-item-form.tsx"), "utf8");
const pageSource = readFileSync(resolve(__dirname, "../app/pricebook/new/page.tsx"), "utf8");

function extractFunction(source, name) {
  const marker = `export function ${name}`;
  const start = source.indexOf(marker);

  if (start === -1) {
    throw new Error(`Missing ${name} in pricebook-model.ts`);
  }

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let end = bodyStart;

  for (; end < source.length; end += 1) {
    if (source[end] === "{") {
      depth += 1;
    } else if (source[end] === "}") {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end).replace(/^export\s+/, "");
}

function stripSimpleTypes(source) {
  return source
    .replace(/:\s*number \| null \| undefined/g, "")
    .replace(/:\s*string/g, "")
    .replace(/:\s*boolean/g, "");
}

const helpers = [
  "parseRequiredCategory",
  "parseRequiredItemName",
  "parseCadPriceToCents",
  "parseWarrantyDurationMonths",
].map((name) => stripSimpleTypes(extractFunction(modelSource, name))).join("\n");

const {
  parseRequiredCategory,
  parseRequiredItemName,
  parseCadPriceToCents,
  parseWarrantyDurationMonths,
} = eval(`${helpers}\n({ parseRequiredCategory, parseRequiredItemName, parseCadPriceToCents, parseWarrantyDurationMonths })`);

function expectError(label, fn, messagePattern) {
  try {
    fn();
    throw new Error(`Expected ${label} to throw.`);
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), messagePattern);
  }
}

assert.equal(parseRequiredCategory("Parts"), "Parts");
expectError("empty category", () => parseRequiredCategory("  "), /Category is required/);
assert.equal(parseRequiredItemName("OEM SIT Pilot Assembly"), "OEM SIT Pilot Assembly");
expectError("empty name", () => parseRequiredItemName(""), /Item Name is required/);
assert.equal(parseCadPriceToCents("0"), 0);
assert.equal(parseCadPriceToCents("125.50"), 12550);
expectError("empty price", () => parseCadPriceToCents(""), /Price is required/);
expectError("negative price", () => parseCadPriceToCents("-12"), /CAD amount/);
assert.equal(parseWarrantyDurationMonths("12", false), null);
assert.equal(parseWarrantyDurationMonths("12", true), 12);
expectError("duration required when on", () => parseWarrantyDurationMonths("", true), /required/);

assert.match(modelSource, /export type PricebookCategory/);
assert.match(modelSource, /category_id: string \| null/);
assert.match(modelSource, /category: PricebookCategory \| null/);
assert.doesNotMatch(modelSource, /category\?: string \| null/);
assert.match(pageSource, /PricebookAddItemForm/);
assert.match(pageSource, /PricebookCategoryListResult/);
assert.match(pageSource, /PricebookSystemListResult/);
assert.match(pageSource, /\/api\/pricebook\/systems/);
assert.match(formSource, /label="System"/);
assert.match(formSource, /Add New Item/);
assert.match(formSource, /label="Category"/);
assert.match(formSource, /category: parseRequiredCategory/);
assert.doesNotMatch(formSource, /tradeArea|trade_area/);
assert.match(formSource, /label="Item Name"/);
assert.match(formSource, /label="Customer Description"/);
assert.match(formSource, /label="Customer Price"/);
assert.match(formSource, /label="Material \/ Purchase Cost"/);
assert.match(formSource, /label="Supplier SKU"/);
assert.match(formSource, /materialCostCents: parseCadPriceToCents\(materialCost\)/);
assert.match(formSource, /supplierName: supplierName\.trim\(\) \|\| null/);
assert.match(formSource, /supplierSku: supplierSku\.trim\(\) \|\| null/);
assert.doesNotMatch(formSource, /label="Price"/);
assert.match(formSource, /Warranty/);
assert.match(formSource, /Create Item/);
assert.match(formSource, /pricebook\.manage|canManagePricebookRole/);
assert.match(formSource, /imageDataUrl/);
assert.doesNotMatch(formSource, /Internal SKU|Unit of Measure|Labor Minutes|Sort Order|Requires Permit|Trade Area|Popular/);
assert.match(formSource, /router\.push\(`\/pricebook\/\$\{created\.id\}`\)/);

console.log("pricebook-add-item frontend check passed");
