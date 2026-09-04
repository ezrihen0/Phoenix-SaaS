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
import { isExcludedWorkizCustomer, isExcludedWorkizCustomerEmail } from "./workiz/workiz-customer-exclusion";
import {
  crossCheckPdfCustomer,
  loadPhoenixInvoiceRecords,
  matchPdfToPhoenixInvoice,
  type PhoenixInvoiceRecord,
} from "./workiz/workiz-invoice-pdf-matcher";
import { enrichPdfInventoryWithText, scanPdfInventory } from "./workiz/workiz-invoice-pdf-inventory";
import { normalizeWorkizPdfInvoice } from "./workiz/workiz-invoice-pdf-normalizer";
import { parseWorkizInvoiceText } from "./workiz/workiz-invoice-parser";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "./workiz/workiz-invoice-upsert";
import { reviewHistoricalCustomerConflict } from "./workiz/workiz-invoice-pdf-customer-conflict";

const pdf = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const PHOENIX_ORG_SLUG = "phoenix-fireplace";
const DEFAULT_PDF_DIR = "C:\\Users\\edenz\\OneDrive\\שולחן העבודה\\Business\\Workiz\\INVOICES PDF";

const DUPLICATE_PDF_FILENAMES = new Set([
  "LindsayNichols.no55825 (1).pdf",
  "MargaretMcfarlane.no55724 (1).pdf",
]);

export type CoverageCategory = "A" | "B" | "C" | "D" | "E" | "F";

export type PdfMappingRecord = {
  filename: string;
  fileHash: string;
  status: "readable" | "unreadable" | "requires_ocr";
  parsed: boolean;
  parseError: string | null;
  invoiceCode: string | null;
  classification: "MATCHED" | "AMBIGUOUS" | "UNMATCHED" | "DUPLICATE_PDF" | "EXCLUDED_CUSTOMER" | "PARSER_FAILURE";
  matchedInvoiceCode: string | null;
  matchedCustomerId: string | null;
  reason: string;
  possibleCandidates: string[];
};

function getPdfSourceDir(): string {
  return process.env.WORKIZ_INVOICE_PDF_SOURCE_DIR ?? DEFAULT_PDF_DIR;
}

function writeJson(path: string, payload: unknown): void {
  writeFileSync(path, JSON.stringify(payload, null, 2));
}

function parseWorkizSnapshot(invoice: InvoiceEntity): {
  isHistorical: boolean;
  invoiceCode: string | null;
  enrichmentStatus: string | null;
  pdfHash: string | null;
} {
  if (!invoice.branding_snapshot_json) {
    return { isHistorical: false, invoiceCode: null, enrichmentStatus: null, pdfHash: null };
  }
  try {
    const snapshot = JSON.parse(invoice.branding_snapshot_json) as {
      import_source?: string;
      workiz_invoice_code?: string;
      enrichment_status?: string;
      pdf_enrichment?: { file_hash?: string };
    };
    return {
      isHistorical: snapshot.import_source === WORKIZ_HISTORICAL_IMPORT_SOURCE,
      invoiceCode: snapshot.workiz_invoice_code ?? null,
      enrichmentStatus: snapshot.enrichment_status ?? null,
      pdfHash: snapshot.pdf_enrichment?.file_hash ?? null,
    };
  } catch {
    return { isHistorical: false, invoiceCode: null, enrichmentStatus: null, pdfHash: null };
  }
}

