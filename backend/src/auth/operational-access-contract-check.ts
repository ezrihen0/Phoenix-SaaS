/**
 * Ensures staff controllers cannot rely on SessionGuard alone for operational APIs.
 * Run: npm run auth:operational-access:check --workspace backend
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const backendSrc = join(__dirname, "..");

function listControllerFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listControllerFiles(fullPath));
      continue;
    }
    if (entry.endsWith(".controller.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function readControllerSource(path: string) {
  return readFileSync(path, "utf8");
}

function isExemptStaffController(source: string, path: string) {
  if (source.includes("@Controller(\"api/auth\")")) {
    return true;
  }
  if (source.includes("@Controller(\"api/billing\")") && !source.includes("@Controller(\"api/billing/webhooks\")")) {
    return true;
  }
  if (source.includes("@Controller(\"api/billing/webhooks\")")) {
    return true;
  }
  if (source.includes("@Controller(\"api/public\")")) {
    return true;
  }
  if (source.includes("PortalSessionGuard")) {
    return true;
  }
  if (path.includes("webhook.controller.ts")) {
    return true;
  }
  if (source.includes("@Controller(\"api/marketing/oauth\")")) {
    return true;
  }
  if (source.includes("@Controller(\"telephony/telnyx\")")) {
    return true;
  }
  if (source.includes("@Controller(\"telephony/twilio")) {
    return true;
  }
  return false;
}

function usesSessionGuardOnly(source: string) {
  const hasSessionGuard = source.includes("SessionGuard");
  const hasOperationalGuard = source.includes("OperationalAccessGuard");
  const hasPortalGuard = source.includes("PortalSessionGuard");
  return hasSessionGuard && !hasOperationalGuard && !hasPortalGuard;
}

const controllerFiles = listControllerFiles(backendSrc);
const sessionOnlyStaffControllers = controllerFiles.filter((path) => {
  const source = readControllerSource(path);
  if (!source.includes("@Controller(\"api/")) {
    return false;
  }
  if (isExemptStaffController(source, path)) {
    return false;
  }
  return usesSessionGuardOnly(source);
});

assert.equal(
  sessionOnlyStaffControllers.length,
  0,
  `Staff controllers must not use SessionGuard without OperationalAccessGuard or an explicit exemption. Found: ${sessionOnlyStaffControllers.join(", ")}`,
);

const policySource = readFileSync(join(__dirname, "operational-access.policy.ts"), "utf8");
assert.match(policySource, /requiresOperationalAccess/);
assert.match(policySource, /\/api\/billing\/summary/);

const guardSource = readFileSync(join(__dirname, "global-operational-access.guard.ts"), "utf8");
assert.match(guardSource, /GlobalOperationalAccessGuard/);

console.log("auth:operational-access:check passed");
