import type { DataSource } from "typeorm";

import { CustomerEntity } from "../entities/customer.entity";
import { InvoiceEntity } from "../entities/invoice.entity";
import { JobEntity } from "../entities/job.entity";
import { normalizeName } from "./workiz-customer-csv-parser";
import { normalizeEmail, normalizePhone } from "./workiz-invoice-parser";
import type { WorkizPdfNormalizedInvoice } from "./workiz-invoice-pdf-normalizer";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "./workiz-invoice-upsert";

export type PdfMatchClass = "EXACT_MATCH" | "HIGH_CONFIDENCE_MATCH" | "AMBIGUOUS" | "UNMATCHED";

export type PhoenixInvoiceRecord = {
  invoiceId: string;
  jobId: string;
  invoiceCode: string;
  issuedAt: Date | null;
  totalCents: number;
  subtotalCents: number;
  taxCents: number;
  status: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerStreet: string | null;
  customerPostalCode: string | null;
  sourceKind: string | null;
  enrichmentStatus: string | null;
  alreadyEnriched: boolean;
};

export type PdfInvoiceMatchResult = {
  sourceFilename: string;
  invoiceNumber: string | null;
  matchClass: PdfMatchClass;
  matchReason: string;
  matchedInvoice: PhoenixInvoiceRecord | null;
  candidateCount: number;
  alreadyEnriched: boolean;
};

export type CustomerFieldCheck = {
  field: "phone" | "email" | "name" | "address";
  pdfValue: string | null;
  wizfieldValue: string | null;
  conflict: boolean;
};

export type CustomerCrossCheckResult = {
  outcome: "CUSTOMER_MATCH" | "CUSTOMER_CONFLICT" | "INSUFFICIENT_DATA";
  fields: CustomerFieldCheck[];
  conflictFields: string[];
};

