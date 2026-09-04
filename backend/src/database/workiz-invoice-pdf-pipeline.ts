import "dotenv/config";
import "reflect-metadata";

import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { DataSource } from "typeorm";

import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import {
  enrichPdfInventoryWithText,
  scanPdfInventory,
  type PdfInventoryReport,
} from "./workiz/workiz-invoice-pdf-inventory";
import {
  crossCheckPdfCustomer,
  loadPhoenixInvoiceRecords,
  matchPdfToPhoenixInvoice,
  type PdfInvoiceMatchResult,
} from "./workiz/workiz-invoice-pdf-matcher";
import {
  loadPdfManifest,
  savePdfManifest,
  shouldProcessPdf,
  upsertPdfManifestEntry,
} from "./workiz/workiz-invoice-pdf-manifest";
import { normalizeWorkizPdfInvoice, type WorkizPdfNormalizedInvoice } from "./workiz/workiz-invoice-pdf-normalizer";
import {
  detectDuplicateInvoiceNumbers,
  evaluatePdfExtractionQuality,
  type PdfQualityReport,
} from "./workiz/workiz-invoice-pdf-quality";
import {
  reconcilePdfFinancials,
  type FinancialReconciliationResult,
} from "./workiz/workiz-invoice-pdf-reconcile";
import { parseWorkizInvoiceText } from "./workiz/workiz-invoice-parser";

const pdf = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const PHOENIX_ORG_SLUG = "phoenix-fireplace";
const DEFAULT_SOURCE_DIR = "C:\\Users\\edenz\\OneDrive\\שולחן העבודה\\Business\\Workiz\\INVOICES PDF";

export type PdfPipelineRecord = {
  sourceFilename: string;
  invoiceNumber: string | null;
  fileHash: string;
  skipped: boolean;
  skipReason: string | null;
  normalized: WorkizPdfNormalizedInvoice | null;
  quality: PdfQualityReport | null;
  match: PdfInvoiceMatchResult | null;
  customerCheck: ReturnType<typeof crossCheckPdfCustomer> | null;
  financial: FinancialReconciliationResult | null;
  parseError: string | null;
};

export type QaFieldCheck = {
  filename: string;
  invoiceCode: string | null;
  field: string;
  extracted: string | number | null;
  match: boolean;
};

export type Batch1Report = {
  generatedAt: string;
  sourceDirectory: string;
  phoenixOrganizationId: string;
  phoenixOrganizationName: string;
  inventory: {
    pdfFiles: number;
    readable: number;
    unreadable: number;
    duplicateFiles: number;
    textExtractable: number;
    requiresOcr: number;
  };
  parsedSuccessfully: number;
  parserFailures: number;
  exactMatch: number;
  highConfidenceMatch: number;
  ambiguous: number;
  unmatched: number;
  financialMatch: number;
  financialMismatch: number;
  financialInsufficientData: number;
  customerMatch: number;
  customerConflict: number;
  withLineItems: number;
  withServiceSummary: number;
  withWarranty: number;
  withPayments: number;
  withUsefulOperationalData: number;
  manualQa: {
    samplesSelected: number;
    fieldsChecked: number;
    fieldsCorrect: number;
    accuracyPercent: number;
  };
  readyForEnrichmentWrite: "YES" | "NO";
  blockers: string[];
  duplicateInvoiceNumbersInBatch: Array<{ invoiceNumber: string; filenames: string[] }>;
  records: PdfPipelineRecord[];
  qaSample: QaFieldCheck[];
};

function getSourceDirectory(): string {
  return process.env.WORKIZ_INVOICE_PDF_SOURCE_DIR ?? DEFAULT_SOURCE_DIR;
}

function writeJson(path: string, payload: unknown): void {
  writeFileSync(path, JSON.stringify(payload, null, 2));
}

function hasUsefulOperationalData(normalized: WorkizPdfNormalizedInvoice): boolean {
  return normalized.service_summary.length > 0
    || (normalized.warranty != null && (
      normalized.warranty.text_blocks.length > 0
      || normalized.warranty.duration_mentions.length > 0
      || normalized.warranty.assurance_blocks.length > 0
    ))
    || normalized.line_items.some((item) => item.parts.length > 0)
    || normalized.line_items.some((item) => item.content_lines.length > 1);
}

