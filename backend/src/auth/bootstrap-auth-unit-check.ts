/**
 * Bootstrap auth policy assertions (no DB).
 * Run: npm run auth:bootstrap:check --workspace backend
 */
import assert from "node:assert/strict";

import {
  DEV_BOOTSTRAP_DEFAULTS,
  isKnownDefaultBootstrapCredential,
  isProductionNodeEnv,
  resolveBootstrapDecision,
  shouldAutoAttachDefaultOrganizationMembership,
  shouldWarnAboutDefaultBootstrapCredentials,
} from "./bootstrap-auth.policy";

assert.equal(isProductionNodeEnv("production"), true);
assert.equal(isProductionNodeEnv("Production"), true);
assert.equal(isProductionNodeEnv("development"), false);
assert.equal(isProductionNodeEnv(undefined), false);

assert.equal(
  isKnownDefaultBootstrapCredential("admin@phoenixcrm.local", DEV_BOOTSTRAP_DEFAULTS.password),
  true,
);
assert.equal(
  isKnownDefaultBootstrapCredential("admin@wizfield.local", DEV_BOOTSTRAP_DEFAULTS.password),
  true,
);
assert.equal(
  isKnownDefaultBootstrapCredential("owner@phoenix.local", DEV_BOOTSTRAP_DEFAULTS.password),
  false,
);

assert.deepEqual(
  resolveBootstrapDecision({
    nodeEnv: "production",
    bootstrapEnabled: "false",
    adminEmail: "owner@phoenix.local",
    adminPassword: "StrongPass123!",
  }),
  { action: "skip", reason: "production_bootstrap_disabled" },
);

assert.deepEqual(
  resolveBootstrapDecision({
    nodeEnv: "production",
    bootstrapEnabled: "true",
    adminEmail: "admin@phoenixcrm.local",
    adminPassword: DEV_BOOTSTRAP_DEFAULTS.password,
  }),
  { action: "skip", reason: "production_default_bootstrap_credentials_rejected" },
);

assert.deepEqual(
  resolveBootstrapDecision({
    nodeEnv: "production",
    bootstrapEnabled: "true",
    adminEmail: "owner@phoenix.local",
    adminPassword: "StrongPass123!",
    adminName: "Phoenix Owner",
  }),
  {
    action: "run",
    adminEmail: "owner@phoenix.local",
    adminPassword: "StrongPass123!",
    adminName: "Phoenix Owner",
  },
);

assert.deepEqual(
  resolveBootstrapDecision({
    nodeEnv: "development",
  }),
  {
    action: "run",
    adminEmail: DEV_BOOTSTRAP_DEFAULTS.email,
    adminPassword: DEV_BOOTSTRAP_DEFAULTS.password,
    adminName: DEV_BOOTSTRAP_DEFAULTS.name,
  },
);

assert.equal(
  shouldWarnAboutDefaultBootstrapCredentials(
    "development",
    DEV_BOOTSTRAP_DEFAULTS.email,
    DEV_BOOTSTRAP_DEFAULTS.password,
  ),
  true,
);
assert.equal(
  shouldWarnAboutDefaultBootstrapCredentials(
    "production",
    DEV_BOOTSTRAP_DEFAULTS.email,
    DEV_BOOTSTRAP_DEFAULTS.password,
  ),
  false,
);

assert.equal(shouldAutoAttachDefaultOrganizationMembership("production"), false);
assert.equal(shouldAutoAttachDefaultOrganizationMembership("development"), true);

console.log("bootstrap-auth-unit-check: ok");
