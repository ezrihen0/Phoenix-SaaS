import { HttpException } from "@nestjs/common";
import assert from "node:assert/strict";

import { listPermissionsForRole } from "../auth/permissions";
import type { ActorContext } from "../common/request-types";
import type { JobEntity } from "../database/entities/job.entity";
import type { ProfileEntity } from "../database/entities/profile.entity";
import type { TechnicianEntity } from "../database/entities/technician.entity";
import {
  assertMayPatchJob,
  assertMayUpdateJobStatus,
} from "./jobs-technician-mutation-gate";
import {
  jobStatusMatchesListQueue,
  mapJobStatusToOperationalBucket,
} from "./job-status-model";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

function expectHttp(name: string, run: () => void, status: number) {
  try {
    run();
    throw new Error(`Expected HTTP ${status}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Expected HTTP")) {
      console.error(`FAIL ${name}`, error);
      process.exitCode = 1;
      return;
    }
    if (!(error instanceof HttpException) || error.getStatus() !== status) {
      console.error(`FAIL ${name}`, error);
      process.exitCode = 1;
      return;
    }
    console.log(`PASS ${name}`);
  }
}

function buildActor(role: ProfileEntity["role"], technicianId: string | null): ActorContext {
  const technician = technicianId
    ? ({ id: technicianId } as TechnicianEntity)
    : null;

  return {
    user: { id: `${role}-user` } as ActorContext["user"],
    profile: { role } as ProfileEntity,
    technician,
    memberships: [],
    membership: { role } as ActorContext["membership"],
    organization: null,
    membership_id: null,
    organization_id: "org-a",
    role,
    permissions: listPermissionsForRole(role),
    platform_capabilities: [],
  };
}

function buildJob(assignedTechnicianId: string | null, status: JobEntity["status"] = "scheduled"): JobEntity {
  return {
    id: "job-1",
    assigned_technician_id: assignedTechnicianId,
    status,
    scheduled_for: new Date(),
    scheduled_window: "09:00-11:00",
  } as JobEntity;
}

const tech1 = buildActor("technician", "tech-1");
const admin = buildActor("admin", null);
const office = buildActor("office_admin", null);
const owner = buildActor("owner", null);

expect("1 technician can update status on assigned job", () => {
  assert.doesNotThrow(() =>
    assertMayUpdateJobStatus(tech1, buildJob("tech-1", "scheduled"), "completed"),
  );
});

expect("2 technician can change schedule on assigned job (PATCH gate)", () => {
  assert.doesNotThrow(() =>
    assertMayPatchJob(tech1, buildJob("tech-1"), {
      scheduledFor: "2030-01-01T12:00:00.000Z",
      assignedTechnicianId: "tech-1",
    }),
  );
});

expectHttp("3 technician cannot update status on another technicians job", () => {
  assertMayUpdateJobStatus(tech1, buildJob("tech-2", "scheduled"), "completed");
}, 403);

expectHttp("4 technician cannot change schedule on another technicians job", () => {
  assertMayPatchJob(tech1, buildJob("tech-2"), {
    scheduledFor: "2030-01-01T12:00:00.000Z",
  });
}, 403);

expectHttp("5 technician cannot reassign job to another technician", () => {
  assertMayPatchJob(tech1, buildJob("tech-1"), {
    scheduledFor: "2030-01-01T12:00:00.000Z",
    assignedTechnicianId: "tech-2",
  });
}, 403);

expectHttp("6 technician cannot modify unrelated protected job fields through PATCH", () => {
  assertMayPatchJob(tech1, buildJob("tech-1"), {
    title: "Blocked rename",
  });
}, 403);

expectHttp("6b technician PATCH without schedule fields rejected", () => {
  assertMayPatchJob(tech1, buildJob("tech-1"), {});
}, 400);

expect("7 admin owner office retain full PATCH authorization", () => {
  assert.doesNotThrow(() =>
    assertMayPatchJob(admin, buildJob("tech-2"), {
      title: "Admin rename",
      assignedTechnicianId: "tech-1",
      description: "Updated",
    }),
  );
  assert.doesNotThrow(() =>
    assertMayPatchJob(office, buildJob("tech-2"), { description: "Office note" }),
  );
  assert.doesNotThrow(() =>
    assertMayUpdateJobStatus(owner, buildJob("tech-2", "scheduled"), "cancelled"),
  );
});

expect("8 completed status leaves active queue and enters completed queue", () => {
  assert.equal(jobStatusMatchesListQueue("scheduled", "active"), true);
  assert.equal(jobStatusMatchesListQueue("completed", "active"), false);
  assert.equal(jobStatusMatchesListQueue("completed", "completed"), true);
});

expect("9 cancelled status leaves active queue and enters cancelled queue", () => {
  assert.equal(jobStatusMatchesListQueue("submitted", "active"), true);
  assert.equal(jobStatusMatchesListQueue("cancelled", "active"), false);
  assert.equal(jobStatusMatchesListQueue("cancelled", "cancelled"), true);
});

expect("10 legacy statuses map into operational buckets for queue logic", () => {
  assert.equal(mapJobStatusToOperationalBucket("new_lead"), "submitted");
  assert.equal(mapJobStatusToOperationalBucket("in_progress"), "scheduled");
  assert.equal(mapJobStatusToOperationalBucket("paid"), "completed");
  assert.equal(jobStatusMatchesListQueue("new_lead", "active"), true);
  assert.equal(jobStatusMatchesListQueue("in_progress", "active"), true);
  assert.equal(jobStatusMatchesListQueue("paid", "completed"), true);
  assert.equal(jobStatusMatchesListQueue("paid", "active"), false);
});
