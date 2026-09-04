/**
 * Part 3 static regression checkpoint.
 * Run: npm run part3:checkpoint --workspace backend
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourceRoot = join(__dirname, "..");
const repoRoot = join(__dirname, "..", "..", "..");
const errors: string[] = [];

function read(relativePath: string) {
  return readFileSync(join(sourceRoot, relativePath), "utf8");
}

function readRepo(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function expectIncludes(relativePath: string, token: string, message: string) {
  const source = read(relativePath);
  if (!source.includes(token)) {
    errors.push(`${relativePath}: ${message}`);
  }
}

function expectRepoIncludes(relativePath: string, token: string, message: string) {
  const source = readRepo(relativePath);
  if (!source.includes(token)) {
    errors.push(`${relativePath}: ${message}`);
  }
}

expectIncludes("billing/plan-catalog-contract-check.ts", "PLAN_CATALOG", "Part 3 plan catalog contract check must exist.");
expectIncludes("billing/billing-webhook-contract-check.ts", "STRIPE_WEBHOOK_RUNTIME_REMOVAL", "Part 3 Stripe webhook removal guard must exist.");
expectIncludes("billing/billing-webhook-contract-check.ts", "Stripe webhook runtime removed", "Stripe webhook runtime must remain removed.");
expectIncludes("billing/billing-orchestration.service.ts", "reconcileBillingAccountWithManager", "Billing snapshot must reconcile entitlements in transaction.");
expectIncludes("database/entities/stripe-webhook-event-receipt.entity.ts", "stripe_webhook_event_receipts", "Stripe webhook receipt entity must exist.");
expectIncludes("config/production-config.validator.ts", "validateProductionConfig", "Production config validator must exist.");
expectIncludes("security/secrets-check.ts", "security:secrets-check", "Secrets safety check must exist.");
expectIncludes("common/health.controller.ts", "@Controller(\"api/health\")", "Health endpoint must exist.");
expectIncludes("auth/global-operational-access.guard.ts", "requiresOperationalAccess", "Global operational access guard must exist.");
expectIncludes("auth/operational-access-contract-check.ts", "doesNotMatch", "Operational access policy must not exempt removed billing webhooks.");
expectIncludes("database/billing-lifecycle-smoke.ts", "local active billing state", "Billing lifecycle smoke must verify local billing access.");
expectIncludes("database/billing-activation-smoke.ts", "/home without Stripe", "Billing activation smoke must verify direct home routing without Stripe.");
expectIncludes("database/billing-multi-org-smoke.ts", "organization_limit_reached", "Multi-org billing smoke must verify org limits.");
expectIncludes("database/operational-access-isolation-smoke.ts", "requiresOperationalAccess", "Operational access isolation smoke must verify route policy.");
expectIncludes("database/part3-deployment-check.ts", "part3:deployment-check", "Part 3 deployment check orchestrator must exist.");

expectRepoIncludes("backend/package.json", "part3:suite", "Part 3 suite script must be registered.");
expectRepoIncludes("backend/package.json", "auth:operational-access:check", "Operational access check script must be registered.");
expectRepoIncludes("backend/src/app.module.ts", "HealthModule", "App module must import HealthModule.");
expectRepoIncludes("backend/src/main.ts", "assertProductionConfigValid", "Production boot validation must be wired in main.ts.");

if (errors.length) {
  console.error("part3_regression_checkpoint_fail:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log("part3_regression_checkpoint: ok");
