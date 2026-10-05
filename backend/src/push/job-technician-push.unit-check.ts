import assert from "node:assert/strict";

import {
  classifyJobChangeForTechnicianPush,
  classifyJobNoteForTechnicianPush,
  type JobPushSnapshot,
} from "./job-technician-push.classifier";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

function baseJob(overrides: Partial<JobPushSnapshot> = {}): JobPushSnapshot {
  return {
    id: "job-1",
    title: "Inspection for Alex",
    description: "Chimney sweep",
    assigned_technician_id: "tech-1",
    service_id: "svc-1",
    status: "scheduled",
    service_address_line_1: "1 Main St",
    service_address_line_2: null,
    service_city: "Calgary",
    service_state_or_region: "AB",
    service_postal_code: "T2P1A1",
    scheduled_for: new Date("2026-10-05T15:00:00.000Z"),
    scheduled_window: "afternoon",
    ...overrides,
  };
}

expect("new assigned job creates push message", () => {
  const message = classifyJobChangeForTechnicianPush({
    before: null,
    after: baseJob(),
  });
  assert.ok(message);
  assert.equal(message?.kind, "job_created_assigned");
});

expect("unassigned create does not notify", () => {
  const message = classifyJobChangeForTechnicianPush({
    before: null,
    after: baseJob({ assigned_technician_id: null }),
  });
  assert.equal(message, null);
});

expect("reassignment to current assignee notifies", () => {
  const before = baseJob({ assigned_technician_id: "tech-other" });
  const after = baseJob({ assigned_technician_id: "tech-1" });
  const message = classifyJobChangeForTechnicianPush({ before, after });
  assert.equal(message?.kind, "job_reassigned");
});

expect("status change notifies", () => {
  const before = baseJob({ status: "scheduled" });
  const after = baseJob({ status: "cancelled" });
  const message = classifyJobChangeForTechnicianPush({ before, after });
  assert.equal(message?.kind, "job_status_changed");
});

expect("schedule change notifies", () => {
  const before = baseJob();
  const after = baseJob({ scheduled_for: new Date("2026-10-06T15:00:00.000Z") });
  const message = classifyJobChangeForTechnicianPush({ before, after });
  assert.equal(message?.kind, "job_rescheduled");
});

expect("title change notifies as details", () => {
  const before = baseJob();
  const after = baseJob({ title: "Repair for Alex" });
  const message = classifyJobChangeForTechnicianPush({ before, after });
  assert.equal(message?.kind, "job_details_updated");
});

expect("no-op update does not notify", () => {
  const snapshot = baseJob();
  const message = classifyJobChangeForTechnicianPush({ before: snapshot, after: { ...snapshot } });
  assert.equal(message, null);
});

expect("job note with text notifies", () => {
  const message = classifyJobNoteForTechnicianPush({
    jobId: "job-1",
    jobTitle: "Inspection",
    findings: "Damper stuck",
    recommendations: null,
  });
  assert.equal(message?.kind, "job_note_added");
});

expect("photo-only note does not notify", () => {
  const message = classifyJobNoteForTechnicianPush({
    jobId: "job-1",
    jobTitle: "Inspection",
    findings: null,
    recommendations: null,
  });
  assert.equal(message, null);
});
