import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tableSource = readFileSync(resolve(__dirname, "../components/pricebook-table.tsx"), "utf8");
const pageSource = readFileSync(resolve(__dirname, "../app/pricebook/page.tsx"), "utf8");
const modelSource = readFileSync(resolve(__dirname, "../lib/crm/pricebook-model.ts"), "utf8");
const controllerSource = readFileSync(resolve(__dirname, "../../backend/src/pricebook/pricebook.controller.ts"), "utf8");
const serviceSource = readFileSync(resolve(__dirname, "../../backend/src/pricebook/pricebook.service.ts"), "utf8");

assert.match(tableSource, /Catalog navigation/u);
assert.match(tableSource, /aria-label="Service catalog"/u);
assert.doesNotMatch(tableSource, /Universal schema table/u);
assert.doesNotMatch(tableSource, /Pricebook → System → Category → Item/u);
assert.match(tableSource, /navigationLevel === "root"/u);
assert.match(tableSource, /navigationLevel === "system"/u);
assert.match(tableSource, /categoryCardsForSystem/u);
assert.match(tableSource, /navigationSummary/u);
assert.doesNotMatch(tableSource, /Category folders/u);
assert.doesNotMatch(tableSource, /Fast add entry point/u);
assert.doesNotMatch(tableSource, /item counts from current page/u);
assert.match(tableSource, /systemId: category\.systemId/u);

assert.match(pageSource, /navigation-summary/u);
assert.match(pageSource, /navigationSummary/u);
assert.match(modelSource, /PricebookNavigationSummary/u);
assert.match(modelSource, /buildPricebookNavigationSummaryQuery/u);
assert.match(controllerSource, /navigation-summary/u);
assert.match(serviceSource, /listNavigationSummary/u);

console.log("pricebook-navigation check passed");
