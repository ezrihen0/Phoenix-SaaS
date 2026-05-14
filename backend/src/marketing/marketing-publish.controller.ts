import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";

import { assertMarketingPublisher, requireMarketingOfficeActor } from "./marketing-access";
import { MarketingPublishService } from "./marketing-publish.service";

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

@UseGuards(SessionGuard)
@Controller("api/marketing")
export class MarketingPublishController {
  constructor(private readonly publishService: MarketingPublishService) {}

  @Post("drafts/:draftId/publish-now")
  async publishNow(@Req() request: RequestWithActor, @Param("draftId") draftId: string) {
    const actor = requireMarketingOfficeActor(request);

    assertMarketingPublisher(actor);

    return apiSuccess(
      await this.publishService.publishNow(actor.organization_id, actor.user.id, draftId.trim()),
    );
  }

  @Post("drafts/:draftId/publish-schedule")
  async publishSchedule(@Req() request: RequestWithActor, @Param("draftId") draftId: string, @Body() body: unknown) {
    const actor = requireMarketingOfficeActor(request);

    assertMarketingPublisher(actor);

    const payload = this.readObjectBody(body);
    const scheduledRaw = payload.scheduled_at;

    if (typeof scheduledRaw !== "string" || !scheduledRaw.trim()) {
      apiError(400, "marketing_publish_schedule_missing", "Field scheduled_at must be supplied.");
    }

    const scheduledAt = new Date(scheduledRaw.trim());

    if (Number.isNaN(scheduledAt.valueOf())) {
      apiError(400, "marketing_publish_schedule_invalid", "scheduled_at must be ISO8601.");
    }

    return apiSuccess(
      await this.publishService.publishSchedule(actor.organization_id, actor.user.id, draftId.trim(), scheduledAt),
    );
  }

  @Post("publish-jobs/:jobId/cancel")
  async cancelJob(@Req() request: RequestWithActor, @Param("jobId") jobId: string) {
    const actor = requireMarketingOfficeActor(request);

    assertMarketingPublisher(actor);

    return apiSuccess(await this.publishService.cancelJob(actor.organization_id, jobId.trim()));
  }

  @Get("publish-jobs")
  async listJobs(
    @Req() request: RequestWithActor,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const actor = requireMarketingOfficeActor(request);

    assertMarketingPublisher(actor);

    return apiSuccess(
      await this.publishService.listJobs(
        actor.organization_id,
        readPositiveInt(limit, 50),
        readPositiveInt(offset, 0),
      ),
    );
  }

  @Get("publish-jobs/:jobId")
  async getJob(@Req() request: RequestWithActor, @Param("jobId") jobId: string) {
    const actor = requireMarketingOfficeActor(request);

    assertMarketingPublisher(actor);

    return apiSuccess(await this.publishService.getJob(actor.organization_id, jobId.trim()));
  }

  @Post("publish-attempts/:attemptId/retry")
  async retryAttempt(@Req() request: RequestWithActor, @Param("attemptId") attemptId: string) {
    const actor = requireMarketingOfficeActor(request);

    assertMarketingPublisher(actor);

    return apiSuccess(await this.publishService.retryAttempt(actor.organization_id, attemptId.trim()));
  }

  private readObjectBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      apiError(400, "marketing_payload_expected", "Expected a JSON object body.");
    }

    return body as Record<string, unknown>;
  }
}
