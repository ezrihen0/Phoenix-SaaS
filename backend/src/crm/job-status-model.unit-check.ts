import {
  activeJobStatusValues,
  canTransitionJobStatus,
  getOperationalJobStatusLabel,
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

expect("legacy in-progress maps to scheduled bucket", () => {
  if (mapJobStatusToOperationalBucket("in_progress") !== "scheduled") {
    throw new Error("expected in_progress -> scheduled");
  }
});

expect("legacy paid maps to completed bucket", () => {
  if (mapJobStatusToOperationalBucket("paid") !== "completed") {
    throw new Error("expected paid -> completed");
  }
});

expect("technician can complete from legacy on_the_way", () => {
  if (!canTransitionJobStatus("on_the_way", "completed")) {
    throw new Error("expected on_the_way -> completed");
  }
});

expect("technician can cancel from submitted", () => {
  if (!canTransitionJobStatus("submitted", "cancelled")) {
    throw new Error("expected submitted -> cancelled");
  }
});

expect("paid is not an operational transition target", () => {
  if (canTransitionJobStatus("completed", "paid")) {
    throw new Error("expected completed -> paid to be blocked in UI transitions");
  }
});

expect("active queue includes submitted and legacy lead statuses", () => {
  if (!activeJobStatusValues.includes("submitted") || !activeJobStatusValues.includes("new_lead")) {
    throw new Error("active queue missing expected statuses");
  }
});

expect("operational labels collapse legacy statuses", () => {
  if (getOperationalJobStatusLabel("on_the_way") !== "Scheduled") {
    throw new Error("expected on_the_way label Scheduled");
  }
  if (getOperationalJobStatusLabel("new_lead") !== "Submitted") {
    throw new Error("expected new_lead label Submitted");
  }
});
