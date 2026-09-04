/**
 * Assigned invoice manage RBAC assertions (no DB).
 * Run: npm run auth:invoice-assigned-manage:check --workspace backend
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  actorHasPermission,
  canManageInvoiceResource,
  canViewPricebookCatalog,
  listPermissionsForRole,
} from "./permissions";
import type { ActorContext } from "../common/request-types";
import { parseUpsertInvoicePayload } from "../crm/validation";

const technicianPermissions = listPermissionsForRole("technician");
assert.ok(technicianPermissions.includes("invoices.assigned.manage"));
assert.ok(technicianPermissions.includes("pricebook.view"));

const assignedTechActor = {
  user: { id: "user-1" },
  organization_id: "org-1",
  role: "technician",
  membership: { role: "technician" },
  technician: { id: "tech-1" },
  permissions: [] as string[],
} as ActorContext;

const otherTechActor = {
  ...assignedTechActor,
  technician: { id: "tech-2" },
} as ActorContext;

assert.equal(canManageInvoiceResource(assignedTechActor, "tech-1"), true);
assert.equal(canManageInvoiceResource(otherTechActor, "tech-1"), false);
assert.equal(canViewPricebookCatalog(assignedTechActor, "tech-1"), true);
assert.equal(canViewPricebookCatalog(otherTechActor, "tech-1"), true);

const officeActor = {
  user: { id: "user-2" },
  organization_id: "org-1",
  role: "office_admin",
  membership: { role: "office_admin" },
  permissions: [] as string[],
} as ActorContext;

assert.equal(actorHasPermission(officeActor, "invoices.manage"), true);
assert.equal(canManageInvoiceResource(officeActor, null), true);

const bundleId = "33333333-3333-4333-8333-333333333333";
const requirementId = "44444444-4444-4444-8444-444444444444";
const pricebookItemId = "55555555-5555-4555-8555-555555555555";
const parsedInvoice = parseUpsertInvoicePayload({
  description: "Field invoice line metadata",
  amountCents: 12500,
  status: "unpaid",
  lineItems: [
    {
      kind: "pricebook_item",
      documentLineKey: "line-1",
      pricebookItemId,
      quantity: "1",
      sortOrder: 0,
      warrantyMonthsOverride: null,
      pricebookBundleId: bundleId,
      bundleRequirementId: requirementId,
      catalogUnitPriceCentsSnapshot: 9900,
    },
  ],
});
assert.equal(parsedInvoice.lineItems?.length, 1);
const parsedLine = parsedInvoice.lineItems?.[0];
assert.equal(parsedLine?.kind, "pricebook_item");
if (parsedLine?.kind === "pricebook_item") {
  assert.equal(parsedLine.warrantyMonthsOverride, null);
  assert.equal(parsedLine.pricebookBundleId, bundleId);
  assert.equal(parsedLine.bundleRequirementId, requirementId);
  assert.equal(parsedLine.catalogUnitPriceCentsSnapshot, 9900);
}

const crmControllerSource = readFileSync(resolve(__dirname, "../crm/crm.controller.ts"), "utf8");
const documentSnapshotSource = readFileSync(resolve(__dirname, "../crm/document-snapshot.service.ts"), "utf8");
assert.match(crmControllerSource, /pricebook_bundle_id: lineItem\.pricebook_bundle_id/);
assert.match(crmControllerSource, /bundle_requirement_id: lineItem\.bundle_requirement_id/);
assert.match(crmControllerSource, /catalog_unit_price_cents_snapshot: lineItem\.catalog_unit_price_cents_snapshot/);
assert.match(documentSnapshotSource, /pricebook_bundle_id: pricebookBundleId \?\? null/);
assert.match(documentSnapshotSource, /catalog_unit_price_cents_snapshot: catalogUnitPriceCentsSnapshot \?\? null/);

console.log("invoice-assigned-manage-unit-check: ok");
