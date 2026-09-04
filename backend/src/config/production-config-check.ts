/**
 * Production config validator unit checks (no server boot).
 * Run: npm run production-config:check --workspace backend
 */
import assert from "node:assert/strict";

import {
  assertProductionConfigValid,
  validateProductionConfig,
} from "./production-config.validator";

const permissiveDev = validateProductionConfig({
  NODE_ENV: "development",
  SESSION_COOKIE_SECURE: "false",
  CORS_ORIGIN: "http://localhost:3000",
  DB_SYNCHRONIZE: "true",
});
assert.equal(permissiveDev.ok, true, "Development env should remain permissive.");

const validProduction = validateProductionConfig({
  NODE_ENV: "production",
  SESSION_COOKIE_SECURE: "true",
  CORS_ORIGIN: "https://app.wizfield.com",
  DB_HOST: "db.internal",
  DB_USERNAME: "wizfield",
  DB_NAME: "wizfield",
  DB_TYPE: "mysql",
  DB_SYNCHRONIZE: "false",
  BACKEND_BOOTSTRAP_ENABLED: "false",
});
assert.equal(validProduction.ok, true, "Valid production fixture should pass without Stripe configuration.");

const insecureProduction = validateProductionConfig({
  NODE_ENV: "production",
  SESSION_COOKIE_SECURE: "false",
  CORS_ORIGIN: "http://localhost:3000",
  DB_HOST: "db.internal",
  DB_USERNAME: "wizfield",
  DB_NAME: "wizfield",
  DB_SYNCHRONIZE: "true",
});
assert.equal(insecureProduction.ok, false);
assert.ok(insecureProduction.errors.some((issue) => issue.code === "session_cookie_insecure"));
assert.ok(insecureProduction.errors.some((issue) => issue.code === "cors_origin_localhost"));
assert.ok(insecureProduction.errors.some((issue) => issue.code === "db_synchronize_enabled"));

const bootstrapProduction = validateProductionConfig({
  NODE_ENV: "production",
  SESSION_COOKIE_SECURE: "true",
  CORS_ORIGIN: "https://app.wizfield.com",
  DB_HOST: "db.internal",
  DB_USERNAME: "wizfield",
  DB_NAME: "wizfield",
  DB_TYPE: "mysql",
  DB_SYNCHRONIZE: "false",
  BACKEND_BOOTSTRAP_ENABLED: "true",
  BACKEND_BOOTSTRAP_ADMIN_EMAIL: "owner@phoenix.local",
  BACKEND_BOOTSTRAP_ADMIN_PASSWORD: "StrongPass123!",
});
assert.equal(bootstrapProduction.ok, false);
assert.ok(bootstrapProduction.errors.some((issue) => issue.code === "bootstrap_enabled_in_production"));

const bootstrapDefaultProduction = validateProductionConfig({
  NODE_ENV: "production",
  SESSION_COOKIE_SECURE: "true",
  CORS_ORIGIN: "https://app.wizfield.com",
  DB_HOST: "db.internal",
  DB_USERNAME: "wizfield",
  DB_NAME: "wizfield",
  DB_TYPE: "mysql",
  DB_SYNCHRONIZE: "false",
  BACKEND_BOOTSTRAP_ENABLED: "false",
  BACKEND_BOOTSTRAP_ADMIN_EMAIL: "admin@wizfield.local",
  BACKEND_BOOTSTRAP_ADMIN_PASSWORD: "Admin12345!",
});
assert.equal(bootstrapDefaultProduction.ok, false);
assert.ok(bootstrapDefaultProduction.errors.some((issue) => issue.code === "bootstrap_default_credentials_present"));

assert.doesNotThrow(() => assertProductionConfigValid({
  NODE_ENV: "production",
  SESSION_COOKIE_SECURE: "true",
  CORS_ORIGIN: "https://app.wizfield.com",
  DB_HOST: "db.internal",
  DB_USERNAME: "wizfield",
  DB_NAME: "wizfield",
  DB_TYPE: "mysql",
  DB_SYNCHRONIZE: "false",
  BACKEND_BOOTSTRAP_ENABLED: "false",
}));

if ((process.env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
  const live = validateProductionConfig(process.env);
  console.log(JSON.stringify(live, null, 2));
  assert.equal(live.ok, true, "Current production environment failed validation.");
}

console.log("production-config:check passed");
