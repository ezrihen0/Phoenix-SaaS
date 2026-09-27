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
const frontendRoot = join(backendRoot, "..", "frontend");

const portalPage = readFileSync(join(frontendRoot, "app", "portal", "page.tsx"), "utf8");
const invoicesPage = readFileSync(join(frontendRoot, "app", "invoices", "page.tsx"), "utf8");
const jobDetailWorkspace = readFileSync(
  join(frontendRoot, "app", "jobs", "[jobId]", "job-detail-workspace.tsx"),
  "utf8",
);
const customerProfile = readFileSync(
  join(frontendRoot, "app", "customers", "[customerId]", "customer-profile-workspace.tsx"),
  "utf8",
);
const crmController = readFileSync(join(backendRoot, "src", "crm", "crm.controller.ts"), "utf8");
const dashboardService = readFileSync(join(backendRoot, "src", "crm", "crm-office-dashboard.service.ts"), "utf8");
const portalService = readFileSync(join(backendRoot, "src", "customer-portal", "customer-portal.service.ts"), "utf8");

expect("portal home UI references lifecycle_status", () => {
  assert.match(portalPage, /lifecycle_status/);
  assert.match(portalPage, /balance_cents/);
});

expect("invoices list paid metrics use lifecycle_status", () => {
  assert.doesNotMatch(invoicesPage, /filter\(\(invoice\) => invoice\.status === "paid"\)/);
  assert.match(invoicesPage, /lifecycle_status/);
});

expect("job detail header uses invoice lifecycle not legacy status uppercase", () => {
  assert.match(jobDetailWorkspace, /lifecycle_status/);
  assert.doesNotMatch(jobDetailWorkspace, /invoice\.status\?\.toUpperCase\(\)/);
});

expect("customer profile can consume finance_summary", () => {
  assert.match(customerProfile, /financeSummary|openBalanceCents/);
});

expect("customer detail API exposes finance_summary", () => {
  assert.match(crmController, /finance_summary/);
});

expect("job detail enriches invoice with document_number", () => {
  assert.match(crmController, /document_number/);
  assert.match(crmController, /buildJobInvoiceEmbed|buildListPresentation/);
});

expect("dashboard open invoices require positive balance", () => {
  assert.match(dashboardService, /balanceCents > 0/);
});

expect("portal home payload includes lifecycle on invoice rows", () => {
  assert.match(portalService, /lifecycle_status: ledger\.lifecycleStatus/);
});

expect("estimate detail exposes converted invoice pointer", () => {
  assert.match(crmController, /converted_invoice_id/);
});

console.log("finance-part12-cross-surface-contract-check complete");
