import { createHash } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { normalizeEmail, parseMoneyToCents } from "./workiz-invoice-parser";

export const WORKIZ_INVOICE_CSV_HEADER = [
  "Invoice NO.",
  "Invoice Name",
  "Client",
  "Email Address",
  "Created",
  "Subtotal",
  "Discount",
  "Tax",
  "Total Amount",
  "Amount Due",
  "Status",
  "Job",
  "Job name",
] as const;

export type ParsedDiscount =
  | { kind: "none"; discountCents: 0 }
  | { kind: "amount"; discountCents: number; rawValue: string }
  | { kind: "percent"; discountPercent: number; discountCents: number; rawValue: string }
  | { kind: "invalid"; rawValue: string };

export type WorkizInvoiceCsvRow = {
  rowNumber: number;
  sourceFile: string;
  invoiceCode: string;
  invoiceName: string | null;
  clientName: string;
  email: string | null;
  createdAt: Date | null;
  subtotalCents: number | null;
  discount: ParsedDiscount;
  taxCents: number | null;
  totalCents: number | null;
  amountDueCents: number | null;
  statusRaw: string;
  jobCode: string | null;
  jobName: string | null;
  statusCategory: "paid" | "unpaid" | "no_amount";
  paidAtHint: Date | null;
  amountPaidCents: number | null;
};

export type FinancialValidation = {
  expectedTotalCents: number | null;
  financialMismatch: boolean;
  mismatchReason: string | null;
  invalidTotal: boolean;
  invalidDue: boolean;
  dueExceedsTotal: boolean;
  statusPaymentInconsistent: boolean;
};

export type ParsedWorkizInvoiceSource = {
  sourceDirectory: string;
  filesDiscovered: number;
  uniqueFiles: number;
  skippedDuplicateFiles: string[];
  sourceFile: string;
  rows: WorkizInvoiceCsvRow[];
  schemaErrors: string[];
  duplicateInvoiceCodes: string[];
};

export function parseWorkizInvoiceCreatedDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const parsed = Date.parse(cleaned);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

export function parseDiscountField(raw: string | null | undefined, subtotalCents: number | null): ParsedDiscount {
  const cleaned = (raw ?? "").trim().replace(/^'+|'+$/g, "");
  if (!cleaned) {
    return { kind: "none", discountCents: 0 };
  }

  if (cleaned.endsWith("%")) {
    const percent = Number(cleaned.slice(0, -1));
    if (!Number.isFinite(percent) || subtotalCents == null) {
      return { kind: "invalid", rawValue: cleaned };
    }
    const discountCents = Math.round(subtotalCents * (percent / 100));
    return { kind: "percent", discountPercent: percent, discountCents, rawValue: cleaned };
  }

  const amountCents = parseMoneyToCents(cleaned);
  if (amountCents == null) {
    return { kind: "invalid", rawValue: cleaned };
  }

  return { kind: "amount", discountCents: amountCents, rawValue: cleaned };
}

export function parseInvoiceStatus(raw: string): {
  statusCategory: "paid" | "unpaid" | "no_amount";
  paidAtHint: Date | null;
} {
  const normalized = raw.trim().toLowerCase();
  if (normalized.startsWith("no amount")) {
    return { statusCategory: "no_amount", paidAtHint: null };
  }

  const sentMatch = raw.match(/sent on\s+(.+)$/i);
  const paidAtHint = sentMatch ? parseWorkizInvoiceCreatedDate(sentMatch[1]) : null;

  if (normalized.includes("paid")) {
    return { statusCategory: "paid", paidAtHint };
  }

  return { statusCategory: "unpaid", paidAtHint };
}

export function getDiscountCents(discount: ParsedDiscount): number {
  if (discount.kind === "none") return 0;
  if (discount.kind === "invalid") return 0;
  return discount.discountCents;
}

