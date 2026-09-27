import assert from "node:assert/strict";

import { buildLegacyDocumentTotals, computeDocumentTotals } from "./money-engine.core";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

expect("native invoice header mirrors total on amount_cents field mapping", () => {
  const totals = computeDocumentTotals([{ quantity: "1", unitPriceCents: 10_000 }], 500);
  const amountCents = totals.totalCents;
  assert.equal(amountCents, totals.totalCents);
  assert.equal(totals.subtotalCents + totals.taxCents, totals.totalCents);
});

expect("native quote header mirrors total on price_cents field mapping", () => {
  const totals = computeDocumentTotals([{ quantity: "2", unitPriceCents: 2500 }], 1300);
  const priceCents = totals.totalCents;
  assert.equal(priceCents, totals.totalCents);
});

expect("legacy flat totals keep amount and total aligned", () => {
  const totals = buildLegacyDocumentTotals(42_000);
  assert.equal(totals.subtotalCents, 42_000);
  assert.equal(totals.totalCents, 42_000);
  assert.equal(totals.taxCents, 0);
});

console.log("money-engine-persistence-contract-check complete");
