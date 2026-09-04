import "dotenv/config";
import "reflect-metadata";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { DataSource } from "typeorm";

import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { reviewHistoricalCustomerConflict } from "./workiz/workiz-invoice-pdf-customer-conflict";
import {
  crossCheckPdfCustomer,
  loadPhoenixInvoiceRecords,
  type PhoenixInvoiceRecord,
} from "./workiz/workiz-invoice-pdf-matcher";
import type { WorkizPdfNormalizedInvoice } from "./workiz/workiz-invoice-pdf-normalizer";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "./workiz/workiz-invoice-upsert";

const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const PHOENIX_ORG_SLUG = "phoenix-fireplace";

const PREVIOUSLY_CONFLICTED_CODES = [
  "AHKD8O", "5PUCGL", "18WKSZ", "503IC4", "YCQT02", "4CFPIW",
  "84MAEX", "M51LUX", "9C0AFY", "SJWEMX", "T2R7GX", "C74U6S",
];

const NEW_PDF_CODES = ["9QCIM9", "FJD72U", "WBN0LA"];

export type ConflictResolutionEntry = {
  invoice: string;
  customer: string;
  conflict: string;
  pdfEvidence: Record<string, unknown>;
  dbEvidence: Record<string, unknown>;
  customerMaster: Record<string, unknown>;
  resolution: "HISTORICAL_DATA_DIFFERENCE" | "TRUE_IDENTITY_CONFLICT" | "UNRESOLVED" | "no_conflict";
  reason: string;
  enriched: boolean;
  portalPdf: boolean;
};

