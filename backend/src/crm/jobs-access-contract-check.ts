import assert from "node:assert/strict";

import type { ActorContext } from "../common/request-types";
import type { ProfileEntity } from "../database/entities/profile.entity";
import type { TechnicianEntity } from "../database/entities/technician.entity";
import {
  applyJobVisibilityToQueryBuilder,
  assertCanAccessJob,
  isAssignedOnlyJobActor,
  requireJobListPermission,
} from "./jobs-access";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

function buildActor(input: {
  role: ProfileEntity["role"];
  permissions: string[];
  technicianId?: string | null;
}): ActorContext {
  const technician = input.technicianId
    ? ({ id: input.technicianId } as TechnicianEntity)
    : null;

  return {
    user: { id: "user-1" } as ActorContext["user"],
    profile: { role: input.role } as ProfileEntity,
    organization_id: "org-a",
    memberships: [],
    membership: { role: input.role } as ActorContext["membership"],
    organization: null,
    membership_id: null,
    role: input.role,
    permissions: input.permissions,
    technician,
  };
}

expect("assigned-only actor detection", () => {
  const admin = buildActor({ role: "admin", permissions: ["jobs.view"] });
  const tech = buildActor({
    role: "technician",
    permissions: ["jobs.assigned.view"],
    technicianId: "tech-1",
  });

  assert.equal(isAssignedOnlyJobActor(admin), false);
  assert.equal(isAssignedOnlyJobActor(tech), true);
});

expect("requireJobListPermission allows jobs.view and jobs.assigned.view", () => {
  const admin = buildActor({ role: "admin", permissions: ["jobs.view"] });
  const tech = buildActor({
    role: "technician",
    permissions: ["jobs.assigned.view"],
    technicianId: "tech-1",
  });

  assert.doesNotThrow(() => requireJobListPermission(admin));
  assert.doesNotThrow(() => requireJobListPermission(tech));
});

expect("assertCanAccessJob blocks technician from unassigned jobs", () => {
  const tech = buildActor({
    role: "technician",
    permissions: ["jobs.assigned.view"],
    technicianId: "tech-1",
  });
  const admin = buildActor({ role: "admin", permissions: ["jobs.view"] });

  assert.throws(() => assertCanAccessJob(tech, null));
  assert.doesNotThrow(() => assertCanAccessJob(admin, null));
});

expect("assertCanAccessJob blocks technician from another technician job", () => {
  const tech = buildActor({
    role: "technician",
    permissions: ["jobs.assigned.view"],
    technicianId: "tech-1",
  });

  assert.throws(() => assertCanAccessJob(tech, "tech-2"));
  assert.doesNotThrow(() => assertCanAccessJob(tech, "tech-1"));
});

expect("applyJobVisibilityToQueryBuilder adds assigned filter for technicians", () => {
  const tech = buildActor({
    role: "technician",
    permissions: ["jobs.assigned.view"],
    technicianId: "tech-1",
  });

  const captured: string[] = [];
  const qb = {
    andWhere: (clause: string, params?: Record<string, unknown>) => {
      captured.push(clause);
      if (params) {
        captured.push(JSON.stringify(params));
      }
      return qb;
    },
  };

  applyJobVisibilityToQueryBuilder(qb as never, tech, "org-a");

  assert.equal(captured.some((entry) => entry.includes("organization_id")), true);
  assert.equal(captured.some((entry) => entry.includes("assigned_technician_id")), true);
  assert.equal(captured.some((entry) => entry.includes("tech-1")), true);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("jobs-access-contract-check complete");
