import assert from "node:assert/strict";

import {
  listPermissionsForRole,
  roleHasPermission,
  roleModePermissions,
} from "../auth/permissions";
import { listPermissionsForMembership } from "./membership-permissions";
import { recommendRoleFromResponsibilities } from "./role-recommendation.engine";
import { DEFAULT_MAX_USERS, resolveMaxUsers } from "./team-entitlements";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

expect("owner retains mandatory access", () => {
  assert.equal(roleHasPermission("owner", "system.roles.manage"), true);
  assert.equal(roleHasPermission("owner", "team.manage"), true);
  assert.equal(roleHasPermission("owner", "billing.manage"), true);
});

expect("admin cannot execute owner-only actions", () => {
  assert.equal(roleHasPermission("admin", "system.roles.manage"), false);
  assert.equal(roleHasPermission("admin", "organizations.manage"), false);
  assert.equal(roleHasPermission("admin", "billing.manage"), false);
  assert.equal(roleHasPermission("admin", "team.manage"), true);
});

expect("office admin cannot access billing management", () => {
  assert.equal(roleHasPermission("office_admin", "billing.manage"), false);
  assert.equal(roleHasPermission("office_admin", "team.manage"), false);
});

expect("dispatcher cannot access protected financial/admin operations", () => {
  assert.equal(roleHasPermission("dispatcher", "invoices.manage"), false);
  assert.equal(roleHasPermission("dispatcher", "billing.view"), false);
  assert.equal(roleHasPermission("dispatcher", "settings.manage"), false);
});

expect("technician uses assigned resource permissions", () => {
  const permissions = listPermissionsForRole("technician");
  assert.equal(permissions.includes("jobs.view"), false);
  assert.equal(permissions.includes("jobs.assigned.view"), true);
});

expect("custom membership permissions override system role", () => {
  const permissions = listPermissionsForMembership({
    role: "technician",
    custom_role_id: null,
    custom_permission_keys: ["customers.view", "leads.view"],
    custom_role: null,
  });
  assert.deepEqual(permissions, ["customers.view", "leads.view"]);
});

expect("recommendation engine is deterministic", () => {
  const first = recommendRoleFromResponsibilities([
    "answer_calls_messages",
    "manage_customers_leads",
    "create_estimates",
  ]);
  const second = recommendRoleFromResponsibilities([
    "answer_calls_messages",
    "manage_customers_leads",
    "create_estimates",
  ]);
  assert.equal(first.recommendedRole, "office_admin");
  assert.deepEqual(first, second);
});

expect("dispatch responsibilities recommend dispatcher", () => {
  const recommendation = recommendRoleFromResponsibilities([
    "manage_schedule",
    "dispatch_technicians",
  ]);
  assert.equal(recommendation.recommendedRole, "dispatcher");
});

expect("maxUsers defaults to centralized entitlement value", () => {
  assert.equal(DEFAULT_MAX_USERS, 5);
  assert.equal(resolveMaxUsers(null), 5);
  assert.equal(resolveMaxUsers({ max_users: 10 }), 10);
});

expect("permission registry contains team permissions", () => {
  assert.equal(roleModePermissions.includes("team.view"), true);
  assert.equal(roleModePermissions.includes("team.invite"), true);
  assert.equal(roleModePermissions.includes("team.manage"), true);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("team-rbac-contract-check complete");
