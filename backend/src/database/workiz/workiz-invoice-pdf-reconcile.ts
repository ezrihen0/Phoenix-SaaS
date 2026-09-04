import type { PhoenixInvoiceRecord } from "./workiz-invoice-pdf-matcher";
import type { WorkizPdfNormalizedInvoice } from "./workiz-invoice-pdf-normalizer";

export type FinancialReconciliationClass = "FINANCIAL_MATCH" | "FINANCIAL_MISMATCH" | "INSUFFICIENT_DATA";

export type FinancialFieldDiff = {
  field: "subtotal" | "discount" | "tax" | "total" | "paid" | "balance";
  csvValueCents: number | null;
  pdfValueCents: number | null;
  differenceCents: number | null;
};

export type FinancialReconciliationResult = {
  sourceFilename: string;
  invoiceNumber: string | null;
  invoiceCode: string | null;
  classification: FinancialReconciliationClass;
  diffs: FinancialFieldDiff[];
  reason: string | null;
};

const TOLERANCE_CENTS = 2;

function withinTolerance(a: number | null, b: number | null): boolean | null {
  if (a == null || b == null) return null;
  return Math.abs(a - b) <= TOLERANCE_CENTS;
}

export function reconcilePdfFinancials(
  normalized: WorkizPdfNormalizedInvoice,
  matchedInvoice: PhoenixInvoiceRecord | null,
): FinancialReconciliationResult {
  const sourceFilename = normalized.extraction_meta.source_filename;
  const invoiceNumber = normalized.invoice_number;

  if (!matchedInvoice) {
    return {
      sourceFilename,
      invoiceNumber,
      invoiceCode: null,
      classification: "INSUFFICIENT_DATA",
      diffs: [],
      reason: "No matched Phoenix invoice",
    };
  }

  const pdfPaid = normalized.payments.reduce((sum, payment) => sum + payment.amount_cents, 0);
  const csvPaid = matchedInvoice.status === "paid" ? matchedInvoice.totalCents : null;
  const pdfBalance = normalized.financials.balance_due_cents;
  const csvBalance = matchedInvoice.status === "paid" ? 0 : matchedInvoice.totalCents;

  const fieldPairs: Array<{ field: FinancialFieldDiff["field"]; csv: number | null; pdf: number | null }> = [
    { field: "subtotal", csv: matchedInvoice.subtotalCents, pdf: normalized.financials.subtotal_cents },
    { field: "discount", csv: null, pdf: normalized.financials.discount_cents },
    { field: "tax", csv: matchedInvoice.taxCents, pdf: normalized.financials.tax_amount_cents },
    { field: "total", csv: matchedInvoice.totalCents, pdf: normalized.financials.total_cents },
    { field: "paid", csv: csvPaid, pdf: pdfPaid > 0 ? pdfPaid : null },
    { field: "balance", csv: csvBalance, pdf: pdfBalance },
  ];

  const diffs: FinancialFieldDiff[] = fieldPairs.map(({ field, csv, pdf }) => ({
    field,
    csvValueCents: csv,
    pdfValueCents: pdf,
    differenceCents: csv != null && pdf != null ? pdf - csv : null,
  }));

  const comparable = diffs.filter((diff) => diff.csvValueCents != null && diff.pdfValueCents != null);
  if (comparable.length === 0) {
    return {
      sourceFilename,
      invoiceNumber,
      invoiceCode: matchedInvoice.invoiceCode,
      classification: "INSUFFICIENT_DATA",
      diffs,
      reason: "No comparable financial fields between PDF and WizField invoice",
    };
  }

  const mismatches = comparable.filter((diff) => !withinTolerance(diff.csvValueCents, diff.pdfValueCents));
  if (mismatches.length > 0) {
    return {
      sourceFilename,
      invoiceNumber,
      invoiceCode: matchedInvoice.invoiceCode,
      classification: "FINANCIAL_MISMATCH",
      diffs: mismatches,
      reason: mismatches.map((diff) => `${diff.field}: csv=${diff.csvValueCents} pdf=${diff.pdfValueCents}`).join("; "),
    };
  }

  return {
    sourceFilename,
    invoiceNumber,
    invoiceCode: matchedInvoice.invoiceCode,
    classification: "FINANCIAL_MATCH",
    diffs: comparable,
    reason: null,
  };
}