async function classifyPdfFile(input: {
  filename: string;
  path: string;
  sha256: string;
  status: string;
  phoenixRecords: PhoenixInvoiceRecord[];
  customerById: Map<string, CustomerEntity>;
}): Promise<PdfMappingRecord> {
  const base: PdfMappingRecord = {
    filename: input.filename,
    fileHash: input.sha256,
    status: input.status as PdfMappingRecord["status"],
    parsed: false,
    parseError: null,
    invoiceCode: null,
    classification: "PARSER_FAILURE",
    matchedInvoiceCode: null,
    matchedCustomerId: null,
    reason: "",
    possibleCandidates: [],
  };

  if (DUPLICATE_PDF_FILENAMES.has(input.filename)) {
    return { ...base, classification: "DUPLICATE_PDF", reason: "Duplicate copy excluded from processing" };
  }

  if (input.status === "unreadable" || input.status === "requires_ocr") {
    return { ...base, classification: "PARSER_FAILURE", reason: input.status };
  }

  try {
    const buffer = readFileSync(input.path);
    const parsedText = await pdf(buffer);
    const parsed = parseWorkizInvoiceText({
      text: parsedText.text,
      sourceFile: input.filename,
      sourcePath: input.path,
    });
    const normalized = normalizeWorkizPdfInvoice(parsed, input.sha256);
    base.parsed = true;
    base.invoiceCode = normalized.invoice_number;

    if (normalized.customer?.email && isExcludedWorkizCustomerEmail(normalized.customer.email)) {
      return {
        ...base,
        classification: "EXCLUDED_CUSTOMER",
        reason: `PDF customer email ${normalized.customer.email} is permanently excluded`,
      };
    }

    const match = matchPdfToPhoenixInvoice(normalized, input.phoenixRecords);
    if (match.matchClass === "EXACT_MATCH" || match.matchClass === "HIGH_CONFIDENCE_MATCH") {
      const matched = match.matchedInvoice!;
      const customer = input.customerById.get(matched.customerId);
      if (customer && isExcludedWorkizCustomer(customer)) {
        return {
          ...base,
          classification: "EXCLUDED_CUSTOMER",
          matchedInvoiceCode: matched.invoiceCode,
          matchedCustomerId: matched.customerId,
          reason: `Matched invoice belongs to excluded customer ${customer.email}`,
        };
      }
      const customerCheck = crossCheckPdfCustomer(normalized, matched);
      const conflictReview = reviewHistoricalCustomerConflict({
        customerCheck,
        normalized,
        matchedInvoice: matched,
        exactInvoiceCodeMatch: normalized.invoice_number === matched.invoiceCode,
      });
      if (
        conflictReview.resolution === "TRUE_IDENTITY_CONFLICT"
        || conflictReview.resolution === "UNRESOLVED"
      ) {
        return {
          ...base,
          classification: "AMBIGUOUS",
          matchedInvoiceCode: matched.invoiceCode,
          matchedCustomerId: matched.customerId,
          reason: conflictReview.reason,
          possibleCandidates: [matched.invoiceCode],
        };
      }
      return {
        ...base,
        classification: "MATCHED",
        matchedInvoiceCode: matched.invoiceCode,
        matchedCustomerId: matched.customerId,
        reason: match.matchReason,
      };
    }

    if (match.matchClass === "AMBIGUOUS") {
      return {
        ...base,
        classification: "AMBIGUOUS",
        reason: match.matchReason,
        possibleCandidates: input.phoenixRecords
          .filter((record) => record.invoiceCode === normalized.invoice_number)
          .map((record) => record.invoiceCode),
      };
    }

    return {
      ...base,
      classification: "UNMATCHED",
      reason: match.matchReason,
      possibleCandidates: [],
    };
  } catch (error) {
    return {
      ...base,
      parseError: error instanceof Error ? error.message : String(error),
      classification: "PARSER_FAILURE",
      reason: base.parseError ?? "parse failure",
    };
  }
}

