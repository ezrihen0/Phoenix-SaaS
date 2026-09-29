import type { SelectQueryBuilder } from "typeorm";

import type { ActorContext } from "../common/request-types";
import type { ProfileRole } from "./constants";
import { apiError } from "../common/api-response";
import type { JobEntity } from "../database/entities/job.entity";
import { canAccessJobResource } from "../auth/permissions";

const ALL_BRANCH_ROLES = new Set<ProfileRole>(["owner", "admin"]);

export function membershipSeesAllBranches(role: ProfileRole): boolean {
  return ALL_BRANCH_ROLES.has(role);
}

export function actorSeesAllBranches(actor: ActorContext | null | undefined): boolean {
  if (!actor?.membership) {
    return false;
  }

  return membershipSeesAllBranches(actor.membership.role);
}

export function applyBranchAccessToJobQueryBuilder(
  queryBuilder: SelectQueryBuilder<JobEntity>,
  actor: ActorContext,
  accessibleBranchIds: readonly string[] | null,
  alias = "job",
): SelectQueryBuilder<JobEntity> {
  if (accessibleBranchIds === null) {
    return queryBuilder;
  }

  if (accessibleBranchIds.length === 0) {
    queryBuilder.andWhere("1 = 0");
    return queryBuilder;
  }

  queryBuilder.andWhere(
    `(${alias}.branch_id IS NULL OR ${alias}.branch_id IN (:...accessibleBranchIds))`,
    { accessibleBranchIds: [...accessibleBranchIds] },
  );

  return queryBuilder;
}

export function assertActorCanAccessJobBranch(
  actor: ActorContext,
  job: Pick<JobEntity, "branch_id" | "assigned_technician_id">,
  accessibleBranchIds: readonly string[] | null,
  code = "branch_access_denied",
  message = "You do not have access to this branch.",
): void {
  if (!canAccessJobResource(actor, job.assigned_technician_id)) {
    apiError(403, "job_access_denied", "You do not have access to this job.");
  }

  if (!job.branch_id?.trim()) {
    return;
  }

  if (accessibleBranchIds === null) {
    return;
  }

  if (!accessibleBranchIds.includes(job.branch_id)) {
    apiError(403, code, message);
  }
}

export function assertActorCanAssignBranch(
  actor: ActorContext,
  branchId: string,
  accessibleBranchIds: readonly string[] | null,
): void {
  if (accessibleBranchIds === null) {
    return;
  }

  if (!accessibleBranchIds.includes(branchId)) {
    apiError(403, "branch_assign_forbidden", "This account cannot assign that branch.");
  }
}

export function actorCanManageBranchScopedResource(
  actor: ActorContext,
  assignedTechnicianId: string | null | undefined,
  branchId: string | null | undefined,
  accessibleBranchIds: readonly string[] | null,
): boolean {
  if (!canAccessJobResource(actor, assignedTechnicianId)) {
    return false;
  }

  if (!branchId?.trim() || accessibleBranchIds === null) {
    return true;
  }

  return accessibleBranchIds.includes(branchId);
}
