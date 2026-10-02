import type { FindOptionsRelations, Repository, SelectQueryBuilder } from "typeorm";

import {
  actorHasPermission,
  canAccessJobResource,
} from "../auth/permissions";
import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import type { JobEntity } from "../database/entities/job.entity";
import { assertActorCanAccessJobBranch } from "./branch-access";

export function isAssignedOnlyJobActor(actor: ActorContext | null | undefined): boolean {
  return !actorHasPermission(actor, "jobs.view")
    && actorHasPermission(actor, "jobs.assigned.view");
}

export function requireJobListPermission(
  actor: ActorContext,
  code = "job_list_forbidden",
  message = "This account cannot view jobs.",
): ActorContext {
  if (!actorHasPermission(actor, "jobs.view") && !actorHasPermission(actor, "jobs.assigned.view")) {
    apiError(403, code, message);
  }

  return actor;
}

export function applyJobVisibilityToQueryBuilder(
  queryBuilder: SelectQueryBuilder<JobEntity>,
  actor: ActorContext,
  organizationId: string,
  alias = "job",
): SelectQueryBuilder<JobEntity> {
  queryBuilder.andWhere(`${alias}.organization_id = :organizationId`, { organizationId });

  if (isAssignedOnlyJobActor(actor)) {
    const technicianId = actor.technician?.id ?? null;
    if (!technicianId) {
      queryBuilder.andWhere("1 = 0");
      return queryBuilder;
    }

    queryBuilder.andWhere(`${alias}.assigned_technician_id = :assignedTechnicianId`, {
      assignedTechnicianId: technicianId,
    });
  }

  return queryBuilder;
}

export function assertCanAccessJob(
  actor: ActorContext,
  assignedTechnicianId: string | null | undefined,
  code = "job_access_denied",
  message = "You do not have access to this job.",
): void {
  if (!canAccessJobResource(actor, assignedTechnicianId)) {
    apiError(403, code, message);
  }
}

export type JobDetailRelations = FindOptionsRelations<JobEntity>;

const defaultJobDetailRelations: JobDetailRelations = {
  customer: true,
  service: true,
  technician: true,
  quote: true,
  invoice: { payments: true },
  notes: { author_profile: true },
  status_events: true,
};

export async function findJobInOrganization(
  jobsRepository: Repository<JobEntity>,
  jobId: string,
  organizationId: string,
  relations: JobDetailRelations = defaultJobDetailRelations,
): Promise<JobEntity | null> {
  return jobsRepository.findOne({
    where: {
      id: jobId,
      organization_id: organizationId,
    },
    relations,
  });
}

export async function findJobForActor(
  jobsRepository: Repository<JobEntity>,
  jobId: string,
  organizationId: string,
  actor: ActorContext,
  relations: JobDetailRelations = defaultJobDetailRelations,
  accessibleBranchIds?: string[] | null,
): Promise<JobEntity> {
  const job = await findJobInOrganization(jobsRepository, jobId, organizationId, relations);

  if (!job) {
    apiError(404, "job_not_found", "The job could not be found.");
  }

  assertCanAccessJob(actor, job.assigned_technician_id);

  if (accessibleBranchIds !== undefined) {
    assertActorCanAccessJobBranch(actor, job, accessibleBranchIds);
  }

  return job;
}

/** V1: office schedule users with jobs.view. Future: schedule.view_other_technicians. */
export function actorCanViewOtherTechnicianCalendars(actor: ActorContext): boolean {
  return actorHasPermission(actor, "jobs.view");
}

export function actorCanFilterByTechnicianId(actor: ActorContext): boolean {
  return actorCanViewOtherTechnicianCalendars(actor);
}

export function actorCanViewTechnicianRoster(actor: ActorContext): boolean {
  return actorHasPermission(actor, "jobs.view")
    || actorHasPermission(actor, "jobs.update");
}

export function requireTechnicianRosterViewPermission(
  actor: ActorContext,
  code = "technician_list_forbidden",
  message = "This account cannot view the technician roster.",
): ActorContext {
  if (!actorCanViewTechnicianRoster(actor)) {
    apiError(403, code, message);
  }

  return actor;
}
