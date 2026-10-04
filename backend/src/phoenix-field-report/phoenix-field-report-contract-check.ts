import { readFileSync } from "fs";
import { join } from "path";

function expectIncludes(haystack: string, needle: string, label: string) {
  if (!haystack.includes(needle)) {
    throw new Error(label);
  }
}

function expectExcludes(haystack: string, needle: string, label: string) {
  if (haystack.includes(needle)) {
    throw new Error(label);
  }
}

const root = join(__dirname);
const importSource = readFileSync(join(root, "phoenix-field-report-import.service.ts"), "utf8");
const controllerSource = readFileSync(join(root, "phoenix-field-report.controller.ts"), "utf8");
const accessSource = readFileSync(join(root, "phoenix-field-report-access.service.ts"), "utf8");

expectIncludes(accessSource, "PHOENIX_FIELD_REPORT_ORG_SLUG", "Access service must enforce Phoenix org slug.");
expectExcludes(accessSource, "MICHAEL_HISTORICAL_REPORT_USER_EMAIL", "Access must not use email allowlist env.");
expectIncludes(controllerSource, "PhoenixFieldReportAccessGuard", "Controller must use access guard.");
expectIncludes(controllerSource, "SessionGuard", "Controller must use session guard.");
expectExcludes(importSource, "InvoiceSendPipelineService", "Import must not call invoice send pipeline.");
expectExcludes(importSource, "WarrantyCertificatesService", "Import must not issue warranty certificates.");
expectIncludes(importSource, "InvoicePaymentRecordingService", "Import must record payments via ledger service.");
expectIncludes(importSource, "persistInvoiceHeaderAndLineItems", "Import must persist invoices via canonical helper.");
expectIncludes(importSource, "computeTaxInclusiveDocumentTotals", "Import must split tax-inclusive totals.");

console.log("phoenix-field-report-contract-check complete");
