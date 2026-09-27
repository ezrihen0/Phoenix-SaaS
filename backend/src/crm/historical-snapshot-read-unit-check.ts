import assert from "node:assert/strict";

import {
  INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3,
  type InvoiceCustomerFacingSnapshotV3,
} from "./invoice-customer-facing-snapshot.types";
import { buildHistoricalSnapshotAiReadModel, snapshotPortalLineItems } from "./historical-snapshot-read.helper";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

const sampleV3: InvoiceCustomerFacingSnapshotV3 = {
  schema_version: INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3,
  document_kind: "invoice",
  document_id: "doc-1",
  invoice_id: "doc-1",
  frozen_at: "2026-01-01T00:00:00.000Z",
  frozen_via: "email",
  document_number: "1001",
  issued_at: "2026-01-01T00:00:00.000Z",
  due_at: null,
  business: {
    businessName: "Biz",
    displayInitials: "BZ",
    phone: null,
    email: null,
    website: null,
    logoUrl: null,
    accentColor: null,
    paymentInstructions: "Pay us",
    businessLicense: null,
    gstNumber: null,
    warrantyMessage: "Warranty",
    invoicePdfFooter: "Terms",
    companyAddress: null,
  },
  bill_to: {
    name: "Customer",
    company: null,
    email: null,
    phone: null,
    address_lines: ["1 Bill St"],
  },
  service_location: {
    address_lines: ["9 Job Ave"],
  },
  job_reference: {
    job_id: "job-1",
    title: "Job title",
    service_type: "inspection",
  },
  financial: {
    subtotal_cents: 1000,
    tax_rate_bps: 0,
    tax_cents: 0,
    total_cents: 1000,
    discount_cents: 0,
  },
  lines: [
    {
      id: "line-1",
      name: "Line",
      description: null,
      quantity: "1",
      unit_price_cents: 1000,
      line_subtotal_cents: 1000,
      warranty_months: null,
    },
  ],
  copy: {
    description: "From copy block",
    customer_notes: null,
    terms_text: "Terms copy",
    warranty_text: "Warranty copy",
    payment_instructions: "Pay copy",
    footer: "Footer copy",
  },
  provenance: {
    organization_id: "org-1",
  },
  signature: {
    approved_at: null,
    signed_at: null,
    signed_by_name: null,
  },
};

expect("AI read model prefers v3 copy blocks", () => {
  const model = buildHistoricalSnapshotAiReadModel(sampleV3);
  assert.ok(model);
  assert.equal(model.description, "From copy block");
  assert.equal(model.warranty_text, "Warranty copy");
  assert.equal(model.terms_text, "Terms copy");
  assert.equal(model.payment_instructions, "Pay copy");
  assert.deepEqual(model.service_location_lines, ["9 Job Ave"]);
});

expect("portal line items map from frozen snapshot lines", () => {
  const lines = snapshotPortalLineItems(sampleV3);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.name, "Line");
  assert.equal(lines[0]?.line_subtotal_cents, 1000);
});

console.log("historical-snapshot-read-unit-check complete");
