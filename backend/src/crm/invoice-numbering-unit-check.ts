import assert from "node:assert/strict";

import { DEFAULT_INVOICE_SEQUENCE_START } from "./invoice-numbering.service";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

expect("default sequence start is 1001", () => {
  assert.equal(DEFAULT_INVOICE_SEQUENCE_START, 1001);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("invoice-numbering-unit-check complete");
