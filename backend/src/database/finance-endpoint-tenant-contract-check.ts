import { readFileSync } from "node:fs";
import { join } from "node:path";

const controllerPath = join(__dirname, "..", "crm", "crm.controller.ts");
const source = readFileSync(controllerPath, "utf8");
const errors: string[] = [];

const financeHandlers = [
  '@Get("invoices")',
  '@Get("invoices/:invoiceId")',
  '@Put("jobs/:jobId/invoice")',
  '@Post("invoices/:invoiceId/payments")',
  '@Post("jobs/:jobId/invoice/convert-from-estimate")',
  '@Get("invoices/:invoiceId/pdf")',
];

for (const token of financeHandlers) {
  const index = source.indexOf(token);
  if (index < 0) {
    errors.push(`Missing handler token ${token}`);
    continue;
  }

  const window = source.slice(index, index + 1200);
  if (!window.includes("requireActiveOrganizationId")) {
    errors.push(`${token} must call requireActiveOrganizationId in handler body`);
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
