import "dotenv/config";
import "reflect-metadata";

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

import { DataSource } from "typeorm";

import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { reviewHistoricalCustomerConflict } from "./workiz/workiz-invoice-pdf-customer-conflict";
import { isExcludedWorkizCustomer, isExcludedWorkizCustomerEmail } from "./workiz/workiz-customer-exclusion";
import { enrichInvoiceFromPdf } from "./workiz/workiz-invoice-pdf-enrichment";
import {
  crossCheckPdfCustomer,
  loadPhoenixInvoiceRecords,
  matchPdfToPhoenixInvoice,
} from "./workiz/workiz-invoice-pdf-matcher";
import type { WorkizPdfNormalizedInvoice } from "./workiz/workiz-invoice-pdf-normalizer";
import { loadPdfManifest, savePdfManifest, upsertPdfManifestEntry } from "./workiz/workiz-invoice-pdf-manifest";

const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const PHOENIX_ORG_SLUG = "phoenix-fireplace";

const EXCLUDED_DUPLICATE_PDF = "LindsayNichols.no55825 (1).pdf";
const EXCLUDED_UNRESOLVED_PDF = "Natalie.no55801.pdf";
const EXCLUDED_UNRESOLVED_INVOICE = "8JQ6YC";

export type EnrichmentWriteRecord = {
  sourceFilename: string;
  invoiceNumber: string | null;
  action:
    | "enriched"
    | "skipped_duplicate_pdf"
    | "unresolved"
    | "customer_conflict_excluded"
    | "skipped_no_match"
    | "skipped_already_enriched"
    | "error";
  reason: string;
  customerConflictReview?: string;
};

export type EnrichmentWriteReport = {
  mode: "execute";
  generatedAt: string;
  phoenixOrganizationId: string;
  pdfFiles: number;
  eligibleForWrite: number;
  enriched: number;
  skippedDuplicatePdf: number;
  unresolved: number;
  customerConflictExcluded: number;
  skippedAlreadyEnriched: number;
  skippedNoMatch: number;
  errors: number;
  records: EnrichmentWriteRecord[];
};

function loadNormalizedExtractions(extractionsDir: string): Map<string, WorkizPdfNormalizedInvoice> {
  const byFilename = new Map<string, WorkizPdfNormalizedInvoice>();
  if (!existsSync(extractionsDir)) return byFilename;

  for (const file of readdirSync(extractionsDir).filter((name) => name.endsWith(".json"))) {
    const payload = JSON.parse(readFileSync(join(extractionsDir, file), "utf8")) as WorkizPdfNormalizedInvoice;
    byFilename.set(payload.extraction_meta.source_filename, payload);
  }
  return byFilename;
}

