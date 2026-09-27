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

const controllerPath = join(__dirname, "crm.controller.ts");
const controllerSource = readFileSync(controllerPath, "utf8");

expect("upsertInvoice uses resolveNativeUpsertInvoiceStatus", () => {
  if (!controllerSource.includes("resolveNativeUpsertInvoiceStatus")) {
    throw new Error("crm.controller upsertInvoice must derive native invoice status via resolveNativeUpsertInvoiceStatus.");
  }
});

expect("updateJobStatus does not bulk-set invoice paid", () => {
  const jobStatusBlock = /if \(payload\.status === "paid"\)[\s\S]{0,400}invoicesRepository\.update/;
  if (jobStatusBlock.test(controllerSource)) {
    throw new Error("Job status paid must not write invoices.status = paid without ledger.");
  }
});

expect("invoice-native-ledger-policy defines paid-without-ledger guard", () => {
  const policyPath = join(__dirname, "invoice-native-ledger-policy.ts");
  const policySource = readFileSync(policyPath, "utf8");
  if (!policySource.includes("NativeInvoicePaidRequiresLedgerError")) {
    throw new Error("Missing NativeInvoicePaidRequiresLedgerError in invoice-native-ledger-policy.ts");
  }
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("invoice-ledger-native-write-contract-check complete");
