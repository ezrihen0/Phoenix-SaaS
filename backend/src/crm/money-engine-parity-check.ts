import assert from "node:assert/strict";

import {
  computeDocumentPreviewTotals,
  computeLineSubtotalCents as frontendLineSubtotal,
} from "../../../frontend/lib/crm/money-engine";
import { computeDocumentTotals, computeLineSubtotalCents } from "./money-engine.core";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

const parityVectors = [
  { quantity: "1", unitPriceCents: 10_000, taxRateBps: 500 },
  { quantity: "1.5", unitPriceCents: 10_000, taxRateBps: 1300 },
  { quantity: "0.25", unitPriceCents: 8000, taxRateBps: 0 },
  { quantity: "3.333", unitPriceCents: 1234, taxRateBps: 500 },
  {
    lines: [
      { quantity: "1", unitPriceCents: 100 },
      { quantity: "2.5", unitPriceCents: 1999 },
    ],
    taxRateBps: 1300,
  },
] as const;

expect("frontend line subtotal matches backend for parity vectors", () => {
  for (const vector of parityVectors) {
    if ("lines" in vector) {
      continue;
    }

    const backend = computeLineSubtotalCents(vector.quantity, vector.unitPriceCents);
    const frontend = frontendLineSubtotal(vector.quantity, vector.unitPriceCents);
    assert.equal(frontend, backend, `line parity failed for qty=${vector.quantity}`);
  }
});

expect("frontend document preview totals match backend document totals", () => {
  for (const vector of parityVectors) {
    const lines = "lines" in vector
      ? [...vector.lines]
      : [{ quantity: vector.quantity, unitPriceCents: vector.unitPriceCents }];
    const taxRateBps = vector.taxRateBps;

    const backend = computeDocumentTotals(
      lines.map((line) => ({ quantity: line.quantity, unitPriceCents: line.unitPriceCents })),
      taxRateBps,
    );
    const frontend = computeDocumentPreviewTotals(
      lines.map((line) => ({ quantity: line.quantity, unitPriceCents: line.unitPriceCents })),
      taxRateBps,
    );

    assert.equal(frontend.subtotalCents, backend.subtotalCents);
    assert.equal(frontend.taxCents, backend.taxCents);
    assert.equal(frontend.totalCents, backend.totalCents);
  }
});

console.log("money-engine-parity-check complete");
