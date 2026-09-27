import { normalizeInvoiceNumberSearchQuery, resolveInvoiceDisplayNumber } from "./invoice-display-number";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "../database/workiz/workiz-invoice-upsert";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

expect("assigned document number wins", () => {
  const value = resolveInvoiceDisplayNumber({
    id: "00000000-0000-4000-8000-000000000001",
    document_number: "1042",
    branding_snapshot_json: null,
    customer_facing_snapshot_json: null,
  });
  if (value !== "1042") {
    throw new Error(value);
  }
});

expect("workiz historical provenance wins over draft uuid", () => {
  const value = resolveInvoiceDisplayNumber({
    id: "00000000-0000-4000-8000-000000000001",
    document_number: null,
    customer_facing_snapshot_json: null,
    branding_snapshot_json: JSON.stringify({
      import_source: WORKIZ_HISTORICAL_IMPORT_SOURCE,
      workiz_invoice_code: "WZ-7781",
    }),
  });
  if (value !== "WZ-7781") {
    throw new Error(value);
  }
});

expect("native draft ignores workiz branding without historical import", () => {
  const value = resolveInvoiceDisplayNumber({
    id: "00000000-0000-4000-8000-000000000001",
    document_number: null,
    customer_facing_snapshot_json: null,
    branding_snapshot_json: JSON.stringify({ workiz_invoice_code: "WZ-7781" }),
  });
  if (value !== "INV-00000000") {
    throw new Error(value);
  }
});

expect("normalizeInvoiceNumberSearchQuery strips INV prefix", () => {
  if (normalizeInvoiceNumberSearchQuery("INV-1042") !== "1042") {
    throw new Error("expected 1042");
  }
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("invoice-display-number-unit-check complete");
