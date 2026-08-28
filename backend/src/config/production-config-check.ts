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
  STRIPE_SECRET_KEY: "sk_live_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
  STRIPE_PRICE_STARTER: "price_starter",
  STRIPE_PRICE_PRO: "price_pro",
  STRIPE_PRICE_BUSINESS: "price_business",
  STRIPE_CHECKOUT_SUCCESS_URL: "https://app.wizfield.com/billing/success?session_id={CHECKOUT_SESSION_ID}",
  STRIPE_CHECKOUT_CANCEL_URL: "https://app.wizfield.com/pricing?checkout=cancelled",
  BACKEND_BOOTSTRAP_ENABLED: "false",
});
assert.equal(validProduction.ok, true, "Valid production fixture should pass.");

const insecureProduction = validateProductionConfig({
  NODE_ENV: "production",
  SESSION_COOKIE_SECURE: "false",
  CORS_ORIGIN: "http://localhost:3000",
  DB_HOST: "db.internal",
  DB_USERNAME: "wizfield",
  DB_NAME: "wizfield",
  DB_SYNCHRONIZE: "true",
  STRIPE_SECRET_KEY: "sk_live_example",
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

assert.doesNotThrow(() => assertProductionConfigValid({
  NODE_ENV: "production",
  SESSION_COOKIE_SECURE: "true",
  CORS_ORIGIN: "https://app.wizfield.com",
  DB_HOST: "db.internal",
  DB_USERNAME: "wizfield",
  DB_NAME: "wizfield",
  DB_TYPE: "mysql",
  DB_SYNCHRONIZE: "false",
  STRIPE_SECRET_KEY: "sk_live_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
  STRIPE_PRICE_STARTER: "price_starter",
  STRIPE_PRICE_PRO: "price_pro",
  STRIPE_PRICE_BUSINESS: "price_business",
  STRIPE_CHECKOUT_SUCCESS_URL: "https://app.wizfield.com/billing/success",
  STRIPE_CHECKOUT_CANCEL_URL: "https://app.wizfield.com/pricing",
  BACKEND_BOOTSTRAP_ENABLED: "false",
}));

if ((process.env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
  const live = validateProductionConfig(process.env);
  console.log(JSON.stringify(live, null, 2));
  assert.equal(live.ok, true, "Current production environment failed validation.");
}

console.log("production-config:check passed");
