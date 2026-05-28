import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { canAccessJobResource } from "../auth/permissions";
import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import { JobEntity } from "../database/entities/job.entity";

export type FieldJobContextV1 = {
  schema_version: "field_job_v1";
  job_id: string;
  title: string;
  status: string;
  requested_service_type: string;
  scheduled_for: string | null;
  service_city: string | null;
  has_description: boolean;
};

@Injectable()
export class AiFieldJobContextService {
  constructor(
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
  ) {}

  /**
   * Optional org-scoped job snapshot — separate from FIELD_KNOWLEDGE (trade packs).
   * No phone numbers, emails, or customer PII in V1.
   */
  async buildFieldJobContextV1(
    organizationId: string,
    actor: ActorContext,
    jobId: string | undefined,
  ): Promise<FieldJobContextV1 | null> {
    const trimmedJobId = jobId?.trim();
    if (!trimmedJobId) {
      return null;
    }

    const job = await this.jobsRepository.findOne({
      where: { id: trimmedJobId, organization_id: organizationId },
      select: {
        id: true,
        organization_id: true,
        title: true,
        status: true,
        requested_service_type: true,
        scheduled_for: true,
        service_city: true,
        description: true,
        assigned_technician_id: true,
      },
    });

    if (!job) {
      apiError(404, "job_not_found", "The job could not be found in your active workspace.");
    }

    if (!canAccessJobResource(actor, job.assigned_technician_id)) {
      apiError(403, "job_forbidden", "You do not have access to this job.");
    }

    return {
      schema_version: "field_job_v1",
      job_id: job.id,
      title: job.title,
      status: job.status,
      requested_service_type: job.requested_service_type,
      scheduled_for: job.scheduled_for ? job.scheduled_for.toISOString() : null,
      service_city: job.service_city?.trim() || null,
      has_description: Boolean(job.description?.trim()),
    };
  }

  formatForPrompt(context: FieldJobContextV1 | null): string {
    if (!context) {
      return "FIELD_JOB_CONTEXT: (none — no job linked to this question)";
    }
    return `FIELD_JOB_CONTEXT (org-scoped job snapshot — not trade knowledge):\n${JSON.stringify(context)}`;
  }
}
