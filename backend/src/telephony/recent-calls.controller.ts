import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { canManageCallbackTasks, isTelephonyOfficeRole } from "./telephony-role";
import { TelnyxWebhookService } from "./telnyx-webhook.service";

type QueueCallbackPayload = {
  priority?: unknown;
  notes?: unknown;
};

type AiEnrichmentPayload = {
  voicemailTranscription?: unknown;
  aiSummary?: unknown;
  aiSentiment?: unknown;
  aiStatus?: unknown;
  aiProvider?: unknown;
  aiModel?: unknown;
  aiEnrichedAt?: unknown;
};

@UseGuards(SessionGuard)
@Controller("api/recent-calls")
export class RecentCallsController {
  constructor(private readonly telnyxWebhookService: TelnyxWebhookService) {}

  @Get()
  async listRecentCalls(
    @Req() request: RequestWithActor,
    @Query("q") query: string | undefined,
    @Query("callStatus") callStatus: string | undefined,
    @Query("processingStatus") processingStatus: string | undefined,
    @Query("limit") limitRaw: string | undefined,
  ) {
    const actor = request.actor;

    if (!actor || !isTelephonyOfficeRole(actor.role ?? actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office roles can access recent calls.");
    }

    const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
    const records = await this.telnyxWebhookService.listRecentCalls({
      query: query ?? null,
      callStatus: callStatus ?? null,
      processingStatus: processingStatus ?? null,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });

    return apiSuccess(records);
  }

  @Post(":recentCallId/queue-callback-request")
  async requestQueueCallback(
    @Req() request: RequestWithActor,
    @Param("recentCallId") recentCallId: string,
    @Body() payload: QueueCallbackPayload,
  ) {
    const actor = request.actor;

    if (!actor || !canManageCallbackTasks(actor.role ?? actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office roles can request queue callbacks.");
    }

    return apiSuccess(await this.telnyxWebhookService.requestQueueCallback(recentCallId, {
      priority: typeof payload.priority === "string" ? payload.priority : null,
      notes: typeof payload.notes === "string" ? payload.notes : null,
      requestedByAuthUserId: actor.user.id,
    }));
  }

  @Post(":recentCallId/ai-enrichment")
  async submitAiEnrichment(
    @Req() request: RequestWithActor,
    @Param("recentCallId") recentCallId: string,
    @Body() payload: AiEnrichmentPayload,
  ) {
    const actor = request.actor;

    if (!actor || !canManageCallbackTasks(actor.role ?? actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office roles can update call AI enrichment.");
    }

    return apiSuccess(await this.telnyxWebhookService.submitAiEnrichment(recentCallId, {
      voicemailTranscription: this.optionalString(payload.voicemailTranscription),
      aiSummary: this.optionalString(payload.aiSummary),
      aiSentiment: this.optionalString(payload.aiSentiment),
      aiStatus: this.optionalString(payload.aiStatus),
      aiProvider: this.optionalString(payload.aiProvider),
      aiModel: this.optionalString(payload.aiModel),
      aiEnrichedAt: this.optionalDate(payload.aiEnrichedAt),
      updatedByAuthUserId: actor.user.id,
    }));
  }

  private optionalString(value: unknown) {
    if (value === undefined) {
      return undefined;
    }

    if (value === null || value === "") {
      return null;
    }

    if (typeof value !== "string") {
      apiError(400, "recent_call_payload_invalid", "Recent call payload values must be strings or null.");
    }

    return value;
  }

  private optionalDate(value: unknown) {
    if (value === undefined) {
      return undefined;
    }

    if (value === null || value === "") {
      return null;
    }

    if (typeof value !== "string") {
      apiError(400, "recent_call_payload_invalid", "The enrichment timestamp must be an ISO date string or null.");
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      apiError(400, "recent_call_payload_invalid", "The enrichment timestamp must be a valid date.");
    }

    return parsed;
  }
}
