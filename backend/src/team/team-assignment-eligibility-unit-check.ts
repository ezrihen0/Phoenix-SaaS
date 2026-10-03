import assert from "node:assert/strict";

import {
  defaultAssignableForSystemRole,
  isExplicitAssignmentDenial,
  readAssignmentEligibilityMode,
} from "./assignment-eligibility.mode";
import { actorMayAdministrativelyResetTargetPassword } from "./team-role-privilege";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

expect("explicit denial is only false, not null", () => {
  assert.equal(isExplicitAssignmentDenial(false), true);
  assert.equal(isExplicitAssignmentDenial(null), false);
  assert.equal(isExplicitAssignmentDenial(undefined), false);
  assert.equal(isExplicitAssignmentDenial(true), false);
});

expect("technician role defaults assignable", () => {
  assert.equal(defaultAssignableForSystemRole("technician"), true);
  assert.equal(defaultAssignableForSystemRole("office_admin"), false);
});

expect("assignment eligibility mode defaults to off", () => {
  assert.equal(readAssignmentEligibilityMode({}), "off");
  assert.equal(readAssignmentEligibilityMode({ TEAM_ASSIGNMENT_ELIGIBILITY_MODE: "enforce" }), "enforce");
});

expect("password reset blocked for admin target when actor is office admin", () => {
  const decision = actorMayAdministrativelyResetTargetPassword({
    actorMembershipRole: "office_admin",
    actorManageableOrganizationIds: new Set(["org-a"]),
    targetMemberships: [
      { organization_id: "org-a", role: "admin", custom_permission_keys: null, custom_role_id: null },
    ],
  });
  assert.equal(decision.allowed, false);
});

expect("password reset blocked for custom owner-level permissions when actor is admin", () => {
  const decision = actorMayAdministrativelyResetTargetPassword({
    actorMembershipRole: "admin",
    actorManageableOrganizationIds: new Set(["org-a"]),
    targetMemberships: [
      {
        organization_id: "org-a",
        role: "office_admin",
        custom_permission_keys: ["billing.manage"],
        custom_role_id: null,
      },
    ],
  });
  assert.equal(decision.allowed, false);
  if (!decision.allowed) {
    assert.equal(decision.code, "password_reset_custom_privilege_protected");
  }
});

expect("password reset allowed for technician when actor is admin", () => {
  const decision = actorMayAdministrativelyResetTargetPassword({
    actorMembershipRole: "admin",
    actorManageableOrganizationIds: new Set(["org-a"]),
    targetMemberships: [
      { organization_id: "org-a", role: "technician", custom_permission_keys: null, custom_role_id: null },
    ],
  });
  assert.equal(decision.allowed, true);
});

expect("password reset blocked when target has unmanaged org membership", () => {
  const decision = actorMayAdministrativelyResetTargetPassword({
    actorMembershipRole: "admin",
    actorManageableOrganizationIds: new Set(["org-a"]),
    targetMemberships: [
      { organization_id: "org-a", role: "technician", custom_permission_keys: null, custom_role_id: null },
      { organization_id: "org-b", role: "technician", custom_permission_keys: null, custom_role_id: null },
    ],
  });
  assert.equal(decision.allowed, false);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("team-assignment-eligibility-unit-check complete");
