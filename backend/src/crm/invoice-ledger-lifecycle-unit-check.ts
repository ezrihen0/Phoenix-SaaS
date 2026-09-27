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
    financeOrigin: "native_wizfield",
  });
  if (summary.lifecycleStatus !== "sent" || summary.balanceCents !== 10000) {
    throw new Error(JSON.stringify(summary));
  }
});

expect("native paid status without ledger does not imply paid", () => {
  const summary = summarizeInvoiceLedger({
    totalCents: 10000,
    legacyStatus: "paid",
    legacyPaidAt: new Date(),
    payments: [],
    financeOrigin: "native_wizfield",
  });
  if (summary.lifecycleStatus !== "sent" || summary.balanceCents !== 10000 || summary.paidReason !== null) {
    throw new Error(JSON.stringify(summary));
  }
});

expect("workiz historical paid status without ledger keeps migration reason", () => {
  const summary = summarizeInvoiceLedger({
    totalCents: 10000,
    legacyStatus: "paid",
    legacyPaidAt: new Date(),
    payments: [],
    financeOrigin: "workiz_historical",
  });
  if (summary.lifecycleStatus !== "paid" || summary.paidReason !== "legacy_status_migration") {
    throw new Error(JSON.stringify(summary));
  }
});

expect("partial payment", () => {
  const summary = summarizeInvoiceLedger({
    totalCents: 10000,
    legacyStatus: "unpaid",
    legacyPaidAt: null,
    payments: [payment(4000)],
    financeOrigin: "native_wizfield",
  });
  if (summary.lifecycleStatus !== "partial" || summary.balanceCents !== 6000 || summary.netPaidCents !== 4000) {
    throw new Error(JSON.stringify(summary));
  }
});

expect("paid in full", () => {
  const summary = summarizeInvoiceLedger({
    totalCents: 10000,
    legacyStatus: "unpaid",
    legacyPaidAt: null,
    payments: [payment(4000), payment(6000)],
    financeOrigin: "native_wizfield",
  });
  if (summary.lifecycleStatus !== "paid" || summary.balanceCents !== 0 || summary.paidReason !== "ledger_full_payment") {
    throw new Error(JSON.stringify(summary));
  }
});

expect("overpayment visible", () => {
  const summary = summarizeInvoiceLedger({
    totalCents: 10000,
    legacyStatus: "unpaid",
    legacyPaidAt: null,
    payments: [payment(12000)],
    financeOrigin: "native_wizfield",
  });
  if (summary.lifecycleStatus !== "overpaid" || summary.overpaymentCents !== 2000 || summary.balanceCents !== 0) {
    throw new Error(JSON.stringify(summary));
  }
});

expect("refund returns refunded lifecycle when net zero", () => {
  const summary = summarizeInvoiceLedger({
    totalCents: 10000,
    legacyStatus: "unpaid",
    legacyPaidAt: null,
    payments: [payment(5000), payment(5000, "refund")],
    financeOrigin: "native_wizfield",
  });
  if (summary.lifecycleStatus !== "refunded" || summary.netPaidCents !== 0 || summary.refundedCents !== 5000) {
    throw new Error(JSON.stringify(summary));
  }
});

expect("adjustment increases net paid", () => {
  const summary = summarizeInvoiceLedger({
    totalCents: 10000,
    legacyStatus: "unpaid",
    legacyPaidAt: null,
    payments: [payment(9000), payment(1000, "adjustment")],
    financeOrigin: "native_wizfield",
  });
  if (summary.lifecycleStatus !== "paid" || summary.netPaidCents !== 10000) {
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
    financeOrigin: "native_wizfield",
  });
  if (summary.lifecycleStatus !== "void") {
    throw new Error(JSON.stringify(summary));
  }
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("invoice-ledger-lifecycle-unit-check complete");
