import { computeTaxInclusiveDocumentTotals } from "./money-engine.core";

function expect(label: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${label}`);
  } catch (error) {
    console.error(`FAIL: ${label}`, error);
    process.exitCode = 1;
  }
}

expect("zero total", () => {
  const totals = computeTaxInclusiveDocumentTotals(0, 500);
  if (totals.subtotalCents !== 0 || totals.taxCents !== 0 || totals.totalCents !== 0) {
    throw new Error("Expected zero breakdown");
  }
});

expect("5% GST on $105.00 inclusive", () => {
  const totals = computeTaxInclusiveDocumentTotals(10_500, 500);
  if (totals.subtotalCents !== 10_000 || totals.taxCents !== 500 || totals.totalCents !== 10_500) {
    throw new Error(`Expected 10000+500=10500 got ${totals.subtotalCents}+${totals.taxCents}`);
  }
});

expect("13% HST on $113.00 inclusive", () => {
  const totals = computeTaxInclusiveDocumentTotals(11_300, 1_300);
  if (totals.subtotalCents !== 10_000 || totals.taxCents !== 1_300 || totals.totalCents !== 11_300) {
    throw new Error(`Expected 10000+1300=11300 got ${totals.subtotalCents}+${totals.taxCents}`);
  }
});

expect("penny-safe odd total with 5% GST", () => {
  const totals = computeTaxInclusiveDocumentTotals(10_501, 500);
  if (totals.subtotalCents + totals.taxCents !== totals.totalCents) {
    throw new Error("Totals must reconcile");
  }
});

console.log("money-engine-tax-inclusive-unit-check complete");
