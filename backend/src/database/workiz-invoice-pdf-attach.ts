import "dotenv/config";
import "reflect-metadata";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { NestFactory } from "@nestjs/core";
import { DataSource } from "typeorm";

import { AppModule } from "../app.module";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { InvoiceDocumentsService } from "../documents/invoice-documents/invoice-documents.service";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "./workiz/workiz-invoice-upsert";

const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const PHOENIX_ORG_SLUG = "phoenix-fireplace";

const EXCLUDED_DUPLICATE_PDF = "LindsayNichols.no55825 (1).pdf";
const EXCLUDED_UNRESOLVED_PDF = "Natalie.no55801.pdf";
const EXCLUDED_INVOICE_CODES = new Set(["8JQ6YC"]);

export type PdfAttachRecord = {
  sourceFilename: string;
  invoiceCode: string | null;
  invoiceId: string | null;
  action: "stored" | "skipped_duplicate" | "skipped_excluded" | "skipped_no_enrichment" | "missing_file" | "error";
  reason: string;
};

export type PdfAttachReport = {
  generatedAt: string;
  eligiblePdfs: number;
  pdfDocumentsStored: number;
  skippedDuplicate: number;
  skippedUnresolved: number;
  missingFiles: number;
  records: PdfAttachRecord[];
};

function loadInventoryMap(batchDir: string): Map<string, { path: string; sha256: string }> {
  const inventoryPath = join(batchDir, "inventory.json");
  const map = new Map<string, { path: string; sha256: string }>();
  if (!existsSync(inventoryPath)) return map;
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8")) as {
    files: Array<{ filename: string; path: string; sha256: string }>;
  };
  for (const file of inventory.files) {
    map.set(file.filename, { path: file.path, sha256: file.sha256 });
  }
  return map;
}

export async function runWorkizPdfAttach(): Promise<PdfAttachReport> {
  const batchDir = join(process.cwd(), "_runtime_harness", "workiz-invoice-pdf-batch1");
  const inventoryMap = loadInventoryMap(batchDir);
  const records: PdfAttachRecord[] = [];
  let pdfDocumentsStored = 0;
  let skippedDuplicate = 0;
  let skippedUnresolved = 0;
  let missingFiles = 0;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const invoiceDocumentsService = app.get(InvoiceDocumentsService);
  const ds = app.get(DataSource);

  try {
    const org = await ds.getRepository(OrganizationEntity).findOne({ where: { id: PHOENIX_ORG_ID } });
    if (!org || org.slug !== PHOENIX_ORG_SLUG) {
      throw new Error("Phoenix org verification failed");
    }

    const invoices = await ds.getRepository(InvoiceEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const jobs = await ds.getRepository(JobEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const jobById = new Map(jobs.map((job) => [job.id, job]));

    const enrichedInvoices = invoices.filter((invoice) => {
      if (!invoice.branding_snapshot_json) return false;
      try {
        const snapshot = JSON.parse(invoice.branding_snapshot_json) as {
          import_source?: string;
          enrichment_status?: string;
          workiz_invoice_code?: string;
          pdf_enrichment?: { source_filename?: string };
        };
        return snapshot.import_source === WORKIZ_HISTORICAL_IMPORT_SOURCE
          && snapshot.enrichment_status === "complete"
          && Boolean(snapshot.pdf_enrichment?.source_filename)
          && !EXCLUDED_INVOICE_CODES.has(snapshot.workiz_invoice_code ?? "");
      } catch {
        return false;
      }
    });

    for (const invoice of enrichedInvoices) {
      const snapshot = JSON.parse(invoice.branding_snapshot_json!) as {
        workiz_invoice_code?: string;
        pdf_enrichment?: { source_filename?: string; source_pdf_hash?: string };
      };
      const invoiceCode = snapshot.workiz_invoice_code ?? null;
      const sourceFilename = snapshot.pdf_enrichment?.source_filename ?? "";

      if (sourceFilename === EXCLUDED_DUPLICATE_PDF || sourceFilename === EXCLUDED_UNRESOLVED_PDF) {
        skippedUnresolved += 1;
        records.push({
          sourceFilename,
          invoiceCode,
          invoiceId: invoice.id,
          action: "skipped_excluded",
          reason: "Explicitly excluded from Batch 1 attachment",
        });
        continue;
      }

      const inventoryFile = inventoryMap.get(sourceFilename);
      if (!inventoryFile || !existsSync(inventoryFile.path)) {
        missingFiles += 1;
        records.push({
          sourceFilename,
          invoiceCode,
          invoiceId: invoice.id,
          action: "missing_file",
          reason: "Source PDF file not found in inventory",
        });
        continue;
      }

      const job = jobById.get(invoice.job_id);
      if (!job) {
        records.push({
          sourceFilename,
          invoiceCode,
          invoiceId: invoice.id,
          action: "error",
          reason: "Invoice job not found",
        });
        continue;
      }

      try {
        const result = await invoiceDocumentsService.attachWorkizSourcePdf({
          organizationId: PHOENIX_ORG_ID,
          customerId: job.customer_id,
          invoiceId: invoice.id,
          sourceFilePath: inventoryFile.path,
          originalFilename: sourceFilename,
          fileHash: snapshot.pdf_enrichment?.source_pdf_hash ?? inventoryFile.sha256,
          workizInvoiceCode: invoiceCode,
        });

        if (result.action === "stored") {
          pdfDocumentsStored += 1;
          records.push({
            sourceFilename,
            invoiceCode,
            invoiceId: invoice.id,
            action: "stored",
            reason: `Stored document ${result.document.id}`,
          });
        } else {
          skippedDuplicate += 1;
          records.push({
            sourceFilename,
            invoiceCode,
            invoiceId: invoice.id,
            action: "skipped_duplicate",
            reason: "Document already stored for invoice/hash",
          });
        }
      } catch (error) {
        records.push({
          sourceFilename,
          invoiceCode,
          invoiceId: invoice.id,
          action: "error",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const report: PdfAttachReport = {
      generatedAt: new Date().toISOString(),
      eligiblePdfs: enrichedInvoices.length,
      pdfDocumentsStored,
      skippedDuplicate,
      skippedUnresolved,
      missingFiles,
      records,
    };

    mkdirSync(batchDir, { recursive: true });
    writeFileSync(join(batchDir, "pdf-attach-report.json"), JSON.stringify(report, null, 2));
    return report;
  } finally {
    await app.close();
  }
}

async function main() {
  const report = await runWorkizPdfAttach();
  console.log("ELIGIBLE PDFs:", report.eligiblePdfs);
  console.log("PDF DOCUMENTS STORED:", report.pdfDocumentsStored);
  console.log("SKIPPED DUPLICATE:", report.skippedDuplicate);
  console.log("SKIPPED/UNRESOLVED:", report.skippedUnresolved);
  console.log("MISSING FILES:", report.missingFiles);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