export function validateInvoiceFinancials(row: WorkizInvoiceCsvRow): FinancialValidation {
  const discountCents = getDiscountCents(row.discount);
  const invalidTotal = row.totalCents != null && row.totalCents < 0;
  const invalidDue = row.amountDueCents != null && row.amountDueCents < 0;
  const dueExceedsTotal = row.totalCents != null
    && row.amountDueCents != null
    && row.amountDueCents > row.totalCents;

  let expectedTotalCents: number | null = null;
  let financialMismatch = false;
  let mismatchReason: string | null = null;

  if (row.subtotalCents != null && row.taxCents != null && row.totalCents != null) {
    expectedTotalCents = row.subtotalCents - discountCents + row.taxCents;
    if (expectedTotalCents !== row.totalCents) {
      financialMismatch = true;
      mismatchReason = `subtotal(${row.subtotalCents}) - discount(${discountCents}) + tax(${row.taxCents}) = ${expectedTotalCents}, source total ${row.totalCents}`;
    }
  } else if (row.totalCents == null) {
    financialMismatch = true;
    mismatchReason = "missing total amount";
  }

  const amountPaidCents = row.totalCents != null && row.amountDueCents != null
    ? row.totalCents - row.amountDueCents
    : null;

  const statusPaymentInconsistent = row.totalCents != null
    && row.totalCents > 0
    && row.amountDueCents != null
    && (
      (row.amountDueCents === 0 && row.statusCategory === "unpaid")
      || (row.amountDueCents > 0 && row.statusCategory === "paid")
    );

  return {
    expectedTotalCents,
    financialMismatch,
    mismatchReason,
    invalidTotal,
    invalidDue,
    dueExceedsTotal,
    statusPaymentInconsistent,
  };
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

function parseCsvContent(content: string, sourceFile: string): {
  rows: WorkizInvoiceCsvRow[];
  schemaErrors: string[];
  duplicateInvoiceCodes: string[];
} {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const schemaErrors: string[] = [];

  if (lines.length === 0) {
    schemaErrors.push(`${sourceFile}: empty file`);
    return { rows: [], schemaErrors, duplicateInvoiceCodes: [] };
  }

  const headerFields = parseCsvLine(lines[0]).map((field) => field.trim());
  const expectedHeader = [...WORKIZ_INVOICE_CSV_HEADER];
  const headerMatches = expectedHeader.every((column, index) => headerFields[index] === column);

  if (!headerMatches) {
    schemaErrors.push(
      `${sourceFile}: unexpected header ${JSON.stringify(headerFields)}; expected ${JSON.stringify(expectedHeader)}`,
    );
    return { rows: [], schemaErrors, duplicateInvoiceCodes: [] };
  }

  const rows: WorkizInvoiceCsvRow[] = [];
  const seenInvoiceCodes = new Map<string, number>();
  const duplicateInvoiceCodes: string[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const fields = parseCsvLine(lines[lineIndex]);
    if (fields.length < expectedHeader.length) {
      schemaErrors.push(`${sourceFile}: row ${lineIndex + 1} has ${fields.length} columns`);
      continue;
    }

    const [
      invoiceCodeRaw,
      invoiceNameRaw,
      clientRaw,
      emailRaw,
      createdRaw,
      subtotalRaw,
      discountRaw,
      taxRaw,
      totalRaw,
      amountDueRaw,
      statusRaw,
      jobRaw,
      jobNameRaw,
    ] = fields;

    const invoiceCode = (invoiceCodeRaw ?? "").trim();
    if (!invoiceCode) {
      schemaErrors.push(`${sourceFile}: row ${lineIndex + 1} missing invoice code`);
      continue;
    }

    if (seenInvoiceCodes.has(invoiceCode)) {
      duplicateInvoiceCodes.push(invoiceCode);
      continue;
    }
    seenInvoiceCodes.set(invoiceCode, lineIndex + 1);

    const subtotalCents = parseMoneyToCents((subtotalRaw ?? "").trim());
    const discount = parseDiscountField(discountRaw, subtotalCents);
    const taxCents = parseMoneyToCents((taxRaw ?? "").trim());
    const totalCents = parseMoneyToCents((totalRaw ?? "").trim());
    const amountDueCents = parseMoneyToCents((amountDueRaw ?? "").trim());
    const status = parseInvoiceStatus(statusRaw ?? "");
    const amountPaidCents = totalCents != null && amountDueCents != null
      ? totalCents - amountDueCents
      : null;

    rows.push({
      rowNumber: lineIndex + 1,
      sourceFile,
      invoiceCode,
      invoiceName: (invoiceNameRaw ?? "").trim() || null,
      clientName: (clientRaw ?? "").trim(),
      email: normalizeEmail(emailRaw),
      createdAt: parseWorkizInvoiceCreatedDate(createdRaw),
      subtotalCents,
      discount,
      taxCents,
      totalCents,
      amountDueCents,
      statusRaw: (statusRaw ?? "").trim(),
      jobCode: (jobRaw ?? "").trim() || null,
      jobName: (jobNameRaw ?? "").trim() || null,
      statusCategory: status.statusCategory,
      paidAtHint: status.paidAtHint,
      amountPaidCents,
    });
  }

  return { rows, schemaErrors, duplicateInvoiceCodes };
}

export function loadUniqueWorkizInvoiceCsv(sourceDirectory: string): ParsedWorkizInvoiceSource {
  const csvFiles = readdirSync(sourceDirectory)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .sort();

  const hashToFile = new Map<string, string>();
  const skippedDuplicateFiles: string[] = [];

  for (const file of csvFiles) {
    const fullPath = join(sourceDirectory, file);
    const hash = createHash("sha256").update(readFileSync(fullPath)).digest("hex");
    if (hashToFile.has(hash)) {
      skippedDuplicateFiles.push(file);
      continue;
    }
    hashToFile.set(hash, file);
  }

  const uniqueFiles = Array.from(hashToFile.values());
  if (uniqueFiles.length === 0) {
    return {
      sourceDirectory,
      filesDiscovered: csvFiles.length,
      uniqueFiles: 0,
      skippedDuplicateFiles,
      sourceFile: "",
      rows: [],
      schemaErrors: ["No CSV files found in source directory."],
      duplicateInvoiceCodes: [],
    };
  }

  const sourceFile = uniqueFiles[0];
  const parsed = parseCsvContent(readFileSync(join(sourceDirectory, sourceFile), "utf8"), sourceFile);

  return {
    sourceDirectory,
    filesDiscovered: csvFiles.length,
    uniqueFiles: uniqueFiles.length,
    skippedDuplicateFiles,
    sourceFile,
    rows: parsed.rows,
    schemaErrors: parsed.schemaErrors,
    duplicateInvoiceCodes: parsed.duplicateInvoiceCodes,
  };
}

export function deriveInvoicePaidStatus(row: WorkizInvoiceCsvRow): boolean {
  if (row.totalCents == null || row.totalCents <= 0) {
    return row.statusCategory === "paid" || row.statusCategory === "no_amount";
  }
  if (row.amountDueCents != null) {
    return row.amountDueCents <= 0;
  }
  return row.statusCategory === "paid";
}

export function deriveTaxRateBps(row: WorkizInvoiceCsvRow): number {
  if (row.subtotalCents == null || row.subtotalCents <= 0 || row.taxCents == null) {
    return 0;
  }
  const discountCents = getDiscountCents(row.discount);
  const taxableBase = row.subtotalCents - discountCents;
  if (taxableBase <= 0) return 0;
  return Math.round((row.taxCents / taxableBase) * 10000);
}
