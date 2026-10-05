import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

import { isoDateKeyFromUtcInstant } from "../../integrations/phoenix/phoenix-scheduling-timezone";
import {
  hasValidPostalCode,
  normalizeName,
  normalizePhoneDigits,
  parseWorkizCsvAddress,
  parseWorkizCreatedDate,
} from "../workiz/workiz-customer-csv-parser";
import { normalizeEmail, normalizePhone, parseMoneyToCents } from "../workiz/workiz-invoice-parser";

export const DEFAULT_JOBBER_EXPORT_DIR = join(process.cwd(), "..", "data", "jobber-export");

export const JOBBER_CLIENTS_FILENAME = "clients-contact-info.csv";
export const JOBBER_VISITS_FILENAME = "visits-schedule.csv";
export const JOBBER_INVOICES_FILENAME = "invoices.csv";

export type JobberClientRow = {
  rowNumber: number;
  contactName: string;
  companyName: string | null;
  phone: string | null;
  phoneDigits: string | null;
  email: string | null;
  billingAddressRaw: string;
  addressLine1: string;
  serviceCity: string;
  serviceStateOrRegion: string | null;
  servicePostalCode: string;
  legacyCreatedAt: Date | null;
  leadSourceRaw: string | null;
  externalClientNumber: string;
};

export type JobberVisitRow = {
  rowNumber: number;
  visitDate: Date | null;
  visitIsoDate: string | null;
  timesRaw: string | null;
  completed: boolean;
  clientName: string;
  addressLine1: string;
  serviceCity: string;
  serviceStateOrRegion: string | null;
  servicePostalCode: string;
  jobRef: string | null;
  jobDetailsRaw: string | null;
  lineItems: string | null;
  durationHours: number | null;
  phone: string | null;
  phoneDigits: string | null;
  email: string | null;
  visitKey: string;
};

export type JobberInvoiceRow = {
  rowNumber: number;
  clientName: string;
  jobRef: string | null;
  createdAt: Date | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  markedPaidAt: Date | null;
  invoiceNumber: string;
  subject: string | null;
  statusRaw: string;
  totalCents: number | null;
  balanceCents: number | null;
  taxRateBps: number;
  discountCents: number;
  taxCents: number;
  billingAddressLine1: string;
  billingCity: string;
  billingProvince: string | null;
  billingPostalCode: string;
  phone: string | null;
  phoneDigits: string | null;
  email: string | null;
};

export type JobberContactEnrichmentIndex = Map<string, { phone: string | null; phoneDigits: string | null }>;

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

function readCsvRows(filePath: string): string[][] {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line) => parseCsvLine(line));
}