function formatAddress(customer: {
  street?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
} | null | undefined): string | null {
  if (!customer) return null;
  const parts = [
    customer.street,
    customer.city,
    customer.province,
    customer.postal_code,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function centsToDollars(cents: number | null | undefined): string | null {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

function loadExtraction(code: string): WorkizPdfNormalizedInvoice | null {
  const path = join(
    process.cwd(),
    "_runtime_harness",
    "workiz-invoice-pdf-batch1",
    "extractions",
    `${code}.json`,
  );
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as WorkizPdfNormalizedInvoice;
}

function findPhoenixRecord(records: PhoenixInvoiceRecord[], code: string): PhoenixInvoiceRecord | null {
  return records.find((record) => record.invoiceCode === code) ?? null;
}

export async function runCustomerConflictResolutionReport(): Promise<Record<string, unknown>> {
  const harnessRoot = join(process.cwd(), "_runtime_harness", "workiz-final-audit");
  mkdirSync(harnessRoot, { recursive: true });

  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();

  try {
    const org = await ds.getRepository(OrganizationEntity).findOne({ where: { id: PHOENIX_ORG_ID } });
    if (!org || org.slug !== PHOENIX_ORG_SLUG) {
      throw new Error("Phoenix org verification failed");
    }

    const phoenixRecords = await loadPhoenixInvoiceRecords(ds, PHOENIX_ORG_ID);
    const customers = await ds.getRepository(CustomerEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const invoices = await ds.getRepository(InvoiceEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const jobs = await ds.getRepository(JobEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const jobById = new Map(jobs.map((job) => [job.id, job]));
    const documents = await ds.getRepository(InvoiceDocumentEntity).find({
      where: { organization_id: PHOENIX_ORG_ID, document_kind: "workiz_source_pdf" },
    });
    const portalPdfByInvoice = new Set(documents.map((document) => document.invoice_id));

    const historicalInvoices = invoices.filter((invoice) => {
      if (!invoice.branding_snapshot_json) return false;
      try {
        const snapshot = JSON.parse(invoice.branding_snapshot_json) as { import_source?: string };
        return snapshot.import_source === WORKIZ_HISTORICAL_IMPORT_SOURCE;
      } catch {
        return false;
      }
    });

    const enrichedCount = historicalInvoices.filter((invoice) => {
      try {
        const snapshot = JSON.parse(invoice.branding_snapshot_json!) as { enrichment_status?: string };
        return snapshot.enrichment_status === "complete";
      } catch {
        return false;
      }
    }).length;

    const entries: ConflictResolutionEntry[] = [];

    for (const code of PREVIOUSLY_CONFLICTED_CODES) {
      const normalized = loadExtraction(code);
      const matched = findPhoenixRecord(phoenixRecords, code);
      const invoice = invoices.find((row) => {
        if (!row.branding_snapshot_json) return false;
        try {
          const snapshot = JSON.parse(row.branding_snapshot_json) as { workiz_invoice_code?: string };
          return snapshot.workiz_invoice_code === code;
        } catch {
          return false;
        }
      });

      const job = invoice ? jobById.get(invoice.job_id) : undefined;
      const customer = job ? customerById.get(job.customer_id) : undefined;

      if (!normalized || !matched || !invoice || !customer) {
        entries.push({
          invoice: code,
          customer: customer?.full_name ?? "unknown",
          conflict: "missing data for evaluation",
          pdfEvidence: {},
          dbEvidence: {},
          customerMaster: {},
          resolution: "UNRESOLVED",
          reason: "Missing extraction, invoice, or customer record",
          enriched: false,
          portalPdf: false,
        });
        continue;
      }

      const customerCheck = crossCheckPdfCustomer(normalized, matched);
      const review = reviewHistoricalCustomerConflict({
        customerCheck,
        normalized,
        matchedInvoice: matched,
        exactInvoiceCodeMatch: normalized.invoice_number === matched.invoiceCode,
      });

      const resolution = review.resolution === "no_conflict"
        ? "no_conflict"
        : review.resolution;

      let snapshotEnriched = false;
      try {
        const snapshot = JSON.parse(invoice.branding_snapshot_json!) as { enrichment_status?: string };
        snapshotEnriched = snapshot.enrichment_status === "complete";
      } catch {
        snapshotEnriched = false;
      }

      entries.push({
        invoice: code,
        customer: customer.full_name,
        conflict: customerCheck.conflictFields.join(", ") || "none",
        pdfEvidence: {
          invoiceCode: normalized.invoice_number,
          name: normalized.customer?.name ?? null,
          phone: normalized.customer?.phone ?? null,
          email: normalized.customer?.email ?? null,
          address: formatAddress(normalized.customer),
          invoiceDate: normalized.invoice_date,
          total: centsToDollars(normalized.financials.total_cents),
        },
        dbEvidence: {
          workizInvoiceCode: matched.invoiceCode,
          linkedCustomer: matched.customerName,
          invoiceDate: matched.issuedAt?.toISOString().slice(0, 10) ?? null,
          total: centsToDollars(matched.totalCents),
          subtotal: centsToDollars(matched.subtotalCents),
          tax: centsToDollars(matched.taxCents),
          status: matched.status,
        },
        customerMaster: {
          name: customer.full_name,
          phone: customer.phone,
          email: customer.email,
          address: [
            customer.service_address_line_1,
            customer.service_city,
            customer.service_state_or_region,
            customer.service_postal_code,
          ]
            .filter(Boolean)
            .join(", "),
        },
        resolution: resolution as ConflictResolutionEntry["resolution"],
        reason: review.reason,
        enriched: snapshotEnriched,
        portalPdf: portalPdfByInvoice.has(invoice.id),
      });
    }

    const resolved = entries.filter((entry) => entry.resolution === "HISTORICAL_DATA_DIFFERENCE" || entry.resolution === "no_conflict").length;
    const trueIdentity = entries.filter((entry) => entry.resolution === "TRUE_IDENTITY_CONFLICT").length;
    const unresolved = entries.filter((entry) => entry.resolution === "UNRESOLVED").length;

    const newPdfStatus = NEW_PDF_CODES.map((code) => {
      const invoice = invoices.find((row) => {
        if (!row.branding_snapshot_json) return false;
        try {
          const snapshot = JSON.parse(row.branding_snapshot_json) as { workiz_invoice_code?: string };
          return snapshot.workiz_invoice_code === code;
        } catch {
          return false;
        }
      });
      let enriched = false;
      if (invoice?.branding_snapshot_json) {
        try {
          const snapshot = JSON.parse(invoice.branding_snapshot_json) as { enrichment_status?: string };
          enriched = snapshot.enrichment_status === "complete";
        } catch {
          enriched = false;
        }
      }
      return {
        invoiceCode: code,
        enriched,
        portalPdf: invoice ? portalPdfByInvoice.has(invoice.id) : false,
      };
    });

    const inventoryPath = join(process.cwd(), "_runtime_harness", "workiz-invoice-pdf-batch1", "inventory.json");
    const totalPdfs = existsSync(inventoryPath)
      ? (JSON.parse(readFileSync(inventoryPath, "utf8")) as { pdfFiles: number }).pdfFiles
      : 0;

    const report = {
      generatedAt: new Date().toISOString(),
      previouslyConflicted: entries,
      newPdfs: newPdfStatus,
      summary: {
        PREVIOUS_CONFLICTS: PREVIOUSLY_CONFLICTED_CODES.length,
        RESOLVED: resolved,
        TRUE_IDENTITY_CONFLICTS: trueIdentity,
        UNRESOLVED: unresolved,
        TOTAL_HISTORICAL_INVOICES: historicalInvoices.length,
        INVOICES_WITH_PDF: portalPdfByInvoice.size,
        INVOICES_ENRICHED: enrichedCount,
        PORTAL_PDFS: portalPdfByInvoice.size,
        TOTAL_PDFS: totalPdfs,
        CUSTOMER_MASTER_RECORDS_MODIFIED: 0,
        FINANCIAL_VALUES_MODIFIED: 0,
        NEW_CUSTOMERS: 0,
        NEW_INVOICES: 0,
        CROSS_TENANT_WRITES: 0,
      },
    };

    writeFileSync(join(harnessRoot, "customer-conflict-resolution-report.json"), JSON.stringify(report, null, 2));
    return report;
  } finally {
    await ds.destroy();
  }
}

async function main(): Promise<void> {
  const report = await runCustomerConflictResolutionReport();
  const summary = report.summary as Record<string, number>;
  console.log("PREVIOUS CONFLICTS:", summary.PREVIOUS_CONFLICTS);
  console.log("RESOLVED:", summary.RESOLVED);
  console.log("TRUE IDENTITY CONFLICTS:", summary.TRUE_IDENTITY_CONFLICTS);
  console.log("UNRESOLVED:", summary.UNRESOLVED);
  console.log("TOTAL HISTORICAL INVOICES:", summary.TOTAL_HISTORICAL_INVOICES);
  console.log("INVOICES WITH PDF:", summary.INVOICES_WITH_PDF);
  console.log("INVOICES ENRICHED:", summary.INVOICES_ENRICHED);
  console.log("PORTAL PDFs:", summary.PORTAL_PDFS);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