export async function runWorkizFinalHistoricalCoverageAudit(): Promise<Record<string, unknown>> {
  const harnessRoot = join(process.cwd(), "_runtime_harness", "workiz-final-audit");
  mkdirSync(harnessRoot, { recursive: true });

  const pdfSourceDir = getPdfSourceDir();
  const inventory = await enrichPdfInventoryWithText(scanPdfInventory(pdfSourceDir));
  writeJson(join(harnessRoot, "pdf-inventory.json"), inventory);

  const uniqueHashes = new Set(inventory.files.map((file) => file.sha256)).size;
  const hashGroups = new Map<string, string[]>();
  for (const file of inventory.files) {
    const group = hashGroups.get(file.sha256) ?? [];
    group.push(file.filename);
    hashGroups.set(file.sha256, group);
  }
  const duplicatePdfFiles = [...hashGroups.values()].filter((group) => group.length > 1);

  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();

  try {
    const org = await ds.getRepository(OrganizationEntity).findOne({ where: { id: PHOENIX_ORG_ID } });
    if (!org || org.slug !== PHOENIX_ORG_SLUG) {
      throw new Error(`Phoenix org verification failed for ${PHOENIX_ORG_ID}`);
    }

    const customers = await ds.getRepository(CustomerEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const jobs = await ds.getRepository(JobEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const invoices = await ds.getRepository(InvoiceEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const documents = await ds.getRepository(InvoiceDocumentEntity).find({
      where: { organization_id: PHOENIX_ORG_ID, document_kind: "workiz_source_pdf" },
    });

    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const jobById = new Map(jobs.map((job) => [job.id, job]));
    const phoenixRecords = await loadPhoenixInvoiceRecords(ds, PHOENIX_ORG_ID);

    const historicalInvoices = invoices.filter((invoice) => parseWorkizSnapshot(invoice).isHistorical);

    const pdfMappings: PdfMappingRecord[] = [];
    for (const file of inventory.files) {
      pdfMappings.push(await classifyPdfFile({
        filename: file.filename,
        path: file.path,
        sha256: file.sha256,
        status: file.status,
        phoenixRecords,
        customerById,
      }));
    }

    const invoicesWithPdf = new Set(documents.map((document) => document.invoice_id));
    const enrichedInvoiceIds = new Set(
      historicalInvoices
        .filter((invoice) => parseWorkizSnapshot(invoice).enrichmentStatus === "complete")
        .map((invoice) => invoice.id),
    );

    const customerLinkConfirmed = historicalInvoices.filter((invoice) => {
      const job = jobById.get(invoice.job_id);
      return Boolean(job && customerById.get(job.customer_id));
    }).length;

    const customerLinkConflicts: Array<Record<string, unknown>> = [];
    const invoicesWithoutCustomer: Array<Record<string, unknown>> = [];

    for (const invoice of historicalInvoices) {
      const snapshot = parseWorkizSnapshot(invoice);
      const job = jobById.get(invoice.job_id);
      const customer = job ? customerById.get(job.customer_id) : undefined;
      if (!job || !customer) {
        invoicesWithoutCustomer.push({
          invoiceId: invoice.id,
          invoiceCode: snapshot.invoiceCode,
          jobId: invoice.job_id,
          reason: !job ? "missing job" : "missing customer",
        });
        continue;
      }

      const matchedRecord = phoenixRecords.find((record) => record.invoiceId === invoice.id) ?? null;
      const extractionPath = snapshot.invoiceCode
        ? join(process.cwd(), "_runtime_harness", "workiz-invoice-pdf-batch1", "extractions", `${snapshot.invoiceCode}.json`)
        : null;
      if (extractionPath && existsSync(extractionPath) && matchedRecord) {
        const normalized = JSON.parse(readFileSync(extractionPath, "utf8"));
        const crossCheck = crossCheckPdfCustomer(normalized, matchedRecord);
        const review = reviewHistoricalCustomerConflict({
          customerCheck: crossCheck,
          normalized,
          matchedInvoice: matchedRecord,
          exactInvoiceCodeMatch: normalized.invoice_number === matchedRecord.invoiceCode,
        });
        if (
          review.resolution === "TRUE_IDENTITY_CONFLICT"
          || review.resolution === "UNRESOLVED"
        ) {
          customerLinkConflicts.push({
            invoiceId: invoice.id,
            invoiceCode: snapshot.invoiceCode,
            customerId: customer.id,
            customerName: customer.full_name,
            customerEmail: customer.email,
            reason: review.reason,
            resolution: review.resolution,
            crossCheck,
          });
        }
      }
    }

    const invoicesWithoutPdfs = historicalInvoices
      .filter((invoice) => !invoicesWithPdf.has(invoice.id))
      .map((invoice) => {
        const snapshot = parseWorkizSnapshot(invoice);
        const job = jobById.get(invoice.job_id);
        const customer = job ? customerById.get(job.customer_id) : undefined;
        const pdfMatch = pdfMappings.find(
          (mapping) => mapping.matchedInvoiceCode === snapshot.invoiceCode && mapping.classification === "MATCHED",
        );
        const unresolved = pdfMappings.find(
          (mapping) => mapping.invoiceCode === snapshot.invoiceCode
            && (mapping.classification === "UNMATCHED" || mapping.classification === "AMBIGUOUS"),
        );
        return {
          customer: customer?.full_name ?? null,
          customerId: customer?.id ?? null,
          invoiceNumber: snapshot.invoiceCode,
          invoiceId: invoice.id,
          invoiceDate: invoice.issued_at?.toISOString() ?? null,
          invoiceTotalCents: invoice.total_cents,
          enrichmentStatus: snapshot.enrichmentStatus,
          pdfFoundButUnresolved: Boolean(unresolved),
          reason: pdfMatch
            ? "matched PDF exists but not attached to invoice"
            : unresolved
              ? unresolved.reason
              : "no matching PDF in source directory",
        };
      });

    const customersWithoutInvoices = customers
      .filter((customer) => !isExcludedWorkizCustomer(customer))
      .filter((customer) => !jobs.some((job) => job.customer_id === customer.id && historicalInvoices.some((inv) => inv.job_id === job.id)))
      .map((customer) => ({
        customer: customer.full_name,
        customerId: customer.id,
        phone: customer.phone,
        email: customer.email,
        address: [
          customer.service_address_line_1,
          customer.service_city,
          customer.service_state_or_region,
          customer.service_postal_code,
        ].filter(Boolean).join(", "),
        externalClientNumber: customer.external_client_number,
      }));

    const orphanPdfs = pdfMappings
      .filter((mapping) => mapping.classification === "UNMATCHED"
        || mapping.classification === "AMBIGUOUS"
        || mapping.classification === "PARSER_FAILURE")
      .map((mapping) => ({
        filename: mapping.filename,
        parsedInvoiceCode: mapping.invoiceCode,
        classification: mapping.classification,
        reason: mapping.reason,
        possibleCandidates: mapping.possibleCandidates,
        fileHash: mapping.fileHash,
      }));

    const customerCoverage: Array<Record<string, unknown>> = [];
    for (const customer of customers.filter((row) => !isExcludedWorkizCustomer(row))) {
      const customerJobs = jobs.filter((job) => job.customer_id === customer.id);
      const customerHistoricalInvoices = historicalInvoices.filter((invoice) => customerJobs.some((job) => job.id === invoice.job_id));
      const customerPdfDocs = documents.filter((document) => document.customer_id === customer.id);
      const customerEnriched = customerHistoricalInvoices.filter((invoice) => enrichedInvoiceIds.has(invoice.id));

      let category: CoverageCategory = "C";
      if (customerHistoricalInvoices.length === 0) {
        category = "C";
      } else if (customerPdfDocs.length > 0 && customerEnriched.length > 0) {
        category = "A";
      } else if (customerHistoricalInvoices.length > 0 && customerPdfDocs.length === 0) {
        category = "B";
      } else if (customerLinkConflicts.some((conflict) => conflict.customerId === customer.id)) {
        category = "F";
      }

      customerCoverage.push({
        customerId: customer.id,
        customerName: customer.full_name,
        email: customer.email,
        phone: customer.phone,
        category,
        invoiceCount: customerHistoricalInvoices.length,
        pdfDocumentCount: customerPdfDocs.length,
        enrichedInvoiceCount: customerEnriched.length,
        jobCount: customerJobs.length,
      });
    }

    const allfixRemaining = customers.filter((customer) => isExcludedWorkizCustomerEmail(customer.email)).length;

    const masterReport = {
      generatedAt: new Date().toISOString(),
      phoenixOrganizationId: PHOENIX_ORG_ID,
      pdfSourceDirectory: pdfSourceDir,
      phoenixCustomers: customers.length,
      phoenixHistoricalInvoices: historicalInvoices.length,
      totalPdfFiles: inventory.pdfFiles,
      uniquePdfs: uniqueHashes,
      duplicatePdfs: duplicatePdfFiles.length,
      duplicatePdfFileGroups: duplicatePdfFiles,
      pdfToInvoiceMatched: pdfMappings.filter((mapping) => mapping.classification === "MATCHED").length,
      pdfToInvoiceUnmatched: pdfMappings.filter((mapping) => mapping.classification === "UNMATCHED").length,
      pdfToInvoiceAmbiguous: pdfMappings.filter((mapping) => mapping.classification === "AMBIGUOUS").length,
      pdfExcludedCustomer: pdfMappings.filter((mapping) => mapping.classification === "EXCLUDED_CUSTOMER").length,
      pdfDuplicateCopies: pdfMappings.filter((mapping) => mapping.classification === "DUPLICATE_PDF").length,
      pdfParserFailures: pdfMappings.filter((mapping) => mapping.classification === "PARSER_FAILURE").length,
      invoicesCustomerLinkConfirmed: customerLinkConfirmed,
      invoicesWithoutCustomer: invoicesWithoutCustomer.length,
      customerLinkConflicts: customerLinkConflicts.length,
      customersWithInvoice: customerCoverage.filter((row) => (row.invoiceCount as number) > 0).length,
      customersWithoutInvoice: customersWithoutInvoices.length,
      invoicesWithPdf: invoicesWithPdf.size,
      invoicesWithoutPdf: invoicesWithoutPdfs.length,
      invoicesEnriched: enrichedInvoiceIds.size,
      invoicesNotEnriched: historicalInvoices.length - enrichedInvoiceIds.size,
      portalPdfsAvailable: documents.length,
      allfixRecordsRemaining: allfixRemaining,
      coverageByCategory: {
        A: customerCoverage.filter((row) => row.category === "A").length,
        B: customerCoverage.filter((row) => row.category === "B").length,
        C: customerCoverage.filter((row) => row.category === "C").length,
        D: invoicesWithoutCustomer.length,
        E: orphanPdfs.length,
        F: customerCoverage.filter((row) => row.category === "F").length,
      },
      parsedSuccessfully: pdfMappings.filter((mapping) => mapping.parsed).length,
      readable: inventory.readable,
      unreadable: inventory.unreadable,
    };

    writeJson(join(harnessRoot, "customers-without-invoices.json"), {
      generatedAt: masterReport.generatedAt,
      count: customersWithoutInvoices.length,
      records: customersWithoutInvoices,
    });
    writeJson(join(harnessRoot, "invoices-without-pdfs.json"), {
      generatedAt: masterReport.generatedAt,
      count: invoicesWithoutPdfs.length,
      records: invoicesWithoutPdfs,
    });
    writeJson(join(harnessRoot, "orphan-pdfs.json"), {
      generatedAt: masterReport.generatedAt,
      count: orphanPdfs.length,
      records: orphanPdfs,
    });
    writeJson(join(harnessRoot, "customer-link-conflicts.json"), {
      generatedAt: masterReport.generatedAt,
      count: customerLinkConflicts.length,
      records: customerLinkConflicts,
    });
    writeJson(join(harnessRoot, "final-historical-coverage.json"), {
      ...masterReport,
      customerCoverage,
      pdfMappings,
    });

    return masterReport;
  } finally {
    await ds.destroy();
  }
}

async function main(): Promise<void> {
  const report = await runWorkizFinalHistoricalCoverageAudit();
  console.log("FINAL HISTORICAL COVERAGE AUDIT");
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
