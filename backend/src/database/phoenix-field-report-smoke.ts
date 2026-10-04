import "dotenv/config";

import { computeTaxInclusiveDocumentTotals } from "../crm/money-engine.core";
import { buildEntryFinancials, computeRemainingAfterPartsCents } from "../phoenix-field-report/phoenix-field-report-financials";
import { assertWorkCompletedDateInWindow, parseMichaelReportJobPayload } from "../phoenix-field-report/phoenix-field-report-validation";

type SmokeResult = { name: string; ok: boolean; detail?: string };

const results: SmokeResult[] = [];

function pass(name: string) {
  results.push({ name, ok: true });
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
}

try {
  assertWorkCompletedDateInWindow("2026-09-11");
  assertWorkCompletedDateInWindow("2026-10-04");
  pass("date_window_boundaries");
} catch (error) {
  fail("date_window_boundaries", error instanceof Error ? error.message : String(error));
}

try {
  assertWorkCompletedDateInWindow("2026-10-05");
  fail("invalid_date_rejected", "Expected out-of-window date to throw");
} catch {
  pass("invalid_date_rejected");
}

const totals = computeTaxInclusiveDocumentTotals(10_500, 500);
if (totals.subtotalCents === 10_000 && totals.taxCents === 500) {
  pass("tax_inclusive_reconciliation");
} else {
  fail("tax_inclusive_reconciliation", `${totals.subtotalCents}+${totals.taxCents}`);
}

const partsPayload = {
  clientRowKey: "33333333-3333-4333-8333-333333333333",
  workCompletedDate: "2026-09-12",
  customerName: "Parts Test",
  serviceAddressLine1: "3 Main",
  serviceAddressLine2: null,
  serviceCity: "Calgary",
  serviceStateOrRegion: "AB",
  servicePostalCode: "T3T3T3",
  customerEmail: null,
  productLines: [{ description: "Svc", warrantyEnabled: false, warrantyMonths: null }],
  totalChargedCents: 10_500,
  companyParts: { description: "Parts", quantity: "1", costIncludingTaxCents: 2000, partsCostConfirmed: true },
  customerLeftReview: false,
  paymentMethod: "cash" as const,
  amountReceivedCents: 10_500,
  paymentDate: "2026-09-12",
  customerId: null,
  createNewCustomer: true,
};
const partsFinancials = buildEntryFinancials(partsPayload, totals.subtotalCents, totals.taxCents);
if (
  partsFinancials.partsCostIncludingTaxCents === 2000
  && partsFinancials.remainingAfterPartsCents === computeRemainingAfterPartsCents(10_500, 2000)
) {
  pass("remaining_after_parts_includes_tax_in_parts_cost");
} else {
  fail("remaining_after_parts_includes_tax_in_parts_cost", JSON.stringify(partsFinancials));
}

try {
  parseMichaelReportJobPayload(
    {
      clientRowKey: "11111111-1111-4111-8111-111111111111",
      workCompletedDate: "2026-09-15",
      customerName: "Pat",
      serviceAddressLine1: "1 Main",
      serviceCity: "Calgary",
      serviceStateOrRegion: "AB",
      servicePostalCode: "T1T1T1",
      productLines: [{ description: "Service", warrantyEnabled: false }],
      totalChargedCents: 10000,
      companyParts: { description: "None", quantity: "0", costIncludingTaxCents: 0, partsCostConfirmed: true },
      customerLeftReview: false,
      paymentMethod: "not_paid",
      amountReceivedCents: 0,
      createNewCustomer: true,
    },
    0,
  );
  pass("unpaid_job_payload");
} catch (error) {
  fail("unpaid_job_payload", error instanceof Error ? error.message : String(error));
}

try {
  parseMichaelReportJobPayload(
    {
      clientRowKey: "22222222-2222-4222-8222-222222222222",
      workCompletedDate: "2026-09-20",
      customerName: "Pat Partial",
      serviceAddressLine1: "2 Main",
      serviceCity: "Calgary",
      serviceStateOrRegion: "AB",
      servicePostalCode: "T2T2T2",
      productLines: [{ description: "Service", warrantyEnabled: true, warrantyMonths: 12 }],
      totalChargedCents: 20000,
      companyParts: { description: "Part A", quantity: "1", costIncludingTaxCents: 1500, partsCostConfirmed: true },
      customerLeftReview: true,
      paymentMethod: "cash",
      amountReceivedCents: 10000,
      paymentDate: "2026-09-20",
      createNewCustomer: true,
    },
    0,
  );
  pass("partial_paid_warranty_payload");
} catch (error) {
  fail("partial_paid_warranty_payload", error instanceof Error ? error.message : String(error));
}

const failed = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(result.ok ? "PASS" : "FAIL", result.name, result.detail ?? "");
}

if (failed.length > 0) {
  process.exitCode = 1;
} else {
  console.log("phoenix-field-report-smoke complete (logic harness; configured DB E2E is production verification)");
}
