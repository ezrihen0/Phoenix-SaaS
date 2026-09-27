import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import { InvoiceCustomerFacingSnapshotService } from "../crm/invoice-customer-facing-snapshot.service";
import type { CustomerEntity } from "./entities/customer.entity";
import type { InvoiceEntity } from "./entities/invoice.entity";
import type { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import type { JobEntity } from "./entities/job.entity";
import { INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3 } from "../crm/invoice-customer-facing-snapshot.types";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

const controllerPath = join(__dirname, "..", "crm", "crm.controller.ts");
const controllerSource = readFileSync(controllerPath, "utf8");

expect("upsertInvoice rejects frozen customer-facing snapshot with 409", () => {
  const marker = '@Put("jobs/:jobId/invoice")';
  const index = controllerSource.indexOf(marker);
  assert.ok(index >= 0, "upsertInvoice handler missing");
  const window = controllerSource.slice(index, index + 2500);
  assert.match(window, /isFrozen\(existingInvoice\)/);
  assert.match(window, /invoice_customer_snapshot_frozen/);
  assert.match(window, /409/);
});

expect("upsertQuote rejects frozen estimate snapshot with 409", () => {
  const marker = '@Put("jobs/:jobId/quote")';
  const index = controllerSource.indexOf(marker);
  assert.ok(index >= 0, "upsertQuote handler missing");
  const window = controllerSource.slice(index, index + 3500);
  assert.match(window, /estimate_customer_snapshot_frozen/);
  assert.match(window, /maybeFreezeEstimateCustomerFacingSnapshot/);
});

expect("send pipeline service freezes snapshot on finalizeCustomerFacingSend", () => {
  const pipelinePath = join(__dirname, "..", "crm", "invoice-send-pipeline.service.ts");
  const pipelineSource = readFileSync(pipelinePath, "utf8");
  assert.match(pipelineSource, /freezeInvoiceRecord/);
  assert.match(pipelineSource, /allocateDocumentNumberIfNeeded/);
  assert.match(pipelineSource, /branch/);
});

function buildHarnessSnapshotService() {
  return new InvoiceCustomerFacingSnapshotService(new DocumentBrandingSnapshotService());
}

expect("freezeInvoiceRecord writes snapshot and isFrozen blocks further edits", () => {
  const service = buildHarnessSnapshotService();
  const frozenAt = new Date("2026-01-15T12:00:00.000Z");
  const invoice = {
    id: "inv-1",
    description: "Harness invoice",
    issued_at: frozenAt,
    due_at: null,
    subtotal_cents: 10_000,
    tax_cents: 0,
    tax_rate_bps_snapshot: 0,
    total_cents: 10_000,
    amount_cents: 10_000,
    customer_facing_snapshot_json: null,
    branding_snapshot_json: null,
  } as InvoiceEntity;

  const lineItem = {
    id: "line-1",
    sort_order: 0,
    name_snapshot: "Line A",
    description_snapshot: "Desc",
    quantity: "1",
    unit_price_cents_snapshot: 10_000,
    line_subtotal_cents: 10_000,
  } as InvoiceLineItemEntity;

  const job = {
    id: "job-1",
    title: "Job title",
    requested_service_type: "inspection",
    service_address_line_1: "99 Service Road",
    service_address_line_2: null,
    service_city: "Jobville",
    service_state_or_region: "AB",
    service_postal_code: "J0J0J0",
  } as JobEntity;

  const customer = {
    full_name: "Test Customer",
    company_name: null,
    email: "test@example.com",
    phone: "5550000",
    service_address_line_1: "1 Main",
    service_address_line_2: null,
    service_city: "City",
    service_state_or_region: null,
    service_postal_code: "A1A1A1",
  } as CustomerEntity;

  const first = service.freezeInvoiceRecord({
    invoice,
    lineItems: [lineItem],
    customer,
    job,
    orgSettings: null,
    documentNumber: "1001",
    frozenAt,
    frozenVia: "email",
    organizationId: "org-harness",
  });

  assert.ok(invoice.customer_facing_snapshot_json?.trim());
  assert.equal(service.isFrozen(invoice), true);
  assert.equal(first.document_number, "1001");
  assert.equal(first.schema_version, INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3);
  assert.notDeepEqual(first.bill_to.address_lines, first.service_location.address_lines);
  assert.match(first.service_location.address_lines.join(" "), /99 Service Road/);

  const second = service.freezeInvoiceRecord({
    invoice,
    lineItems: [lineItem],
    customer,
    job,
    orgSettings: null,
    documentNumber: "9999",
    frozenAt: new Date(),
    frozenVia: "sms",
    organizationId: "org-harness",
  });

  assert.equal(second.document_number, "1001", "second freeze must not rewrite snapshot");
});

console.log("finance-send-snapshot-contract-check complete");