function parseJobRef(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const match = raw.match(/#(\d+)/);
  if (match) return `#${match[1]}`;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function visitIsoDateFromDate(date: Date | null): string | null {
  if (!date) return null;
  return isoDateKeyFromUtcInstant(date, "ON");
}

export function buildJobberExternalClientNumber(input: {
  email: string | null;
  contactName: string;
  servicePostalCode: string;
}): string {
  if (input.email) {
    return `jobber:email:${input.email}`;
  }
  const postal = input.servicePostalCode.trim().toUpperCase();
  const nameKey = normalizeName(input.contactName) || "unknown";
  const digest = createHash("sha256").update(`${nameKey}::${postal}`).digest("hex").slice(0, 12);
  return `jobber:contact:${digest}`;
}

export function buildEmailOnlyPlaceholderPhone(email: string): string {
  const digest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  const suffix = String(parseInt(digest.slice(0, 8), 16) % 10000).padStart(4, "0");
  return normalizePhone(`613555${suffix}`);
}

function buildEnrichmentIndexFromVisitsAndInvoices(
  visits: JobberVisitRow[],
  invoices: JobberInvoiceRow[],
): JobberContactEnrichmentIndex {
  const index: JobberContactEnrichmentIndex = new Map();

  const consider = (email: string | null, phoneRaw: string | null) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return;
    const phoneDigits = normalizePhoneDigits(phoneRaw);
    if (!phoneDigits) return;
    const existing = index.get(normalizedEmail);
    if (!existing?.phoneDigits) {
      index.set(normalizedEmail, {
        phone: normalizePhone(phoneDigits),
        phoneDigits,
      });
    }
  };

  for (const visit of visits) {
    consider(visit.email, visit.phone);
  }
  for (const invoice of invoices) {
    consider(invoice.email, invoice.phone);
  }

  return index;
}

function parseTaxRateBps(raw: string | null | undefined): number {
  if (!raw?.trim()) return 0;
  const match = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return 0;
  return Math.round(Number.parseFloat(match[1]) * 100);
}

function parseCompletedFlag(raw: string | null | undefined): boolean {
  const normalized = (raw ?? "").trim().toLowerCase();
  return normalized === "yes" || normalized === "y" || normalized === "true" || normalized === "1";
}

export function loadJobberClientsCsv(
  exportDir: string,
  enrichmentIndex?: JobberContactEnrichmentIndex,
): { rows: JobberClientRow[]; schemaErrors: string[] } {
  const filePath = join(exportDir, JOBBER_CLIENTS_FILENAME);
  const schemaErrors: string[] = [];
  let table: string[][];
  try {
    table = readCsvRows(filePath);
  } catch (error) {
    schemaErrors.push(`${JOBBER_CLIENTS_FILENAME}: ${error instanceof Error ? error.message : String(error)}`);
    return { rows: [], schemaErrors };
  }

  if (table.length < 2) {
    schemaErrors.push(`${JOBBER_CLIENTS_FILENAME}: missing data rows`);
    return { rows: [], schemaErrors };
  }

  const header = table[0].map((cell) => cell.trim());
  const expectedPrefix = ["Contact", "Company", "Lead"];
  if (!expectedPrefix.every((column, index) => header[index]?.startsWith(column) || header[index] === column)) {
    schemaErrors.push(`${JOBBER_CLIENTS_FILENAME}: unexpected header ${JSON.stringify(header)}`);
  }

  const rows: JobberClientRow[] = [];
  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    const fields = table[rowIndex];
    const contactName = (fields[0] ?? "").trim();
    if (!contactName) continue;

    const companyName = (fields[1] ?? "").trim() || null;
    let phoneRaw = (fields[3] ?? "").trim();
    const email = normalizeEmail(fields[4]);
    const billingAddressRaw = (fields[5] ?? "").trim();
    const createdRaw = fields[6];
    const leadSourceRaw = (fields[7] ?? "").trim() || null;

    if (!phoneRaw && email && enrichmentIndex?.has(email)) {
      phoneRaw = enrichmentIndex.get(email)?.phone ?? "";
    }

    let phoneDigits = normalizePhoneDigits(phoneRaw);
    let phone = phoneDigits ? normalizePhone(phoneDigits) : null;
    if (!phoneDigits && email) {
      phone = buildEmailOnlyPlaceholderPhone(email);
      phoneDigits = normalizePhoneDigits(phone);
    }

    const addressParts = parseWorkizCsvAddress(billingAddressRaw);
    const externalClientNumber = buildJobberExternalClientNumber({
      email,
      contactName,
      servicePostalCode: addressParts.servicePostalCode,
    });

    rows.push({
      rowNumber: rowIndex + 1,
      contactName,
      companyName,
      phone,
      phoneDigits,
      email,
      billingAddressRaw,
      addressLine1: addressParts.addressLine1 || billingAddressRaw,
      serviceCity: addressParts.serviceCity,
      serviceStateOrRegion: addressParts.serviceStateOrRegion,
      servicePostalCode: addressParts.servicePostalCode,
      legacyCreatedAt: parseWorkizCreatedDate(createdRaw),
      leadSourceRaw,
      externalClientNumber,
    });
  }

  return { rows, schemaErrors };
}

export function loadJobberVisitsCsv(exportDir: string): { rows: JobberVisitRow[]; schemaErrors: string[] } {
  const filePath = join(exportDir, JOBBER_VISITS_FILENAME);
  const schemaErrors: string[] = [];
  let table: string[][];
  try {
    table = readCsvRows(filePath);
  } catch (error) {
    schemaErrors.push(`${JOBBER_VISITS_FILENAME}: ${error instanceof Error ? error.message : String(error)}`);
    return { rows: [], schemaErrors };
  }

  if (table.length < 2) {
    schemaErrors.push(`${JOBBER_VISITS_FILENAME}: missing data rows`);
    return { rows: [], schemaErrors };
  }

  const rows: JobberVisitRow[] = [];
  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    const fields = table[rowIndex];
    const visitDate = parseWorkizCreatedDate(fields[0]);
    const visitIsoDate = visitIsoDateFromDate(visitDate);
    const timesRaw = (fields[1] ?? "").trim() || null;
    const completed = parseCompletedFlag(fields[2]);
    const clientName = (fields[3] ?? "").trim();
    const addressLine1 = (fields[4] ?? "").trim();
    const serviceCity = (fields[5] ?? "").trim();
    const serviceStateOrRegion = (fields[6] ?? "").trim() || null;
    const servicePostalCode = (fields[7] ?? "").trim().toUpperCase();
    const jobDetailsRaw = (fields[9] ?? "").trim() || null;
    const jobRef = parseJobRef(jobDetailsRaw);
    const lineItems = (fields[10] ?? "").trim() || null;
    const durationRaw = (fields[11] ?? "").trim();
    const durationHours = durationRaw ? Number.parseFloat(durationRaw) : null;
    const phoneRaw = (fields[14] ?? "").trim();
    const phoneDigits = normalizePhoneDigits(phoneRaw);
    const phone = phoneDigits ? normalizePhone(phoneDigits) : null;
    const email = normalizeEmail(fields[15]);

    const clientKey = email ?? normalizeName(clientName);
    const visitKey = `jobber_visit:${visitIsoDate ?? "unknown"}:${clientKey}:${jobRef ?? rowIndex}`;

    rows.push({
      rowNumber: rowIndex + 1,
      visitDate,
      visitIsoDate,
      timesRaw,
      completed,
      clientName,
      addressLine1,
      serviceCity,
      serviceStateOrRegion,
      servicePostalCode,
      jobRef,
      jobDetailsRaw,
      lineItems,
      durationHours: Number.isFinite(durationHours) ? durationHours : null,
      phone,
      phoneDigits,
      email,
      visitKey,
    });
  }

  return { rows, schemaErrors };
}

