/**
 * Ensures staff operational APIs are protected by GlobalOperationalAccessGuard (APP_GUARD)
 * and/or explicit OperationalAccessGuard, with documented route-policy exemptions.
 * Run: npm run auth:operational-access:check --workspace backend
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { requiresOperationalAccess } from "./operational-access.policy";

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

function extractControllerRoutePrefix(source: string) {
  const match = source.match(/@Controller\(\s*["']([^"']+)["']\s*\)/);
  if (!match) {
    return null;
  }

  const raw = match[1].trim();
  return raw.startsWith("/") ? raw : `/${raw}`;
}

const authModuleSource = readFileSync(join(__dirname, "auth.module.ts"), "utf8");
assert.match(authModuleSource, /provide:\s*APP_GUARD/, "AuthModule must register APP_GUARD.");
assert.match(
  authModuleSource,
  /useExisting:\s*GlobalOperationalAccessGuard/,
  "APP_GUARD must use GlobalOperationalAccessGuard.",
);

const policySource = readFileSync(join(__dirname, "operational-access.policy.ts"), "utf8");
assert.match(policySource, /requiresOperationalAccess/);
assert.match(policySource, /\/api\/billing\/summary/);
assert.doesNotMatch(policySource, /\/api\/billing\/webhooks\//);

const guardSource = readFileSync(join(__dirname, "global-operational-access.guard.ts"), "utf8");
assert.match(guardSource, /GlobalOperationalAccessGuard/);
assert.match(
  guardSource,
  /requiresOperationalAccess/,
  "GlobalOperationalAccessGuard must enforce requiresOperationalAccess().",
);

const controllerFiles = listControllerFiles(backendSrc);

const explicitOperationalGuardControllers = controllerFiles.filter((path) => {
  const source = readControllerSource(path);
  return source.includes("@Controller(\"api/") && source.includes("OperationalAccessGuard");
});

assert.ok(
  explicitOperationalGuardControllers.length > 0,
  "At least one staff controller must retain explicit OperationalAccessGuard.",
);

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

for (const path of sessionOnlyStaffControllers) {
  const source = readControllerSource(path);
  const routePrefix = extractControllerRoutePrefix(source);
  assert.ok(
    routePrefix,
    `SessionGuard-only staff controller must declare @Controller route prefix: ${path}`,
  );
  assert.equal(
    requiresOperationalAccess(routePrefix),
    true,
    `SessionGuard-only staff controller ${path} must map to an operationally protected route prefix (${routePrefix}) covered by GlobalOperationalAccessGuard.`,
  );
}

console.log("auth:operational-access:check passed");
