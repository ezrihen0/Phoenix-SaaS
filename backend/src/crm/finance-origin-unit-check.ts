import { classifyFinanceInvoiceOrigin } from "./finance-invoice-origin";
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

expect("workiz historical via import_source", () => {
  const origin = classifyFinanceInvoiceOrigin({
    branding_snapshot_json: JSON.stringify({ import_source: WORKIZ_HISTORICAL_IMPORT_SOURCE }),
    customer_facing_snapshot_json: null,
  });
  if (origin !== "workiz_historical") {
    throw new Error(origin);
  }
});

expect("native via customer snapshot", () => {
  const origin = classifyFinanceInvoiceOrigin({
    branding_snapshot_json: null,
    customer_facing_snapshot_json: JSON.stringify({ schema_version: 1 }),
  });
  if (origin !== "native_wizfield") {
    throw new Error(origin);
  }
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("finance-origin-unit-check complete");