export function loadJobberInvoicesCsv(exportDir: string): { rows: JobberInvoiceRow[]; schemaErrors: string[] } {
  const filePath = join(exportDir, JOBBER_INVOICES_FILENAME);
  const schemaErrors: string[] = [];
  let table: string[][];
  try {
    table = readCsvRows(filePath);
  } catch (error) {
    schemaErrors.push(`${JOBBER_INVOICES_FILENAME}: ${error instanceof Error ? error.message : String(error)}`);
    return { rows: [], schemaErrors };
  }

  let headerRowIndex = table.findIndex((row) => (row[0] ?? "").trim() === "Client name");
  if (headerRowIndex < 0) {
    schemaErrors.push(`${JOBBER_INVOICES_FILENAME}: could not locate invoice header row`);
    return { rows: [], schemaErrors };
  }

  const rows: JobberInvoiceRow[] = [];
  for (let rowIndex = headerRowIndex + 1; rowIndex < table.length; rowIndex += 1) {
    const fields = table[rowIndex];
    const clientName = (fields[0] ?? "").trim();
    if (!clientName) continue;

    const jobRef = parseJobRef(fields[1]);
    const createdAt = parseWorkizCreatedDate(fields[3]);
    const issuedAt = parseWorkizCreatedDate(fields[4]);
    const dueAt = parseWorkizCreatedDate(fields[5]);
    const markedPaidAt = parseWorkizCreatedDate(fields[6]);
    const invoiceNumber = (fields[7] ?? "").trim();
    if (!invoiceNumber) {
      continue;
    }

    const subject = (fields[8] ?? "").trim() || null;
    const statusRaw = (fields[9] ?? "").trim();
    const totalCents = parseMoneyToCents(fields[10]);
    const balanceCents = parseMoneyToCents(fields[11]);
    const taxRateBps = parseTaxRateBps(fields[12]);
    const discountCents = parseMoneyToCents(fields[14]) ?? 0;
    const taxCents = parseMoneyToCents(fields[15]) ?? 0;
    const billingAddressLine1 = (fields[16] ?? "").trim();
    const billingCity = (fields[17] ?? "").trim();
    const billingProvince = (fields[18] ?? "").trim() || null;
    const billingPostalCode = (fields[19] ?? "").trim().toUpperCase();
    const phoneRaw = (fields[20] ?? "").trim();
    const phoneDigits = normalizePhoneDigits(phoneRaw);
    const phone = phoneDigits ? normalizePhone(phoneDigits) : null;
    const email = normalizeEmail(fields[21]);

    rows.push({
      rowNumber: rowIndex + 1,
      clientName,
      jobRef,
      createdAt,
      issuedAt,
      dueAt,
      markedPaidAt,
      invoiceNumber,
      subject,
      statusRaw,
      totalCents,
      balanceCents,
      taxRateBps,
      discountCents,
      taxCents,
      billingAddressLine1,
      billingCity,
      billingProvince,
      billingPostalCode,
      phone,
      phoneDigits,
      email,
    });
  }

  return { rows, schemaErrors };
}

export function loadJobberExportBundle(exportDir: string = DEFAULT_JOBBER_EXPORT_DIR) {
  const visitsParsed = loadJobberVisitsCsv(exportDir);
  const invoicesParsed = loadJobberInvoicesCsv(exportDir);
  const enrichmentIndex = buildEnrichmentIndexFromVisitsAndInvoices(visitsParsed.rows, invoicesParsed.rows);
  const clientsParsed = loadJobberClientsCsv(exportDir, enrichmentIndex);

  return {
    exportDir,
    clients: clientsParsed,
    visits: visitsParsed,
    invoices: invoicesParsed,
    enrichmentIndex,
  };
}

export { hasValidPostalCode, normalizeName, normalizePhoneDigits };