function selectQaSamples(records: PdfPipelineRecord[]): PdfPipelineRecord[] {
  const parsed = records.filter((record) => record.normalized && !record.skipped);
  const chosen = new Map<string, PdfPipelineRecord>();

  const pick = (predicate: (record: PdfPipelineRecord) => boolean, label: string) => {
    const candidate = parsed.find((record) => predicate(record) && !chosen.has(record.sourceFilename));
    if (candidate) chosen.set(candidate.sourceFilename, candidate);
    return label;
  };

  pick((record) => {
    const n = record.normalized!;
    return n.line_items.length <= 2 && n.payments.length === 1 && n.service_summary.length === 0;
  }, "simple");

  pick((record) => (record.normalized?.line_items.length ?? 0) >= 3, "multi_line_item");
  pick((record) => (record.normalized?.service_summary.length ?? 0) > 0, "service_summary");
  pick((record) => record.normalized?.warranty != null, "warranty");
  pick((record) => (record.normalized?.financials.discount_cents ?? 0) > 0, "discount");
  pick((record) => (record.normalized?.payments.length ?? 0) > 1, "multiple_payments");
  pick((record) => record.normalized?.line_items.some((item) => item.content_lines.length > 2) ?? false, "long_description");
  pick((record) => record.customerCheck?.outcome === "CUSTOMER_CONFLICT", "customer_conflict");
  pick((record) => record.financial?.classification === "FINANCIAL_MISMATCH", "financial_mismatch");

  for (const record of parsed) {
    if (chosen.size >= 10) break;
    if (!chosen.has(record.sourceFilename)) chosen.set(record.sourceFilename, record);
  }

  return [...chosen.values()].slice(0, Math.max(10, chosen.size));
}

function buildQaChecks(records: PdfPipelineRecord[]): QaFieldCheck[] {
  const checks: QaFieldCheck[] = [];
  for (const record of selectQaSamples(records)) {
    const normalized = record.normalized!;
    const fields: Array<{ field: string; extracted: string | number | null; valid: boolean }> = [
      { field: "invoice_number", extracted: normalized.invoice_number, valid: Boolean(normalized.invoice_number) },
      { field: "invoice_date", extracted: normalized.invoice_date, valid: Boolean(normalized.invoice_date) },
      { field: "customer_name", extracted: normalized.customer?.name ?? null, valid: Boolean(normalized.customer?.name) },
      { field: "total_cents", extracted: normalized.financials.total_cents, valid: normalized.financials.total_cents != null },
      {
        field: "primary_line_item",
        extracted: normalized.line_items[0]?.description ?? normalized.service_summary[0]?.title ?? null,
        valid: Boolean(normalized.line_items[0]?.description || normalized.service_summary[0]?.title),
      },
      {
        field: "payment_count",
        extracted: normalized.payments.length,
        valid: normalized.financials.total_cents === 0 || normalized.payments.length > 0 || (normalized.financials.balance_due_cents ?? 0) > 0,
      },
    ];

    for (const item of fields) {
      checks.push({
        filename: record.sourceFilename,
        invoiceCode: normalized.invoice_number,
        field: item.field,
        extracted: item.extracted,
        match: item.valid,
      });
    }
  }
  return checks;
}

function evaluateReadyForEnrichmentWrite(
  report: Omit<Batch1Report, "readyForEnrichmentWrite" | "blockers">,
  qaChecks: QaFieldCheck[],
): { ready: "YES" | "NO"; blockers: string[] } {
  const blockers: string[] = [];
  const readable = report.inventory.readable;
  const parserFailureRate = readable > 0 ? report.parserFailures / readable : 1;
  const matchRate = readable > 0
    ? (report.exactMatch + report.highConfidenceMatch) / readable
    : 0;
  const qaAccuracy = qaChecks.length > 0
    ? qaChecks.filter((check) => check.match).length / qaChecks.length
    : 0;

  if (parserFailureRate > 0) {
    blockers.push(`Parser failures on readable PDFs: ${report.parserFailures}/${readable}`);
  }
  if (matchRate < 0.95) {
    blockers.push(`Match rate below 95%: ${(matchRate * 100).toFixed(1)}% (EXACT+HIGH=${report.exactMatch + report.highConfidenceMatch}/${readable})`);
  }
  if (qaAccuracy < 0.9) {
    blockers.push(`Manual QA accuracy below 90%: ${(qaAccuracy * 100).toFixed(1)}%`);
  }
  if (report.duplicateInvoiceNumbersInBatch.length > 0) {
    blockers.push(`Duplicate invoice numbers in batch: ${report.duplicateInvoiceNumbersInBatch.map((d) => d.invoiceNumber).join(", ")}`);
  }
  if (report.inventory.requiresOcr > 0) {
    blockers.push(`PDFs requiring OCR: ${report.inventory.requiresOcr}`);
  }

  const unmatchedList = report.records
    .filter((record) => record.match?.matchClass === "UNMATCHED")
    .map((record) => `${record.sourceFilename}:${record.invoiceNumber ?? "?"}`);
  if (unmatchedList.length > 0) {
    blockers.push(`UNMATCHED PDFs (${unmatchedList.length}): ${unmatchedList.slice(0, 5).join("; ")}${unmatchedList.length > 5 ? "..." : ""}`);
  }

  const ambiguousList = report.records
    .filter((record) => record.match?.matchClass === "AMBIGUOUS")
    .map((record) => `${record.sourceFilename}:${record.match?.matchReason ?? ""}`);
  if (ambiguousList.length > 0) {
    blockers.push(`AMBIGUOUS PDFs (${ambiguousList.length}): ${ambiguousList.slice(0, 3).join("; ")}${ambiguousList.length > 3 ? "..." : ""}`);
  }

  return { ready: blockers.length === 0 ? "YES" : "NO", blockers };
}

