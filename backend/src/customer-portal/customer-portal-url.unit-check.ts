/**
 * Run: npm run portal:customer-url-check --workspace backend
 */
import assert from "node:assert/strict";

import { ConfigService } from "@nestjs/config";

import { buildCustomerPortalAccessUrl, resolveCustomerPortalBaseUrl } from "./customer-portal-url";

function mockConfig(values: Record<string, string | undefined>) {
  return {
    get(key: string) {
      return values[key];
    },
  } as ConfigService;
}

assert.equal(
  resolveCustomerPortalBaseUrl(
    mockConfig({
      CUSTOMER_PORTAL_BASE_URL: "https://portal.phoenixfireplace.ca/",
      PUBLIC_BASE_URL: "https://app.wizfield.com",
    }),
  ),
  "https://portal.phoenixfireplace.ca",
);

assert.equal(
  buildCustomerPortalAccessUrl(
    mockConfig({ CUSTOMER_PORTAL_BASE_URL: "https://portal.phoenixfireplace.ca" }),
    "abc123",
  ),
  "https://portal.phoenixfireplace.ca/portal/auth/magic?token=abc123",
);

assert.equal(
  buildCustomerPortalAccessUrl(
    mockConfig({ CUSTOMER_PORTAL_BASE_URL: "https://portal.phoenixfireplace.ca" }),
    "abc123",
    { entry: "invoice" },
  ),
  "https://portal.phoenixfireplace.ca/portal/auth/magic?token=abc123&entry=invoice",
);

assert.equal(
  resolveCustomerPortalBaseUrl(
    mockConfig({
      PHOENIX_PORTAL_PUBLIC_BASE_URL: "https://portal.phoenixfireplace.ca",
      PUBLIC_BASE_URL: "https://app.wizfield.com",
    }),
  ),
  "https://portal.phoenixfireplace.ca",
);

assert.equal(
  resolveCustomerPortalBaseUrl(mockConfig({ PUBLIC_BASE_URL: "https://app.wizfield.com" })),
  "https://app.wizfield.com",
);

console.log("customer-portal-url.unit-check: ok");
