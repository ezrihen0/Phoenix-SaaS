import assert from "node:assert/strict";

import {
  assertClientTotalMatchesEngine,
  computeDocumentTotals,
  computeLineSubtotalCents,
  quantityToThousandths,
} from "./money-engine.core";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

expect("quantity thousandths whole number", () => {
  assert.equal(quantityToThousandths("2"), 2000);
});

expect("quantity thousandths fractional", () => {
  assert.equal(quantityToThousandths("1.25"), 1250);
});

expect("line subtotal matches thousandths rounding", () => {
  assert.equal(computeLineSubtotalCents("1.333", 15000), Math.round((15000 * 1333) / 1000));
});

expect("document totals tax rounding", () => {
  const totals = computeDocumentTotals([{ quantity: "1", unitPriceCents: 10_000 }], 500);
  assert.equal(totals.subtotalCents, 10_000);
  assert.equal(totals.taxCents, 500);
  assert.equal(totals.totalCents, 10_500);
});

expect("fractional qty parity case", () => {
  const totals = computeDocumentTotals([{ quantity: "2.5", unitPriceCents: 1999 }], 0);
  assert.equal(totals.subtotalCents, computeLineSubtotalCents("2.5", 1999));
});

expect("client total mismatch throws", () => {
  const totals = computeDocumentTotals([{ quantity: "1", unitPriceCents: 100 }], 0);
  assert.throws(() => assertClientTotalMatchesEngine(101, totals, "Invoice"));
});

console.log("money-engine-unit-check complete");