function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalizePostal(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

function normalizeStreet(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseSnapshot(invoice: InvoiceEntity): {
  sourceKind: string | null;
  enrichmentStatus: string | null;
  workizInvoiceCode: string | null;
} {
  if (!invoice.branding_snapshot_json) {
    return { sourceKind: null, enrichmentStatus: null, workizInvoiceCode: null };
  }
  try {
    const snapshot = JSON.parse(invoice.branding_snapshot_json) as {
      import_source?: string;
      source_kind?: string;
      enrichment_status?: string;
      workiz_invoice_code?: string;
    };
    if (snapshot.import_source !== WORKIZ_HISTORICAL_IMPORT_SOURCE) {
      return { sourceKind: null, enrichmentStatus: null, workizInvoiceCode: null };
    }
    return {
      sourceKind: snapshot.source_kind ?? null,
      enrichmentStatus: snapshot.enrichment_status ?? null,
      workizInvoiceCode: snapshot.workiz_invoice_code ?? null,
    };
  } catch {
    return { sourceKind: null, enrichmentStatus: null, workizInvoiceCode: null };
  }
}

function sameDay(a: Date | null, bIso: string | null): boolean {
  if (!a || !bIso) return false;
  const b = new Date(bIso);
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

export async function loadPhoenixInvoiceRecords(
  dataSource: DataSource,
  organizationId: string,
): Promise<PhoenixInvoiceRecord[]> {
  const invoices = await dataSource.getRepository(InvoiceEntity).find({
    where: { organization_id: organizationId },
  });
  const jobs = await dataSource.getRepository(JobEntity).find({
    where: { organization_id: organizationId },
  });
  const customers = await dataSource.getRepository(CustomerEntity).find({
    where: { organization_id: organizationId },
  });

  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  const records: PhoenixInvoiceRecord[] = [];
  for (const invoice of invoices) {
    const snapshot = parseSnapshot(invoice);
    if (!snapshot.workizInvoiceCode) continue;

    const job = jobById.get(invoice.job_id);
    const customer = job ? customerById.get(job.customer_id) : undefined;
    if (!job || !customer) continue;

    records.push({
      invoiceId: invoice.id,
      jobId: job.id,
      invoiceCode: snapshot.workizInvoiceCode,
      issuedAt: invoice.issued_at,
      totalCents: invoice.total_cents,
      subtotalCents: invoice.subtotal_cents,
      taxCents: invoice.tax_cents,
      status: invoice.status,
      customerId: customer.id,
      customerName: customer.full_name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerStreet: customer.service_address_line_1,
      customerPostalCode: customer.service_postal_code,
      sourceKind: snapshot.sourceKind,
      enrichmentStatus: snapshot.enrichmentStatus,
      alreadyEnriched: snapshot.enrichmentStatus === "complete" || snapshot.sourceKind === "pdf",
    });
  }

  return records;
}

export function matchPdfToPhoenixInvoice(
  normalized: WorkizPdfNormalizedInvoice,
  phoenixRecords: PhoenixInvoiceRecord[],
): PdfInvoiceMatchResult {
  const invoiceNumber = normalized.invoice_number;
  const sourceFilename = normalized.extraction_meta.source_filename;

  if (invoiceNumber) {
    const exactMatches = phoenixRecords.filter((record) => record.invoiceCode === invoiceNumber);
    if (exactMatches.length === 1) {
      const matched = exactMatches[0];
      return {
        sourceFilename,
        invoiceNumber,
        matchClass: "EXACT_MATCH",
        matchReason: `workiz_invoice_code ${invoiceNumber} found in Phoenix org`,
        matchedInvoice: matched,
        candidateCount: 1,
        alreadyEnriched: matched.alreadyEnriched,
      };
    }
    if (exactMatches.length > 1) {
      return {
        sourceFilename,
        invoiceNumber,
        matchClass: "AMBIGUOUS",
        matchReason: `Multiple Phoenix invoices share workiz_invoice_code ${invoiceNumber}`,
        matchedInvoice: null,
        candidateCount: exactMatches.length,
        alreadyEnriched: exactMatches.some((record) => record.alreadyEnriched),
      };
    }
  }

  const pdfEmail = normalizeEmail(normalized.customer?.email);
  const pdfPhone = phoneDigits(normalized.customer?.phone);
  const pdfTotal = normalized.financials.total_cents;
  const pdfDate = normalized.invoice_date;

  const highConfidenceCandidates = phoenixRecords.filter((record) => {
    const emailMatch = pdfEmail && normalizeEmail(record.customerEmail) === pdfEmail;
    const phoneMatch = pdfPhone.length >= 10 && phoneDigits(record.customerPhone) === pdfPhone;
    const identityMatch = emailMatch || phoneMatch;
    const dateMatch = sameDay(record.issuedAt, pdfDate);
    const totalMatch = pdfTotal != null && Math.abs(record.totalCents - pdfTotal) <= 2;
    return identityMatch && dateMatch && totalMatch;
  });

  if (highConfidenceCandidates.length === 1) {
    const matched = highConfidenceCandidates[0];
    return {
      sourceFilename,
      invoiceNumber,
      matchClass: "HIGH_CONFIDENCE_MATCH",
      matchReason: invoiceNumber
        ? `No exact code hit; matched by customer identity + date + total (${matched.invoiceCode})`
        : `Missing PDF invoice code; matched by customer identity + date + total (${matched.invoiceCode})`,
      matchedInvoice: matched,
      candidateCount: 1,
      alreadyEnriched: matched.alreadyEnriched,
    };
  }

  if (highConfidenceCandidates.length > 1) {
    return {
      sourceFilename,
      invoiceNumber,
      matchClass: "AMBIGUOUS",
      matchReason: `Multiple candidates matched customer identity + date + total: ${highConfidenceCandidates.map((c) => c.invoiceCode).join(", ")}`,
      matchedInvoice: null,
      candidateCount: highConfidenceCandidates.length,
      alreadyEnriched: highConfidenceCandidates.some((record) => record.alreadyEnriched),
    };
  }

  const partialCandidates = phoenixRecords.filter((record) => {
    const emailMatch = pdfEmail && normalizeEmail(record.customerEmail) === pdfEmail;
    const phoneMatch = pdfPhone.length >= 10 && phoneDigits(record.customerPhone) === pdfPhone;
    const totalMatch = pdfTotal != null && Math.abs(record.totalCents - pdfTotal) <= 2;
    return emailMatch || phoneMatch || totalMatch;
  });

  if (partialCandidates.length > 0) {
    return {
      sourceFilename,
      invoiceNumber,
      matchClass: "AMBIGUOUS",
      matchReason: `Partial signal matches without unique identity+date+total: ${partialCandidates.map((c) => c.invoiceCode).join(", ")}`,
      matchedInvoice: null,
      candidateCount: partialCandidates.length,
      alreadyEnriched: partialCandidates.some((record) => record.alreadyEnriched),
    };
  }

  return {
    sourceFilename,
    invoiceNumber,
    matchClass: "UNMATCHED",
    matchReason: invoiceNumber
      ? `No Phoenix invoice found for code ${invoiceNumber}`
      : "No Phoenix invoice matched by available signals",
    matchedInvoice: null,
    candidateCount: 0,
    alreadyEnriched: false,
  };
}

export function crossCheckPdfCustomer(
  normalized: WorkizPdfNormalizedInvoice,
  matchedInvoice: PhoenixInvoiceRecord | null,
): CustomerCrossCheckResult {
  if (!normalized.customer || !matchedInvoice) {
    return { outcome: "INSUFFICIENT_DATA", fields: [], conflictFields: [] };
  }

  const pdfCustomer = normalized.customer;
  const fields: CustomerFieldCheck[] = [
    {
      field: "phone",
      pdfValue: pdfCustomer.phone || null,
      wizfieldValue: matchedInvoice.customerPhone,
      conflict: false,
    },
    {
      field: "email",
      pdfValue: pdfCustomer.email,
      wizfieldValue: matchedInvoice.customerEmail,
      conflict: false,
    },
    {
      field: "name",
      pdfValue: pdfCustomer.name,
      wizfieldValue: matchedInvoice.customerName,
      conflict: false,
    },
    {
      field: "address",
      pdfValue: [pdfCustomer.street, pdfCustomer.postal_code].filter(Boolean).join(" | ") || null,
      wizfieldValue: [matchedInvoice.customerStreet, matchedInvoice.customerPostalCode].filter(Boolean).join(" | ") || null,
      conflict: false,
    },
  ];

  for (const field of fields) {
    if (field.field === "phone") {
      const pdfDigits = phoneDigits(field.pdfValue);
      const wfDigits = phoneDigits(field.wizfieldValue);
      field.conflict = pdfDigits.length >= 10 && wfDigits.length >= 10 && pdfDigits !== wfDigits;
    } else if (field.field === "email") {
      const pdfEmail = normalizeEmail(field.pdfValue);
      const wfEmail = normalizeEmail(field.wizfieldValue);
      field.conflict = Boolean(pdfEmail && wfEmail && pdfEmail !== wfEmail);
    } else if (field.field === "name") {
      const pdfName = normalizeName(field.pdfValue ?? "");
      const wfName = normalizeName(field.wizfieldValue ?? "");
      field.conflict = Boolean(pdfName && wfName && pdfName !== wfName);
    } else if (field.field === "address") {
      const pdfStreet = normalizeStreet(pdfCustomer.street);
      const wfStreet = normalizeStreet(matchedInvoice.customerStreet);
      const pdfPostal = normalizePostal(pdfCustomer.postal_code);
      const wfPostal = normalizePostal(matchedInvoice.customerPostalCode);
      field.conflict = Boolean(
        (pdfStreet && wfStreet && pdfStreet !== wfStreet)
        || (pdfPostal && wfPostal && pdfPostal !== wfPostal),
      );
    }
  }

  const conflictFields = fields.filter((field) => field.conflict).map((field) => field.field);
  return {
    outcome: conflictFields.length > 0 ? "CUSTOMER_CONFLICT" : "CUSTOMER_MATCH",
    fields,
    conflictFields,
  };
}
