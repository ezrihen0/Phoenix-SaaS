import type { WorkizPdfNormalizedInvoice } from "./workiz-invoice-pdf-normalizer";

export type PdfQualityIssue = {
  code: string;
  message: string;
  severity: "warning" | "error";
};

export type PdfQualityReport = {
  invoiceNumber: string | null;
  sourceFilename: string;
  issues: PdfQualityIssue[];
  passed: boolean;
};

const CURRENCY_TOLERANCE_CENTS = 2;

function centsDiff(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return Math.abs(a - b);
}

export function evaluatePdfExtractionQuality(normalized: WorkizPdfNormalizedInvoice): PdfQualityReport {
  const issues: PdfQualityIssue[] = [];
  const { financials, line_items, payments, extraction_meta } = normalized;

  for (const error of extraction_meta.errors) {
    issues.push({ code: error, message: error, severity: "error" });
  }

  if (!normalized.invoice_number) {
    issues.push({ code: "missing_invoice_number", message: "Invoice number missing", severity: "error" });
  }

  if (!normalized.invoice_date) {
    issues.push({ code: "malformed_invoice_date", message: "Invoice date missing or unparseable", severity: "warning" });
  }

  if (financials.total_cents != null && financials.total_cents < 0) {
    issues.push({ code: "negative_total", message: "Negative total amount", severity: "error" });
  }

  if (
    financials.subtotal_cents != null
    && financials.total_cents != null
    && financials.tax_amount_cents != null
  ) {
    const expected = financials.subtotal_cents - (financials.discount_cents ?? 0) + financials.tax_amount_cents;
    const diff = centsDiff(expected, financials.total_cents);
    if (diff != null && diff > CURRENCY_TOLERANCE_CENTS) {
      issues.push({
        code: "financial_total_mismatch",
        message: `subtotal-discount+tax (${expected}) != total (${financials.total_cents})`,
        severity: "warning",
      });
    }
  }

  if (financials.subtotal_cents != null && line_items.length > 0) {
    const lineSum = line_items.reduce((sum, item) => sum + item.amount_cents, 0);
    const diff = centsDiff(lineSum, financials.subtotal_cents);
    if (diff != null && diff > CURRENCY_TOLERANCE_CENTS) {
      issues.push({
        code: "line_items_subtotal_mismatch",
        message: `sum(line items) (${lineSum}) != subtotal (${financials.subtotal_cents})`,
        severity: "warning",
      });
    }
  }

  if (payments.length > 0 && financials.total_cents != null) {
    const paid = payments.reduce((sum, payment) => sum + payment.amount_cents, 0);
    const balance = financials.balance_due_cents ?? 0;
    const diff = centsDiff(paid + balance, financials.total_cents);
    if (diff != null && diff > CURRENCY_TOLERANCE_CENTS) {
      issues.push({
        code: "payment_balance_mismatch",
        message: `payments+balance (${paid + balance}) != total (${financials.total_cents})`,
        severity: "warning",
      });
    }
  }

  if (line_items.length === 0 && normalized.service_summary.length === 0) {
    issues.push({
      code: "unusually_empty_invoice",
      message: "No line items and no service summary extracted",
      severity: "warning",
    });
  }

  if (extraction_meta.warnings.some((warning) => warning.includes("boundary") || warning.includes("synthetic"))) {
    for (const warning of extraction_meta.warnings) {
      issues.push({ code: "parser_boundary", message: warning, severity: "warning" });
    }
  }

  return {
    invoiceNumber: normalized.invoice_number,
    sourceFilename: normalized.extraction_meta.source_filename,
    issues,
    passed: !issues.some((issue) => issue.severity === "error"),
  };
}

export function detectDuplicateInvoiceNumbers(
  extractions: WorkizPdfNormalizedInvoice[],
): Array<{ invoiceNumber: string; filenames: string[] }> {
  const byCode = new Map<string, string[]>();
  for (const extraction of extractions) {
    if (!extraction.invoice_number) continue;
    const group = byCode.get(extraction.invoice_number) ?? [];
    group.push(extraction.extraction_meta.source_filename);
    byCode.set(extraction.invoice_number, group);
  }

  return [...byCode.entries()]
    .filter(([, filenames]) => filenames.length > 1)
    .map(([invoiceNumber, filenames]) => ({ invoiceNumber, filenames }));
}