export async function runWorkizPdfEnrichmentWrite(): Promise<EnrichmentWriteReport> {
  const harnessRoot = join(process.cwd(), "_runtime_harness");
  const batchDir = join(harnessRoot, "workiz-invoice-pdf-batch1");
  const extractionsDir = join(batchDir, "extractions");
  const inventory = existsSync(join(batchDir, "inventory.json"))
    ? JSON.parse(readFileSync(join(batchDir, "inventory.json"), "utf8")) as { pdfFiles: number; files: Array<{ filename: string }> }
    : { pdfFiles: 0, files: [] };

  const extractions = loadNormalizedExtractions(extractionsDir);
  const records: EnrichmentWriteRecord[] = [];
  let enriched = 0;
  let skippedDuplicatePdf = 0;
  let unresolved = 0;
  let customerConflictExcluded = 0;
  let skippedAlreadyEnriched = 0;
  let skippedNoMatch = 0;
  let errors = 0;

  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();

  try {
    const org = await ds.getRepository(OrganizationEntity).findOne({ where: { id: PHOENIX_ORG_ID } });
    if (!org || org.slug !== PHOENIX_ORG_SLUG) {
      throw new Error(`Phoenix org verification failed for ${PHOENIX_ORG_ID}`);
    }

    const phoenixRecords = await loadPhoenixInvoiceRecords(ds, PHOENIX_ORG_ID);
    const manifest = loadPdfManifest(harnessRoot);

    for (const file of inventory.files) {
      const filename = file.filename;

      if (filename === EXCLUDED_DUPLICATE_PDF) {
        skippedDuplicatePdf += 1;
        records.push({
          sourceFilename: filename,
          invoiceNumber: "0OINGD",
          action: "skipped_duplicate_pdf",
          reason: "Duplicate copy excluded; primary LindsayNichols.no55825.pdf processed separately",
        });
        upsertPdfManifestEntry(manifest, {
          filename,
          sha256: "",
          invoiceNumber: "0OINGD",
          extractionOk: true,
          matchClass: "SKIPPED_DUPLICATE",
          error: null,
        });
        continue;
      }

      if (filename === EXCLUDED_UNRESOLVED_PDF) {
        unresolved += 1;
        records.push({
          sourceFilename: filename,
          invoiceNumber: EXCLUDED_UNRESOLVED_INVOICE,
          action: "unresolved",
          reason: "No deterministic Phoenix invoice match; held for manual resolution",
        });
        upsertPdfManifestEntry(manifest, {
          filename,
          sha256: extractions.get(filename)?.extraction_meta.file_hash ?? "",
          invoiceNumber: EXCLUDED_UNRESOLVED_INVOICE,
          extractionOk: true,
          matchClass: "UNRESOLVED",
          error: "UNMATCHED",
        });
        continue;
      }

      const normalized = extractions.get(filename);
      if (!normalized) {
        errors += 1;
        records.push({
          sourceFilename: filename,
          invoiceNumber: null,
          action: "error",
          reason: "Missing normalized extraction artifact",
        });
        continue;
      }

      const match = matchPdfToPhoenixInvoice(normalized, phoenixRecords);
      if (match.matchClass !== "EXACT_MATCH" || !match.matchedInvoice) {
        skippedNoMatch += 1;
        records.push({
          sourceFilename: filename,
          invoiceNumber: normalized.invoice_number,
          action: "skipped_no_match",
          reason: match.matchReason,
        });
        continue;
      }

      if (
        isExcludedWorkizCustomerEmail(normalized.customer?.email)
        || isExcludedWorkizCustomer({ email: match.matchedInvoice.customerEmail })
      ) {
        customerConflictExcluded += 1;
        records.push({
          sourceFilename: filename,
          invoiceNumber: normalized.invoice_number,
          action: "customer_conflict_excluded",
          reason: "Permanently excluded @allfix.ca customer domain",
          customerConflictReview: "material_excluded",
        });
        continue;
      }

      const customerCheck = crossCheckPdfCustomer(normalized, match.matchedInvoice);
      const conflictReview = reviewHistoricalCustomerConflict({
        customerCheck,
        normalized,
        matchedInvoice: match.matchedInvoice,
        exactInvoiceCodeMatch: normalized.invoice_number === match.matchedInvoice.invoiceCode,
      });
      if (conflictReview.resolution === "TRUE_IDENTITY_CONFLICT" || conflictReview.resolution === "UNRESOLVED") {
        customerConflictExcluded += 1;
        records.push({
          sourceFilename: filename,
          invoiceNumber: normalized.invoice_number,
          action: "customer_conflict_excluded",
          reason: conflictReview.reason,
          customerConflictReview: conflictReview.review,
        });
        continue;
      }

      try {
        const result = await enrichInvoiceFromPdf({
          dataSource: ds,
          organizationId: PHOENIX_ORG_ID,
          invoiceId: match.matchedInvoice.invoiceId,
          jobId: match.matchedInvoice.jobId,
          normalized,
          customerConflictReview: conflictReview.review,
        });

        if (result.action === "enriched") {
          enriched += 1;
          records.push({
            sourceFilename: filename,
            invoiceNumber: result.invoiceCode,
            action: "enriched",
            reason: conflictReview.reason,
            customerConflictReview: conflictReview.review,
          });
        } else if (result.action === "skipped_already_enriched") {
          skippedAlreadyEnriched += 1;
          records.push({
            sourceFilename: filename,
            invoiceNumber: result.invoiceCode,
            action: "skipped_already_enriched",
            reason: result.reason,
          });
        } else {
          records.push({
            sourceFilename: filename,
            invoiceNumber: result.invoiceCode,
            action: result.action === "excluded" ? "error" : "skipped_duplicate_pdf",
            reason: result.reason,
          });
        }

        upsertPdfManifestEntry(manifest, {
          filename,
          sha256: normalized.extraction_meta.file_hash,
          invoiceNumber: normalized.invoice_number,
          extractionOk: true,
          matchClass: result.action === "enriched" ? "EXACT_MATCH" : result.action,
          error: null,
        });
      } catch (error) {
        errors += 1;
        records.push({
          sourceFilename: filename,
          invoiceNumber: normalized.invoice_number,
          action: "error",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    savePdfManifest(harnessRoot, manifest);

    const eligibleForWrite = inventory.pdfFiles - skippedDuplicatePdf - unresolved;

    const report: EnrichmentWriteReport = {
      mode: "execute",
      generatedAt: new Date().toISOString(),
      phoenixOrganizationId: PHOENIX_ORG_ID,
      pdfFiles: inventory.pdfFiles,
      eligibleForWrite,
      enriched,
      skippedDuplicatePdf,
      unresolved,
      customerConflictExcluded,
      skippedAlreadyEnriched,
      skippedNoMatch,
      errors,
      records,
    };

    mkdirSync(batchDir, { recursive: true });
    writeFileSync(join(batchDir, "enrichment-write-report.json"), JSON.stringify(report, null, 2));
    return report;
  } finally {
    await ds.destroy();
  }
}

async function main() {
  const report = await runWorkizPdfEnrichmentWrite();
  console.log("PDF FILES:", report.pdfFiles);
  console.log("ELIGIBLE FOR WRITE:", report.eligibleForWrite);
  console.log("ENRICHED:", report.enriched);
  console.log("SKIPPED DUPLICATE PDF:", report.skippedDuplicatePdf);
  console.log("UNRESOLVED:", report.unresolved);
  console.log("CUSTOMER CONFLICT EXCLUDED:", report.customerConflictExcluded);
  console.log("SKIPPED ALREADY ENRICHED:", report.skippedAlreadyEnriched);
  console.log("ERRORS:", report.errors);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
