import assert from "node:assert/strict";

import { PHOENIX_INVOICE_DOCUMENT_SECTION_ORDER } from "./phoenix-invoice-document-view-model.types";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

expect("section order includes required semantic blocks", () => {
  const required = [
    "business_header",
    "document_meta",
    "bill_to",
    "service_location",
    "line_items",
    "financial_summary",
    "balance_due",
    "copy_blocks",
  ];
  for (const section of required) {
    assert.ok(PHOENIX_INVOICE_DOCUMENT_SECTION_ORDER.includes(section as never));
  }
});

console.log("phoenix-invoice-document-view-model-unit-check complete");
