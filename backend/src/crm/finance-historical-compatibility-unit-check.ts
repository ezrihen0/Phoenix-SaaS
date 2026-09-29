import {
  buildPhoenixWorkizImportNotes,
  parsePhoenixWorkizImportNotes,
  provenanceMatchesBatch,
} from "../integrations/phoenix/phoenix-customer-import.provenance";
import { invoiceDocumentKinds } from "../database/entities/invoice-document.entity";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "../database/workiz/workiz-invoice-upsert";
import { assertHistoricalImportTargetOrganizationId } from "./finance-historical-import-contract";
import { buildHistoricalSnapshotAiReadModel } from "./historical-snapshot-read.helper";
import {
  INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3,
  type InvoiceCustomerFacingSnapshotV3,
} from "./invoice-customer-facing-snapshot.types";
import { summarizeInvoiceLedger } from "./invoice-financial-lifecycle.core";
import { resolveInvoiceDisplayNumber } from "./invoice-display-number";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

function minimalHistoricalJobShape() {
  return {
    customer_id: "00000000-0000-4000-8000-000000000010",
    title: "Historical service",
    requested_service_type: "fireplace_service",
    assigned_technician_id: null,
    scheduled_for: new Date("2020-06-01T12:00:00.000Z"),
    status: "completed" as const,
    service_address_line_1: "1 Main St",
    service_city: "Calgary",
    service_postal_code: "T2P1A1",
  };
}

function minimalV3Snapshot(): InvoiceCustomerFacingSnapshotV3 {
  return {
    schema_version: INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3,
    document_kind: "invoice",
    document_id: "00000000-0000-4000-8000-000000000020",
    invoice_id: "00000000-0000-4000-8000-000000000020",
    frozen_at: "2020-06-01T12:00:00.000Z",
    frozen_via: "sent",
    document_number: "1457",
    issued_at: "2020-06-01T12:00:00.000Z",
    due_at: null,
    business: {
      businessName: "Phoenix",
      displayInitials: "PH",
      phone: null,
      email: null,
      website: null,
      logoUrl: null,
      accentColor: null,
      paymentInstructions: null,
      businessLicense: null,
      gstNumber: null,
      warrantyMessage: null,
      invoicePdfFooter: null,
      companyAddress: null,
    },
    bill_to: {
      name: "Customer",
      company: null,
      email: null,
      phone: null,
      address_lines: ["1 Main St"],
    },
    service_location: { address_lines: ["1 Main St"] },
    job_reference: {
      job_id: "00000000-0000-4000-8000-000000000030",
      title: "Fireplace cleaning",
      service_type: "fireplace_service",
    },
    financial: {
      subtotal_cents: 10000,
      tax_rate_bps: 500,
      tax_cents: 500,
      total_cents: 10500,
      discount_cents: 0,
    },
    lines: [],
    copy: {
      description: "Annual service",
      customer_notes: null,
      terms_text: "Net 30",
      warranty_text: "90-day workmanship warranty",
      payment_instructions: "E-transfer",
      footer: null,
    },
    provenance: { organization_id: "00000000-0000-4000-8000-000000000001" },
    signature: {
      approved_at: null,
      signed_at: null,
      signed_by_name: null,
    },
  };
}

expect("HISTORICAL_CUSTOMER provenance round-trip", () => {
  const notes = buildPhoenixWorkizImportNotes({
    sourceSystem: "workiz",
    sourceCustomerId: "W-C-991",
    sourceReference: "row-12",
    importBatch: "batch-2026-09",
    importedAt: "2026-09-26T00:00:00.000Z",
  });
  const parsed = parsePhoenixWorkizImportNotes(notes);
  if (!parsed || parsed.sourceCustomerId !== "W-C-991") {
    throw new Error("parse failed");
  }
  if (!provenanceMatchesBatch(notes, "W-C-991", "batch-2026-09")) {
    throw new Error("batch match failed");
  }
});

expect("HISTORICAL_JOB shape without technician", () => {
  const job = minimalHistoricalJobShape();
  if (job.assigned_technician_id !== null || job.status !== "completed") {
    throw new Error(JSON.stringify(job));
  }
});

expect("HISTORICAL_INVOICE v3 snapshot representable", () => {
  const snapshot = minimalV3Snapshot();
  if (snapshot.document_number !== "1457" || snapshot.financial.total_cents !== 10500) {
    throw new Error("snapshot invalid");
  }
});

expect("PROVENANCE canonical number hides source code in display", () => {
  const display = resolveInvoiceDisplayNumber({
    id: "00000000-0000-4000-8000-000000000001",
    document_number: "1457",
    branding_snapshot_json: JSON.stringify({
      import_source: WORKIZ_HISTORICAL_IMPORT_SOURCE,
      workiz_invoice_code: "WZ-SECRET",
    }),
    customer_facing_snapshot_json: null,
  });
  if (display !== "1457" || display.includes("WZ")) {
    throw new Error(display);
  }
});

expect("NUMBERING document_number beats Workiz branding", () => {
  const display = resolveInvoiceDisplayNumber({
    id: "00000000-0000-4000-8000-000000000002",
    document_number: "2001",
    branding_snapshot_json: JSON.stringify({
      import_source: WORKIZ_HISTORICAL_IMPORT_SOURCE,
      workiz_invoice_code: "OLD-99",
    }),
    customer_facing_snapshot_json: null,
  });
  if (display !== "2001") {
    throw new Error(display);
  }
});

expect("PDF both document kinds allowed", () => {
  if (!invoiceDocumentKinds.includes("workiz_source_pdf") || !invoiceDocumentKinds.includes("native_customer_pdf")) {
    throw new Error(JSON.stringify(invoiceDocumentKinds));
  }
});

expect("PAYMENTS evidence-only paid does not imply native paid", () => {
  const native = summarizeInvoiceLedger({
    totalCents: 5000,
    legacyStatus: "paid",
    legacyPaidAt: new Date(),
    payments: [],
    financeOrigin: "native_wizfield",
  });
  if (native.lifecycleStatus !== "sent" || native.paidReason !== null) {
    throw new Error(JSON.stringify(native));
  }

  const workiz = summarizeInvoiceLedger({
    totalCents: 5000,
    legacyStatus: "paid",
    legacyPaidAt: new Date(),
    payments: [],
    financeOrigin: "workiz_historical",
  });
  if (workiz.lifecycleStatus !== "paid" || workiz.paidReason !== "legacy_status_migration") {
    throw new Error(JSON.stringify(workiz));
  }
});

expect("WARRANTY AI read model from v3 copy", () => {
  const ai = buildHistoricalSnapshotAiReadModel(minimalV3Snapshot());
  if (!ai || ai.warranty_text !== "90-day workmanship warranty" || ai.total_cents !== 10500) {
    throw new Error(JSON.stringify(ai));
  }
});

expect("TENANT import requires explicit organization id", () => {
  let threw = false;
  try {
    assertHistoricalImportTargetOrganizationId("");
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error("expected throw");
  }
  assertHistoricalImportTargetOrganizationId("00000000-0000-4000-8000-000000000099");
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("finance-historical-compatibility-unit-check complete");
