import {
  actorHasPermission,
  canAccessAssignedJob,
} from "../auth/permissions";
import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import type { JobEntity } from "../database/entities/job.entity";
import {
  canTransitionJobStatus,
  isSystemOnlyJobStatus,
  type JobStatus,
} from "./constants";
import type { UpdateJobPayload } from "./validation";

export type JobPatchAuthorizationMode = "full" | "assigned_schedule_only";

export function resolveJobPatchAuthorization(actor: ActorContext): {
  canUpdateAllJobs: boolean;
  canUpdateAssignedSchedule: boolean;
} {
  const canUpdateAllJobs = actorHasPermission(actor, "jobs.update");
  const canUpdateAssignedSchedule =
    actorHasPermission(actor, "jobs.assigned.status.update")
    && actorHasPermission(actor, "jobs.assigned.view");

  return { canUpdateAllJobs, canUpdateAssignedSchedule };
}

export function assertMayPatchJob(
  actor: ActorContext,
  job: JobEntity,
  payload: UpdateJobPayload,
): JobPatchAuthorizationMode {
  const { canUpdateAllJobs, canUpdateAssignedSchedule } = resolveJobPatchAuthorization(actor);

  if (!canUpdateAllJobs && !canUpdateAssignedSchedule) {
    apiError(403, "job_update_forbidden", "This account cannot update jobs.");
  }

  if (canUpdateAllJobs) {
    return "full";
  }

  if (!canAccessAssignedJob(actor, job.assigned_technician_id)) {
    apiError(403, "job_update_forbidden", "This account cannot update jobs.");
  }

  const assignedTechnicianChange =
    payload.assignedTechnicianId !== undefined
    && payload.assignedTechnicianId !== job.assigned_technician_id;

  const hasDisallowedField =
    payload.title !== undefined
    || payload.description !== undefined
    || assignedTechnicianChange
    || payload.serviceId !== undefined
    || payload.branchId !== undefined
    || payload.jobType !== undefined;

  if (hasDisallowedField) {
    apiError(
      403,
      "job_update_forbidden",
      "Technicians may only change the schedule on assigned jobs.",
    );
  }

  const hasScheduleField =
    payload.scheduledFor !== undefined
    || payload.scheduledWindow !== undefined
    || payload.scheduledServiceDate !== undefined;

  if (!hasScheduleField) {
    apiError(400, "invalid_job_update_payload", "Provide a schedule change to update this job.");
  }

  return "assigned_schedule_only";
}

export function assertMayUpdateJobStatus(
  actor: ActorContext,
  job: JobEntity,
  nextStatus: JobStatus,
): void {
  if (
    !actorHasPermission(actor, "jobs.status.update")
    && !(
      actorHasPermission(actor, "jobs.assigned.status.update")
      && canAccessAssignedJob(actor, job.assigned_technician_id)
    )
  ) {
    apiError(403, "job_status_forbidden", "This account cannot update job status.");
  }

  if (
    !actorHasPermission(actor, "jobs.status.update")
    && isSystemOnlyJobStatus(nextStatus)
  ) {
    apiError(
      403,
      "office_only_job_status",
      "Only office staff can set this CRM job status.",
    );
  }

  if (!canTransitionJobStatus(job.status, nextStatus)) {
    apiError(
      400,
      "invalid_job_status_transition",
      "This job cannot move to the requested status from its current state.",
    );
  }
}
