import "dotenv/config";
import "reflect-metadata";

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { runAllfixCustomerCleanup } from "./workiz-allfix-customer-cleanup";
import { runWorkizFinalHistoricalCoverageAudit } from "./workiz-final-historical-coverage-audit";
import { runWorkizPdfBatch1Pipeline } from "./workiz-invoice-pdf-pipeline";
import { runWorkizPdfEnrichmentWrite } from "./workiz-invoice-pdf-enrichment-write";
import { runWorkizPdfEnrichmentVerify } from "./workiz-invoice-pdf-enrichment-verify";
import { runWorkizPdfAttach } from "./workiz-invoice-pdf-attach";
import { runWorkizPdfAttachVerify } from "./workiz-invoice-pdf-attach-verify";

const harnessRoot = join(process.cwd(), "_runtime_harness", "workiz-final-audit");

async function main(): Promise<void> {
  mkdirSync(harnessRoot, { recursive: true });
  const startedAt = new Date().toISOString();

  console.log("=== STEP 1: @allfix.ca preview ===");
  const allfixPreview = await runAllfixCustomerCleanup({ execute: false });
  writeFileSync(join(harnessRoot, "excluded-allfix-customers-preview.json"), JSON.stringify(allfixPreview, null, 2));

  console.log("=== STEP 2: @allfix.ca cleanup execute ===");
  const allfixExecute = await runAllfixCustomerCleanup({ execute: true });
  writeFileSync(join(harnessRoot, "excluded-allfix-customers.json"), JSON.stringify(allfixExecute, null, 2));

  console.log("=== STEP 3: Full PDF pipeline rescan ===");
  const batchReport = await runWorkizPdfBatch1Pipeline();

  console.log("=== STEP 4: PDF enrichment write ===");
  const enrichReport = await runWorkizPdfEnrichmentWrite();

  console.log("=== STEP 5: PDF attach ===");
  const attachReport = await runWorkizPdfAttach();

  console.log("=== STEP 6: Coverage audit ===");
  const coverageReport = await runWorkizFinalHistoricalCoverageAudit();

  console.log("=== STEP 7: Idempotency — enrichment second run ===");
  const enrichSecond = await runWorkizPdfEnrichmentWrite();
  const enrichVerify = await runWorkizPdfEnrichmentVerify({ secondRun: true });

  console.log("=== STEP 8: Idempotency — attach second run ===");
  const attachSecond = await runWorkizPdfAttach();
  const attachVerify = await runWorkizPdfAttachVerify({ secondRun: true });

  const masterReport = {
    generatedAt: new Date().toISOString(),
    startedAt,
    allfixPreview: {
      found: allfixPreview.allfixRecordsFound,
      blocked: allfixPreview.blockedFromRemoval,
    },
    allfixExecute: {
      found: allfixExecute.allfixRecordsFound,
      removed: allfixExecute.safelyRemoved,
      blocked: allfixExecute.blockedFromRemoval,
      remaining: allfixExecute.remainingAllfixCustomers,
    },
    pdfPipeline: {
      totalPdfFiles: batchReport.inventory.pdfFiles,
      exactMatch: batchReport.exactMatch,
      ambiguous: batchReport.ambiguous,
      unmatched: batchReport.unmatched,
      parsedSuccessfully: batchReport.parsedSuccessfully,
      parserFailures: batchReport.parserFailures,
    },
    enrichment: {
      enriched: enrichReport.enriched,
      skippedAlreadyEnriched: enrichReport.skippedAlreadyEnriched,
      customerConflictExcluded: enrichReport.customerConflictExcluded,
      unresolved: enrichReport.unresolved,
      errors: enrichReport.errors,
    },
    attach: {
      pdfDocumentsStored: attachReport.pdfDocumentsStored,
      skippedDuplicate: attachReport.skippedDuplicate,
    },
    coverage: coverageReport,
    idempotency: {
      secondEnrichmentChanges: enrichSecond.enriched,
      secondAttachChanges: attachSecond.pdfDocumentsStored,
      enrichVerify,
      attachVerify,
    },
  };

  writeFileSync(join(harnessRoot, "final-master-report.json"), JSON.stringify(masterReport, null, 2));

  console.log("\n=== FINAL MASTER REPORT ===");
  console.log(JSON.stringify(masterReport, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
