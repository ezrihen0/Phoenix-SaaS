import { randomUUID } from "crypto";

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { MarketingContentDraftEntity } from "../database/entities/marketing-content-draft.entity";
import { MarketingPublishAttemptEntity } from "../database/entities/marketing-publish-attempt.entity";
import { MarketingPublishJobEntity } from "../database/entities/marketing-publish-job.entity";

import { MarketingPublishExecutorService } from "./marketing-publish-executor.service";

function serializeJob(job: MarketingPublishJobEntity) {
  return {
    id: job.id,
    organization_id: job.organization_id,
    draft_id: job.draft_id,
    status: job.status,
    scheduled_at: job.scheduled_at.toISOString(),
    publish_intent: job.publish_intent,
    lease_owner: job.lease_owner,
    leased_until: job.leased_until ? job.leased_until.toISOString() : null,
    created_by_user_id: job.created_by_user_id,
    created_at: job.created_at.toISOString(),
    updated_at: job.updated_at.toISOString(),
  };
}

function safeJson(text: string | null): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function serializeAttempt(attempt: MarketingPublishAttemptEntity) {
  return {
    id: attempt.id,
    organization_id: attempt.organization_id,
    publish_job_id: attempt.publish_job_id,
    platform_key: attempt.platform_key,
    attempt_no: attempt.attempt_no,
    status: attempt.status,
    outcome_code: attempt.outcome_code,
    provider_http_status: attempt.provider_http_status,
    provider_error: safeJson(attempt.provider_error_json),
    external_post_id: attempt.external_post_id,
    started_at: attempt.started_at.toISOString(),
    finished_at: attempt.finished_at ? attempt.finished_at.toISOString() : null,
  };
}

@Injectable()
export class MarketingPublishService {
  constructor(
    @InjectRepository(MarketingPublishJobEntity)
    private readonly jobRepo: Repository<MarketingPublishJobEntity>,
    @InjectRepository(MarketingContentDraftEntity)
    private readonly draftRepo: Repository<MarketingContentDraftEntity>,
    @InjectRepository(MarketingPublishAttemptEntity)
    private readonly attemptRepo: Repository<MarketingPublishAttemptEntity>,
    private readonly executor: MarketingPublishExecutorService,
  ) {}

  async publishNow(organizationId: string, userId: string, draftId: string) {
    await this.assertApprovedDraft(organizationId, draftId);
    await this.assertNoActiveJob(organizationId, draftId);

    const job = this.jobRepo.create({
      id: randomUUID(),
      organization_id: organizationId,
      draft_id: draftId,
      status: "queued",
      scheduled_at: new Date(),
      lease_owner: null,
      leased_until: null,
      publish_intent: "publish_now",
      created_by_user_id: userId,
    });

    await this.jobRepo.save(job);

    return { job: serializeJob(job) };
  }

  async publishSchedule(organizationId: string, userId: string, draftId: string, scheduledAt: Date) {
    await this.assertApprovedDraft(organizationId, draftId);
    await this.assertNoActiveJob(organizationId, draftId);

    if (scheduledAt.valueOf() <= Date.now()) {
      apiError(
        400,
        "marketing_publish_schedule_past",
        "scheduled_at must be a future timestamp in UTC.",
      );
    }

    const job = this.jobRepo.create({
      id: randomUUID(),
      organization_id: organizationId,
      draft_id: draftId,
      status: "queued",
      scheduled_at: scheduledAt,
      lease_owner: null,
      leased_until: null,
      publish_intent: "scheduled",
      created_by_user_id: userId,
    });

    await this.jobRepo.save(job);

    return { job: serializeJob(job) };
  }

  async cancelJob(organizationId: string, jobId: string) {
    const job = await this.jobRepo.findOne({
      where: { id: jobId.trim(), organization_id: organizationId },
    });

    if (!job) {
      apiError(404, "marketing_publish_job_missing", "Publish job was not found.");
    }

    if (job.status !== "queued") {
      apiError(400, "marketing_publish_job_not_cancelable", "Only queued jobs can be canceled.");
    }

    job.status = "canceled";
    await this.jobRepo.save(job);

    return { job: serializeJob(job) };
  }

  async listJobs(organizationId: string, limit: number, offset: number) {
    const [rows, total] = await this.jobRepo.findAndCount({
      where: { organization_id: organizationId },
      order: { scheduled_at: "DESC" },
      take: limit,
      skip: offset,
    });

    return {
      jobs: rows.map(serializeJob),
      total,
      limit,
      offset,
    };
  }

  async getJob(organizationId: string, jobId: string) {
    const job = await this.jobRepo.findOne({
      where: { id: jobId.trim(), organization_id: organizationId },
    });

    if (!job) {
      apiError(404, "marketing_publish_job_missing", "Publish job was not found.");
    }

    const attempts = await this.attemptRepo.find({
      where: { publish_job_id: job.id },
      order: { started_at: "ASC" },
    });

    return {
      job: serializeJob(job),
      attempts: attempts.map(serializeAttempt),
    };
  }

  async retryAttempt(organizationId: string, attemptId: string) {
    const ok = await this.executor.retryPublishAttempt(organizationId, attemptId);

    if (!ok) {
      apiError(
        400,
        "marketing_publish_retry_invalid",
        "That attempt cannot be retried with the current policy.",
      );
    }

    const attempt = await this.attemptRepo.findOne({
      where: { id: attemptId.trim(), organization_id: organizationId },
    });

    if (!attempt) {
      apiError(404, "marketing_publish_attempt_missing", "Publish attempt was not found.");
    }

    return this.getJob(organizationId, attempt.publish_job_id);
  }

  private async assertApprovedDraft(organizationId: string, draftId: string): Promise<void> {
    const draft = await this.draftRepo.findOne({
      where: { id: draftId.trim(), organization_id: organizationId },
    });

    if (!draft) {
      apiError(404, "marketing_draft_missing", "Draft was not found.");
    }

    if (draft.workflow_state !== "approved") {
      apiError(
        400,
        "marketing_publish_not_approved",
        "Only approved drafts can be published.",
      );
    }
  }

  private async assertNoActiveJob(organizationId: string, draftId: string): Promise<void> {
    const dup = await this.jobRepo.findOne({
      where: {
        organization_id: organizationId,
        draft_id: draftId.trim(),
        status: In(["queued", "running"]),
      },
    });

    if (dup) {
      apiError(
        409,
        "marketing_publish_duplicate_job",
        "A queued or running publish job already exists for this draft.",
      );
    }
  }
}
