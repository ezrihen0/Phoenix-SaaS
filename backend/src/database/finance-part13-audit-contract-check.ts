import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const backendRoot = join(__dirname, "..", "..");
const crmController = readFileSync(join(backendRoot, "src", "crm", "crm.controller.ts"), "utf8");
const auditEntity = readFileSync(
  join(backendRoot, "src", "database", "entities", "finance-audit-event.entity.ts"),
  "utf8",
);

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

expect("finance audit entity includes estimate lifecycle actions", () => {
  assert.match(auditEntity, /estimate\.upsert/);
  assert.match(auditEntity, /estimate\.approved/);
  assert.match(auditEntity, /estimate\.signed/);
  assert.match(auditEntity, /estimate\.rejected/);
  assert.match(auditEntity, /invoice\.number_allocated/);
});

expect("estimate upsert logs finance audit", () => {
  assert.match(crmController, /logEstimateFinanceAudit/);
});

expect("estimate approve logs finance audit", () => {
  const index = crmController.indexOf('@Post("estimates/:estimateId/approve")');
  assert.ok(index >= 0);
  const window = crmController.slice(index, index + 1800);
  assert.match(window, /action: "estimate\.approved"/);
});

expect("estimate sign logs finance audit", () => {
  const index = crmController.indexOf('@Post("estimates/:estimateId/sign")');
  assert.ok(index >= 0);
  const window = crmController.slice(index, index + 2000);
  assert.match(window, /action: "estimate\.signed"/);
});

expect("invoice send paths log number allocation when needed", () => {
  assert.match(crmController, /action: "invoice\.number_allocated"/);
});

expect("stored invoice PDF uses scoped native document lookup", () => {
  assert.match(crmController, /findNativeDocumentForInvoice/);
});

console.log("finance-part13-audit-contract-check complete");
