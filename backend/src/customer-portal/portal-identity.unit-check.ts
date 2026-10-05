/**
 * Run: node -r ts-node/register src/customer-portal/portal-identity.unit-check.ts
 */
import assert from "node:assert/strict";

import { PortalIdentityService } from "./portal-identity.service";

const service = new PortalIdentityService({} as never, {} as never);

assert.deepEqual(
  service.evaluateCustomerReadiness("org", { email: null }),
  { status: "email_required", primaryEmailNormalized: null },
);

assert.deepEqual(
  service.evaluateCustomerReadiness("org", { email: "not-an-email" }),
  { status: "email_required", primaryEmailNormalized: null },
);

assert.deepEqual(
  service.evaluateCustomerReadiness("org", { email: "Customer@Example.COM" }),
  { status: "ready", primaryEmailNormalized: "customer@example.com" },
);

console.log("portal-identity.unit-check: ok");