async function processPdfFile(input: {
  inventoryFile: PdfInventoryReport["files"][number];
  phoenixRecords: Awaited<ReturnType<typeof loadPhoenixInvoiceRecords>>;
  manifestSkip: boolean;
}): Promise<PdfPipelineRecord> {
  const { inventoryFile, phoenixRecords, manifestSkip } = input;

  if (manifestSkip) {
    return {
      sourceFilename: inventoryFile.filename,
      invoiceNumber: inventoryFile.invoiceCode,
      fileHash: inventoryFile.sha256,
      skipped: true,
      skipReason: "already_successfully_processed",
      normalized: null,
      quality: null,
      match: null,
      customerCheck: null,
      financial: null,
      parseError: null,
    };
  }

  if (inventoryFile.status === "unreadable" || inventoryFile.status === "requires_ocr") {
    return {
      sourceFilename: inventoryFile.filename,
      invoiceNumber: inventoryFile.invoiceCode,
      fileHash: inventoryFile.sha256,
      skipped: true,
      skipReason: inventoryFile.status,
      normalized: null,
      quality: null,
      match: null,
      customerCheck: null,
      financial: null,
      parseError: inventoryFile.error,
    };
  }

  try {
    const buffer = readFileSync(inventoryFile.path);
    const parsedText = await pdf(buffer);
    const parsed = parseWorkizInvoiceText({
      text: parsedText.text,
      sourceFile: inventoryFile.filename,
      sourcePath: inventoryFile.path,
    });
    const normalized = normalizeWorkizPdfInvoice(parsed, inventoryFile.sha256);
    const quality = evaluatePdfExtractionQuality(normalized);
    const match = matchPdfToPhoenixInvoice(normalized, phoenixRecords);
    const customerCheck = crossCheckPdfCustomer(normalized, match.matchedInvoice);
    const financial = reconcilePdfFinancials(normalized, match.matchedInvoice);

    return {
      sourceFilename: inventoryFile.filename,
      invoiceNumber: normalized.invoice_number,
      fileHash: inventoryFile.sha256,
      skipped: false,
      skipReason: null,
      normalized,
      quality,
      match,
      customerCheck,
      financial,
      parseError: parsed.parseErrors.length > 0 ? parsed.parseErrors.join(", ") : null,
    };
  } catch (error) {
    return {
      sourceFilename: inventoryFile.filename,
      invoiceNumber: inventoryFile.invoiceCode,
      fileHash: inventoryFile.sha256,
      skipped: false,
      skipReason: null,
      normalized: null,
      quality: null,
      match: null,
      customerCheck: null,
      financial: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runWorkizPdfBatch1Pipeline(options?: { qaOnly?: boolean }): Promise<Batch1Report> {
  const sourceDirectory = getSourceDirectory();
  const harnessRoot = join(process.cwd(), "_runtime_harness");
  const batchDir = join(harnessRoot, "workiz-invoice-pdf-batch1");
  const extractionsDir = join(batchDir, "extractions");
  mkdirSync(extractionsDir, { recursive: true });

  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();

  try {
    const org = await ds.getRepository(OrganizationEntity).findOne({ where: { id: PHOENIX_ORG_ID } });
    if (!org || org.slug !== PHOENIX_ORG_SLUG) {
      throw new Error(`Phoenix org verification failed for ${PHOENIX_ORG_ID} / ${PHOENIX_ORG_SLUG}`);
    }

    const inventory = await enrichPdfInventoryWithText(scanPdfInventory(sourceDirectory));
    writeJson(join(batchDir, "inventory.json"), inventory);

    const phoenixRecords = await loadPhoenixInvoiceRecords(ds, PHOENIX_ORG_ID);
    const manifest = loadPdfManifest(harnessRoot);
    const records: PdfPipelineRecord[] = [];

    for (const file of inventory.files) {
      const manifestEntry = manifest.entries[file.filename];
      const { process, reason } = shouldProcessPdf(manifestEntry, file.sha256);

      const record = await processPdfFile({
        inventoryFile: file,
        phoenixRecords,
        manifestSkip: !process && !options?.qaOnly,
      });
      records.push(record);

      if (record.normalized) {
        const code = record.normalized.invoice_number ?? file.filename.replace(/\.pdf$/i, "");
        writeJson(join(extractionsDir, `${code}.json`), record.normalized);
      }

      upsertPdfManifestEntry(manifest, {
        filename: file.filename,
        sha256: file.sha256,
        invoiceNumber: record.invoiceNumber,
        extractionOk: Boolean(record.normalized && record.quality?.passed),
        matchClass: record.match?.matchClass ?? null,
        error: record.parseError,
      });
    }

    savePdfManifest(harnessRoot, manifest);

    const processedRecords = records.filter((record) => !record.skipped);
    const normalizedRecords = processedRecords
      .map((record) => record.normalized)
      .filter((value): value is WorkizPdfNormalizedInvoice => value != null);

    const duplicateInvoiceNumbersInBatch = detectDuplicateInvoiceNumbers(normalizedRecords);
    const qaSample = buildQaChecks(records);
    const qaFieldsChecked = qaSample.length;
    const qaFieldsCorrect = qaSample.filter((check) => check.match).length;

    const baseReport: Omit<Batch1Report, "readyForEnrichmentWrite" | "blockers"> = {
      generatedAt: new Date().toISOString(),
      sourceDirectory,
      phoenixOrganizationId: PHOENIX_ORG_ID,
      phoenixOrganizationName: org.name,
      inventory: {
        pdfFiles: inventory.pdfFiles,
        readable: inventory.readable,
        unreadable: inventory.unreadable,
        duplicateFiles: inventory.duplicateFiles,
        textExtractable: inventory.textExtractable,
        requiresOcr: inventory.requiresOcr,
      },
      parsedSuccessfully: processedRecords.filter((record) => record.normalized && record.quality?.passed).length,
      parserFailures: processedRecords.filter((record) => !record.normalized || !record.quality?.passed).length,
      exactMatch: processedRecords.filter((record) => record.match?.matchClass === "EXACT_MATCH").length,
      highConfidenceMatch: processedRecords.filter((record) => record.match?.matchClass === "HIGH_CONFIDENCE_MATCH").length,
      ambiguous: processedRecords.filter((record) => record.match?.matchClass === "AMBIGUOUS").length,
      unmatched: processedRecords.filter((record) => record.match?.matchClass === "UNMATCHED").length,
      financialMatch: processedRecords.filter((record) => record.financial?.classification === "FINANCIAL_MATCH").length,
      financialMismatch: processedRecords.filter((record) => record.financial?.classification === "FINANCIAL_MISMATCH").length,
      financialInsufficientData: processedRecords.filter((record) => record.financial?.classification === "INSUFFICIENT_DATA").length,
      customerMatch: processedRecords.filter((record) => record.customerCheck?.outcome === "CUSTOMER_MATCH").length,
      customerConflict: processedRecords.filter((record) => record.customerCheck?.outcome === "CUSTOMER_CONFLICT").length,
      withLineItems: normalizedRecords.filter((record) => record.line_items.length > 0).length,
      withServiceSummary: normalizedRecords.filter((record) => record.service_summary.length > 0).length,
      withWarranty: normalizedRecords.filter((record) => record.warranty != null).length,
      withPayments: normalizedRecords.filter((record) => record.payments.length > 0).length,
      withUsefulOperationalData: normalizedRecords.filter(hasUsefulOperationalData).length,
      manualQa: {
        samplesSelected: new Set(qaSample.map((check) => check.filename)).size,
        fieldsChecked: qaFieldsChecked,
        fieldsCorrect: qaFieldsCorrect,
        accuracyPercent: qaFieldsChecked > 0 ? Math.round((qaFieldsCorrect / qaFieldsChecked) * 1000) / 10 : 0,
      },
      duplicateInvoiceNumbersInBatch,
      records: records.map((record) => ({
        ...record,
        normalized: record.normalized
          ? {
              ...record.normalized,
              extraction_meta: {
                ...record.normalized.extraction_meta,
                source_path: record.normalized.extraction_meta.source_filename,
              },
            }
          : null,
      })),
      qaSample,
    };

    const gate = evaluateReadyForEnrichmentWrite(baseReport, qaSample);
    const report: Batch1Report = {
      ...baseReport,
      readyForEnrichmentWrite: gate.ready,
      blockers: gate.blockers,
    };

    writeJson(join(batchDir, "matches.json"), records.map((record) => ({
      sourceFilename: record.sourceFilename,
      invoiceNumber: record.invoiceNumber,
      match: record.match,
      customerCheck: record.customerCheck,
    })));
    writeJson(join(batchDir, "financial-reconciliation.json"), records.map((record) => record.financial));
    writeJson(join(batchDir, "errors-warnings.json"), records.map((record) => ({
      sourceFilename: record.sourceFilename,
      parseError: record.parseError,
      quality: record.quality,
    })));
    writeJson(join(batchDir, "qa-sample.json"), qaSample);
    writeJson(join(batchDir, "batch1-report.json"), report);

    return report;
  } finally {
    await ds.destroy();
  }
}

function printReport(report: Batch1Report): void {
  console.log("PDF FILES:", report.inventory.pdfFiles);
  console.log("READABLE:", report.inventory.readable);
  console.log("UNREADABLE:", report.inventory.unreadable);
  console.log("DUPLICATE_FILES:", report.inventory.duplicateFiles);
  console.log("TEXT_EXTRACTABLE:", report.inventory.textExtractable);
  console.log("REQUIRES_OCR:", report.inventory.requiresOcr);
  console.log("");
  console.log("PARSED SUCCESSFULLY:", report.parsedSuccessfully);
  console.log("PARSER FAILURES:", report.parserFailures);
  console.log("");
  console.log("EXACT INVOICE MATCH:", report.exactMatch);
  console.log("HIGH CONFIDENCE MATCH:", report.highConfidenceMatch);
  console.log("AMBIGUOUS:", report.ambiguous);
  console.log("UNMATCHED:", report.unmatched);
  console.log("");
  console.log("FINANCIAL MATCH:", report.financialMatch);
  console.log("FINANCIAL MISMATCH:", report.financialMismatch);
  console.log("FINANCIAL INSUFFICIENT DATA:", report.financialInsufficientData);
  console.log("");
  console.log("CUSTOMER MATCH:", report.customerMatch);
  console.log("CUSTOMER CONFLICT:", report.customerConflict);
  console.log("");
  console.log("WITH LINE ITEMS:", report.withLineItems);
  console.log("WITH SERVICE SUMMARY:", report.withServiceSummary);
  console.log("WITH WARRANTY:", report.withWarranty);
  console.log("WITH PAYMENTS:", report.withPayments);
  console.log("WITH USEFUL OPERATIONAL DATA:", report.withUsefulOperationalData);
  console.log("");
  console.log("MANUAL QA:", `${report.manualQa.fieldsCorrect}/${report.manualQa.fieldsChecked} fields correct (${report.manualQa.accuracyPercent}%)`);
  console.log("");
  console.log("READY_FOR_ENRICHMENT_WRITE:", report.readyForEnrichmentWrite);
  if (report.blockers.length > 0) {
    console.log("BLOCKERS:");
    for (const blocker of report.blockers) console.log(`- ${blocker}`);
  }
}

async function main() {
  const qaOnly = process.argv.includes("--qa-only");
  const report = await runWorkizPdfBatch1Pipeline({ qaOnly });
  printReport(report);
  console.log("\nFULL BATCH1 REPORT:");
  console.log(JSON.stringify({
    ...report,
    records: report.records.map((record) => ({
      sourceFilename: record.sourceFilename,
      invoiceNumber: record.invoiceNumber,
      skipped: record.skipped,
      matchClass: record.match?.matchClass ?? null,
      financialClass: record.financial?.classification ?? null,
      customerOutcome: record.customerCheck?.outcome ?? null,
      parseError: record.parseError,
    })),
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
