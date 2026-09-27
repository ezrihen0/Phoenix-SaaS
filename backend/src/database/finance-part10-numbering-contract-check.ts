import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

const numberingPath = join(__dirname, "..", "crm", "invoice-numbering.service.ts");
const numberingSource = readFileSync(numberingPath, "utf8");
const persistencePath = join(__dirname, "..", "crm", "crm-document-persistence.ts");
const persistenceSource = readFileSync(persistencePath, "utf8");
const pipelinePath = join(__dirname, "..", "crm", "invoice-send-pipeline.service.ts");
const pipelineSource = readFileSync(pipelinePath, "utf8");

expect("InvoiceNumberingService uses organization sequence only (Phase 10 org-wide V1)", () => {
  assert.doesNotMatch(numberingSource, /allocateBranchDocumentNumber/);
  assert.doesNotMatch(numberingSource, /BranchInvoiceSequenceEntity/);
  assert.match(numberingSource, /pessimistic_write/);
  assert.match(numberingSource, /OrganizationInvoiceSequenceEntity/);
});

expect("InvoiceNumberingService does not use MAX(document_number)+1", () => {
  assert.doesNotMatch(numberingSource, /MAX\s*\(/i);
});

expect("persistInvoiceHeaderAndLineItems does not allocate document_number", () => {
  assert.doesNotMatch(persistenceSource, /document_number/);
  assert.doesNotMatch(persistenceSource, /InvoiceNumberingService/);
});

expect("send pipeline allocates document number before freeze", () => {
  assert.match(pipelineSource, /allocateDocumentNumberIfNeeded/);
  assert.match(pipelineSource, /freezeInvoiceRecord/);
  const allocIndex = pipelineSource.indexOf("allocateDocumentNumberIfNeeded");
  const freezeIndex = pipelineSource.indexOf("freezeInvoiceRecord");
  assert.ok(allocIndex >= 0 && freezeIndex >= 0 && allocIndex < freezeIndex);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("finance-part10-numbering-contract-check complete");
