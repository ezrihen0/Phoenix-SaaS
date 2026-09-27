import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const backendRoot = join(__dirname, "..", "..");
const crmController = readFileSync(join(backendRoot, "src", "crm", "crm.controller.ts"), "utf8");

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

expect("invoice send-email requires canManageInvoiceResource", () => {
  const index = crmController.indexOf('@Post("invoices/:invoiceId/send-email")');
  assert.ok(index >= 0);
  const window = crmController.slice(index, index + 2200);
  assert.match(window, /canManageInvoiceResource/);
});

expect("invoice send-sms requires canManageInvoiceResource", () => {
  const index = crmController.indexOf('@Post("invoices/:invoiceId/send-sms")');
  assert.ok(index >= 0);
  const window = crmController.slice(index, index + 1800);
  assert.match(window, /canManageInvoiceResource/);
});

expect("invoice payments require invoices.payment.manage", () => {
  const index = crmController.indexOf('@Post("invoices/:invoiceId/payments")');
  assert.ok(index >= 0);
  const window = crmController.slice(index, index + 800);
  assert.match(window, /invoices\.payment\.manage/);
});

expect("estimate conversion delegates manage check to conversion service", () => {
  assert.match(crmController, /estimateInvoiceConversionService\.convertFromEstimate/);
});

console.log("finance-part13-rbac-contract-check complete");
