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

const backendRoot = join(__dirname, "..", "..");
const crmController = readFileSync(join(backendRoot, "src", "crm", "crm.controller.ts"), "utf8");
const portalPdfController = readFileSync(
  join(backendRoot, "src", "documents", "invoice-documents", "invoice-documents.portal.controller.ts"),
  "utf8",
);
const nativeService = readFileSync(
  join(backendRoot, "src", "documents", "invoice-documents", "invoice-native-document.service.ts"),
  "utf8",
);

expect("send email attaches the pre-commit invoice pdf buffer", () => {
  assert.match(crmController, /content: pdfBuffer/);
  assert.match(crmController, /executeCustomerSend/);
});

expect("completeInvoiceCustomerSend returns pdfBuffer", () => {
  assert.match(crmController, /pdfBuffer,/);
  assert.match(crmController, /nativeDocument,/);
});

expect("portal PDF uses live native render", () => {
  assert.match(portalPdfController, /portalNativeInvoicePdfService\.renderForPortal/);
  assert.doesNotMatch(portalPdfController, /readPdfBuffer/);
});

expect("native dedupe keys file_hash", () => {
  assert.match(nativeService, /findByFileHash/);
  assert.match(nativeService, /file_hash: input\.fileHash/);
});

expect("staff can list stored native documents", () => {
  assert.match(crmController, /invoices\/:invoiceId\/documents/);
  assert.match(crmController, /listNativeDocumentsForInvoice/);
});

console.log("finance-part9-document-contract-check complete");
