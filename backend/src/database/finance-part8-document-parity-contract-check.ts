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
const portalRead = readFileSync(join(backendRoot, "src", "customer-portal", "customer-portal.read.controller.ts"), "utf8");
const invoicePage = readFileSync(join(backendRoot, "..", "frontend", "app", "invoices", "[invoiceId]", "page.tsx"), "utf8");
const portalInvoicePage = readFileSync(
  join(backendRoot, "..", "frontend", "app", "portal", "invoices", "[invoiceId]", "page.tsx"),
  "utf8",
);

expect("CRM invoice detail exposes document_view from presentation service", () => {
  assert.match(crmController, /document_view: documentView/);
  assert.match(crmController, /phoenixInvoiceDocumentPresentationService\.buildInvoiceDocumentView/);
});

expect("portal document-view endpoint exists", () => {
  assert.match(portalRead, /invoices\/:invoiceId\/document-view/);
  assert.match(portalRead, /getDocumentViewForPortal/);
});

expect("staff and portal HTML use Phoenix invoice document template", () => {
  assert.match(invoicePage, /PhoenixInvoiceDocumentTemplate/);
  assert.match(invoicePage, /document_view/);
  assert.match(portalInvoicePage, /PhoenixInvoiceDocumentTemplate/);
});

expect("PDF buffer uses presentation service builder", () => {
  assert.match(crmController, /phoenixInvoiceDocumentPresentationService\.buildInvoiceDocumentView/);
  assert.match(crmController, /invoicePdfService\.renderInvoicePdf\(viewModel\)/);
});

console.log("finance-part8-document-parity-contract-check complete");
