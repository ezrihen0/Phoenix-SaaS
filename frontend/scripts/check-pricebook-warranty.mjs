import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const modelSource = readFileSync(resolve(__dirname, "../lib/crm/pricebook-model.ts"), "utf8");
const formSource = readFileSync(resolve(__dirname, "../components/pricebook-form.tsx"), "utf8");

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

const helpers = `${stripSimpleTypes(extractFunction(modelSource, "itemHasWarranty"))}\n${stripSimpleTypes(extractFunction(modelSource, "parseWarrantyDurationMonths"))}\n({ itemHasWarranty, parseWarrantyDurationMonths })`;
const { itemHasWarranty, parseWarrantyDurationMonths } = eval(helpers);

assert.equal(itemHasWarranty(null), false);
assert.equal(itemHasWarranty(undefined), false);
assert.equal(itemHasWarranty(0), false);
assert.equal(itemHasWarranty(12), true);

assert.equal(parseWarrantyDurationMonths("", false), null);
assert.equal(parseWarrantyDurationMonths("12", false), null);
assert.equal(parseWarrantyDurationMonths("3", true), 3);
assert.equal(parseWarrantyDurationMonths("12", true), 12);
assert.equal(parseWarrantyDurationMonths("36", true), 36);

function expectError(label, fn, messagePattern) {
  try {
    fn();
    throw new Error(`Expected ${label} to throw.`);
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), messagePattern);
  }
}

expectError("empty duration while on", () => parseWarrantyDurationMonths("", true), /required/);
expectError("zero duration", () => parseWarrantyDurationMonths("0", true), /positive whole number/);
expectError("decimal duration", () => parseWarrantyDurationMonths("12.5", true), /positive whole number/);
expectError("negative duration", () => parseWarrantyDurationMonths("-3", true), /positive whole number/);

assert.match(formSource, /warrantyEnabled:\s*itemHasWarranty\(item\?\.warranty_months\)/);
assert.match(formSource, /warrantyMonths:\s*itemHasWarranty\(item\?\.warranty_months\) \? String\(item\?\.warranty_months\) : ""/);
assert.match(formSource, /label="Warranty"/);
assert.match(formSource, /label="Warranty Duration"/);
assert.match(formSource, /formState\.warrantyEnabled \? \(/);
assert.match(formSource, /warrantyMonths:\s*enabled \? current\.warrantyMonths : ""/);
assert.match(formSource, /parseWarrantyDurationMonths\(formState\.warrantyMonths, formState\.warrantyEnabled\)/);

console.log("pricebook-warranty frontend check passed");
