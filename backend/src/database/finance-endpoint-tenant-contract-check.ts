import { readFileSync } from "node:fs";
import { join } from "node:path";

const backendRoot = join(__dirname, "..", "..");
const crmControllerPath = join(backendRoot, "src", "crm", "crm.controller.ts");
const portalReadPath = join(backendRoot, "src", "customer-portal", "customer-portal.read.controller.ts");
const portalPdfPath = join(
  backendRoot,
  "src",
  "documents",
  "invoice-documents",
  "invoice-documents.portal.controller.ts",
);

const crmSource = readFileSync(crmControllerPath, "utf8");
const portalReadSource = readFileSync(portalReadPath, "utf8");
const portalPdfSource = readFileSync(portalPdfPath, "utf8");
const errors: string[] = [];

const crmFinanceHandlers = [
  '@Put("jobs/:jobId/quote")',
  '@Get("invoices")',
  '@Get("invoices/:invoiceId")',
  '@Get("invoices/:invoiceId/pdf")',
  '@Get("invoices/:invoiceId/documents")',
  '@Get("invoices/:invoiceId/documents/:documentId/pdf")',
  '@Post("invoices/:invoiceId/send-email")',
  '@Post("invoices/:invoiceId/send-sms")',
  '@Post("invoices/:invoiceId/request-approval")',
  '@Post("invoices/:invoiceId/approve")',
  '@Post("invoices/:invoiceId/request-signature")',
  '@Post("invoices/:invoiceId/sign")',
  '@Post("invoices/:invoiceId/open")',
  '@Post("invoices/:invoiceId/payments")',
  '@Get("estimates")',
  '@Get("estimates/:estimateId")',
  '@Post("estimates/:estimateId/request-approval")',
  '@Post("estimates/:estimateId/approve")',
  '@Post("estimates/:estimateId/request-signature")',
  '@Post("estimates/:estimateId/sign")',
  '@Put("jobs/:jobId/invoice")',
  '@Post("jobs/:jobId/invoice/convert-from-estimate")',
];

for (const token of crmFinanceHandlers) {
  const index = crmSource.indexOf(token);
  if (index < 0) {
    errors.push(`Missing CRM handler token ${token}`);
    continue;
  }

  const window = crmSource.slice(index, index + 1400);
  if (!window.includes("requireActiveOrganizationId")) {
    errors.push(`${token} must call requireActiveOrganizationId in handler body`);
  }
}

const portalHandlers = [
  { file: "customer-portal.read.controller.ts", token: '@Get("invoices/:invoiceId/document-view")', source: portalReadSource },
  { file: "invoice-documents.portal.controller.ts", token: '@Get(":invoiceId/pdf")', source: portalPdfSource },
];

for (const handler of portalHandlers) {
  const index = handler.source.indexOf(handler.token);
  if (index < 0) {
    errors.push(`Missing portal handler ${handler.token} in ${handler.file}`);
    continue;
  }

  const window = handler.source.slice(index, index + 900);
  if (!window.includes("organizationId") || !window.includes("portalSession")) {
    errors.push(`${handler.token} must resolve organization from portal session`);
  }
}

if (errors.length) {
  console.error("finance-endpoint-tenant-contract-check failed:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log("finance-endpoint-tenant-contract-check complete");
