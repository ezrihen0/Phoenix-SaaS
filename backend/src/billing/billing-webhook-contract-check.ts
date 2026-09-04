import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Stripe billing webhook removal guard (no DB, no server boot).
 * Run: npm run billing:webhook-contract-check --workspace backend
 */
export const STRIPE_WEBHOOK_RUNTIME_REMOVAL = {
  removedRoute: "POST /api/billing/webhooks/stripe",
  billingModuleRegistersWebhookController: false,
  stripeSdkImportedByBackendSource: false,
} as const;

const sourceRoot = join(__dirname, "..");
const billingModuleSource = readFileSync(join(sourceRoot, "billing/billing.module.ts"), "utf8");
const packageSource = readFileSync(join(sourceRoot, "..", "package.json"), "utf8");

function listSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }
    if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

const backendSources = listSourceFiles(sourceRoot)
  .filter((path) => !path.endsWith("billing-webhook-contract-check.ts"))
  .map((path) => readFileSync(path, "utf8"));

assert.equal(existsSync(join(sourceRoot, "billing/billing-webhook.controller.ts")), false);
assert.doesNotMatch(billingModuleSource, /BillingWebhookController|StripeWebhookService|StripeWebhookReceiptService/);
assert.doesNotMatch(packageSource, /"stripe"\s*:/);
assert.equal(
  backendSources.some((source) => source.includes("from \"stripe\"") || source.includes("require(\"stripe\")")),
  false,
);

console.log(JSON.stringify(STRIPE_WEBHOOK_RUNTIME_REMOVAL, null, 2));
console.log("billing:webhook-contract-check passed (Stripe webhook runtime removed)");

