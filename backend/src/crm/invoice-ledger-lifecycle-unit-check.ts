import { summarizeInvoiceLedger } from "./invoice-financial-lifecycle.core";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

function payment(amountCents: number, entry_type: "payment" | "refund" | "adjustment" = "payment") {
  return {
    entry_type,
    amount_cents: amountCents,
    occurred_at: new Date("2026-01-02T12:00:00.000Z"),
  } as never;
}

expect("zero payments stays sent", () => {
  const summary = summarizeInvoiceLedger({
    totalCents: 10000,
    legacyStatus: "unpaid",
    legacyPaidAt: null,
    payments: [],
  });
  if (summary.lifecycleStatus !== "sent" || summary.balanceCents !== 10000) {
    throw new Error(JSON.stringify(summary));
  }
});

expect("partial payment", () => {
  const summary = summarizeInvoiceLedger({
    totalCents: 10000,
    legacyStatus: "unpaid",
    legacyPaidAt: null,
    payments: [payment(4000)],
  });
  if (summary.lifecycleStatus !== "partial" || summary.balanceCents !== 6000) {
    throw new Error(JSON.stringify(summary));
  }
});

expect("overpayment visible", () => {
  const summary = summarizeInvoiceLedger({
    totalCents: 10000,
    legacyStatus: "unpaid",
    legacyPaidAt: null,
    payments: [payment(12000)],
  });
  if (summary.lifecycleStatus !== "overpaid" || summary.overpaymentCents !== 2000 || summary.balanceCents !== 0) {
    throw new Error(JSON.stringify(summary));
  }
});

expect("void trumps payment lifecycle", () => {
  const summary = summarizeInvoiceLedger({
    totalCents: 10000,
    legacyStatus: "paid",
    legacyPaidAt: new Date(),
    payments: [payment(10000)],
    voidedAt: new Date(),
  });
  if (summary.lifecycleStatus !== "void") {
    throw new Error(JSON.stringify(summary));
  }
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("invoice-ledger-lifecycle-unit-check complete");
