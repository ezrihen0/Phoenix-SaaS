import { createHash } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import {
  inferServiceType,
  normalizeEmail,
  parseWorkizInvoiceText,
} from "./workiz-invoice-parser";
import { reconcileWorkizHistoricalFinancials } from "./workiz-historical-financial.v1";
import {
  pickCanonicalDuplicateExportFilename,
} from "./workiz-historical-identity.v1";
import {
  applyWarrantyReviewFlags,
  buildServiceIntelligence,
  buildWarrantyEvidenceFromCorpus,
  enrichLineStructuredFields,
  reconstructWarranty,
} from "./workiz-historical-service-warranty.v1";
import {
  WORKIZ_HISTORICAL_PARSER_VERSION,
  type WorkizHistoricalParseCandidate,
} from "./workiz-historical-types.v1";

const pdf = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

const DEFAULT_SOURCE_DIRECTORY =
  "C:\\Users\\edenz\\OneDrive\\שולחן העבודה\\Business\\Workiz\\INVOICES PDF";

function normalizePhoneDigits(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return null;
}

function normalizeWords(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function getWorkizHistoricalSourceDirectory(): string {
  return process.env.WORKIZ_INVOICE_PDF_SOURCE_DIR ?? DEFAULT_SOURCE_DIRECTORY;
}

export type DuplicateInvoiceGroup = { invoiceNumber: string; filenames: string[] };

export function buildDuplicateInvoiceGroups(candidates: WorkizHistoricalParseCandidate[]): DuplicateInvoiceGroup[] {
  const byInvoice = new Map<string, string[]>();
  for (const candidate of candidates) {
    const invoiceNumber = candidate.invoice?.workiz_invoice_number;
    if (!invoiceNumber) continue;
    const group = byInvoice.get(invoiceNumber) ?? [];
    group.push(candidate.source.filename);
    byInvoice.set(invoiceNumber, group);
  }
  return [...byInvoice.entries()]
    .filter(([, filenames]) => filenames.length > 1)
    .map(([invoiceNumber, filenames]) => ({ invoiceNumber, filenames: filenames.sort() }))
    .sort((left, right) => left.invoiceNumber.localeCompare(right.invoiceNumber));
}

export function markCanonicalDuplicateExports(
  candidates: WorkizHistoricalParseCandidate[],
  duplicateGroups: DuplicateInvoiceGroup[],
): void {
  const canonicalByInvoice = new Map<string, string>();
  for (const group of duplicateGroups) {
    canonicalByInvoice.set(group.invoiceNumber, pickCanonicalDuplicateExportFilename(group.filenames));
  }

  for (const candidate of candidates) {
    const invoiceNumber = candidate.invoice?.workiz_invoice_number;
    if (!invoiceNumber) continue;
    const canonical = canonicalByInvoice.get(invoiceNumber);
    if (!canonical) {
      candidate.source.is_canonical_for_invoice = true;
      continue;
    }
    const siblings = duplicateGroups.find((group) => group.invoiceNumber === invoiceNumber)?.filenames ?? [];
    candidate.source.duplicate_export_siblings = siblings.filter((filename) => filename !== canonical);
    candidate.source.is_canonical_for_invoice = candidate.source.filename === canonical;
    if (!candidate.source.is_canonical_for_invoice) {
      candidate.review_flags.push("DUPLICATE_EXPORT_NON_CANONICAL");
    }
  }
}

export async function parseWorkizHistoricalPdf(input: {
  sourceDirectory: string;
  filename: string;
  importBatchId: string;
}): Promise<WorkizHistoricalParseCandidate> {
  const sourcePath = join(input.sourceDirectory, input.filename);
  const buffer = readFileSync(sourcePath);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const extracted = await pdf(buffer);
  const parsed = parseWorkizInvoiceText({
    text: extracted.text,
    sourceFile: input.filename,
    sourcePath,
  });

  const customer = parsed.customer
    ? {
        name: parsed.customer.name,
        company: parsed.customer.company,
        email: parsed.customer.email,
        normalized_email: normalizeEmail(parsed.customer.email),
        phone: parsed.customer.phone,
        normalized_phone: normalizePhoneDigits(parsed.customer.phone),
        address_line_1: parsed.customer.addressLine1,
        address_line_2: parsed.customer.addressLine2,
        city: parsed.customer.city,
        province: parsed.customer.province,
        postal_code: parsed.customer.postalCode,
        normalized_city: normalizeWords(parsed.customer.city),
      }
    : null;

  const invoice = parsed.invoiceCode
    ? {
        workiz_invoice_number: parsed.invoiceCode,
        invoice_date: dateOnly(parsed.invoiceDate),
        due_date: dateOnly(parsed.dueDate),
        subtotal_cents: parsed.subtotalCents,
        discount_cents: parsed.discountCents,
        tax_cents: parsed.taxCents,
        tax_rate_bps: parsed.taxRateBps,
        total_cents: parsed.totalCents,
        balance_due_cents: parsed.balanceDueCents,
        original_source_system: "WORKIZ" as const,
      }
    : null;

  const invoiceLines = enrichLineStructuredFields(
    parsed.lineItems.map((line) => ({
      raw_description: line.description,
      quantity: line.quantity,
      unit_price_cents: line.unitPriceCents,
      amount_cents: line.amountCents,
      structured: {
        system: null,
        component: null,
        work_action: null,
        is_labor: false,
      },
    })),
  );

  const payments = parsed.payments.map((payment) => ({
    occurred_at: dateOnly(payment.occurredAt),
    amount_cents: payment.amountCents,
    method_label: payment.methodLabel,
    status_label: payment.statusLabel,
    source_wording: payment.rawDateLines,
  }));

  const warrantyEvidence = buildWarrantyEvidenceFromCorpus([
    ...invoiceLines.map((line, source_line_index) => ({
      text: line.raw_description,
      source_location: "INVOICE_LINE" as const,
      source_line_index,
    })),
    { text: parsed.warrantySection ?? "", source_location: "WARRANTY_SECTION", source_line_index: null },
    { text: parsed.notes ?? "", source_location: "NOTES", source_line_index: null },
    { text: parsed.terms ?? "", source_location: "TERMS", source_line_index: null },
  ]);

  const serviceCategory = parsed.lineItems[0]
    ? inferServiceType(parsed.lineItems[0].description)
    : null;

  const candidate: WorkizHistoricalParseCandidate = {
    source: {
      filename: input.filename,
      source_path: sourcePath,
      sha256,
      bytes: buffer.length,
      workiz_file_number: parsed.workizFileNumber,
      parser_version: WORKIZ_HISTORICAL_PARSER_VERSION,
      import_batch_id: input.importBatchId,
      is_canonical_for_invoice: true,
      duplicate_export_siblings: [],
    },
    customer,
    job: {
      service_date: dateOnly(parsed.invoiceDate),
      completion_date: dateOnly(parsed.invoiceDate),
      service_category: serviceCategory,
      system: null,
      work_performed_raw: invoiceLines.map((line) => line.raw_description),
      historical_notes: parsed.notes,
      related_invoice_number: parsed.invoiceCode,
    },
    invoice,
    invoice_lines: invoiceLines,
    payments,
    warranty_evidence: warrantyEvidence,
    service_intelligence: {
      system: null,
      primary_service: null,
      service_detail: null,
      component: null,
      work_action: null,
      labor: false,
      findings: [],
      raw_evidence: [],
    },
    warranty_reconstruction: null,
    confidence: parsed.parseErrors.length > 0 ? "LOW" : parsed.parseWarnings.length > 0 ? "MEDIUM" : "HIGH",
    review_flags: [...parsed.parseErrors, ...parsed.parseWarnings],
    financial_gate: "MANUAL_REVIEW",
    financial_reasons: [],
    identity: { cluster_id: null, classification: null },
  };

  const financial = reconcileWorkizHistoricalFinancials({
    subtotalCents: parsed.subtotalCents,
    discountCents: parsed.discountCents,
    taxCents: parsed.taxCents,
    totalCents: parsed.totalCents,
    balanceCents: parsed.balanceDueCents,
    paymentTotalCents: payments.reduce((sum, payment) => sum + payment.amount_cents, 0),
    parseWarnings: parsed.parseWarnings,
  });
  candidate.financial_gate = financial.status;
  candidate.financial_reasons = financial.reasons;
  if (financial.status === "MANUAL_REVIEW") {
    candidate.review_flags.push("FINANCIAL_MANUAL_REVIEW");
  }

  candidate.service_intelligence = buildServiceIntelligence(candidate);
  candidate.job.system = candidate.service_intelligence.system;
  candidate.warranty_reconstruction = reconstructWarranty(candidate);
  applyWarrantyReviewFlags(candidate);

  return candidate;
}

export async function parseAllWorkizHistoricalPdfs(input?: {
  sourceDirectory?: string;
  importBatchId?: string;
}): Promise<WorkizHistoricalParseCandidate[]> {
  const sourceDirectory = input?.sourceDirectory ?? getWorkizHistoricalSourceDirectory();
  const importBatchId = input?.importBatchId ?? `workiz-preprod-${new Date().toISOString().slice(0, 10)}`;
  const filenames = readdirSync(sourceDirectory)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort((left, right) => left.localeCompare(right));

  const candidates: WorkizHistoricalParseCandidate[] = [];
  for (const filename of filenames) {
    candidates.push(await parseWorkizHistoricalPdf({ sourceDirectory, filename, importBatchId }));
  }

  const duplicateGroups = buildDuplicateInvoiceGroups(candidates);
  markCanonicalDuplicateExports(candidates, duplicateGroups);
  return candidates;
}
