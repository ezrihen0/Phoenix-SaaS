import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";

import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { AiBrainBriefService } from "./ai-brain-brief.service";
import type { RunAiActionBody } from "./ai-actions.service";
import { AiActionsService } from "./ai-actions.service";
import type { AiCallIntakeDryRunDto } from "./ai-call-intake.service";
import { AiCallIntakeService } from "./ai-call-intake.service";
import type { GenerateSmsDraftBody, PatchSmsDraftBody } from "./ai-operator-copilot.service";
import { AiOperatorCopilotService } from "./ai-operator-copilot.service";
import type { AiDryRunDto } from "./ai-orchestration.service";
import { AiOrchestrationService } from "./ai-orchestration.service";
import { AiUsageService } from "./ai-usage.service";
import type { AiChatFeedbackRequestBody, AiChatRequestBody } from "./ai-chat.service";
import { AiChatService } from "./ai-chat.service";
import type { FieldCopilotRequestBody } from "./ai-field-copilot.service";
import { AiFieldCopilotService } from "./ai-field-copilot.service";

@Controller("api/ai")
@UseGuards(SessionGuard, OperationalAccessGuard)
export class AiController {
  constructor(
    private readonly aiOrchestrationService: AiOrchestrationService,
    private readonly aiBrainBriefService: AiBrainBriefService,
    private readonly aiCallIntakeService: AiCallIntakeService,
    private readonly aiOperatorCopilotService: AiOperatorCopilotService,
    private readonly aiActionsService: AiActionsService,
    private readonly aiUsageService: AiUsageService,
    private readonly aiChatService: AiChatService,
    private readonly aiFieldCopilotService: AiFieldCopilotService,
  ) {}

  /**
   * Phase 0: authenticated orchestration proving tool registry wiring + bounded audit persistence.
   * Disabled unless `AI_FOUNDATION_ENABLED=true` (403 `ai_foundation_disabled`).
   */
  @Post("tools/dry-run")
  async dryRunTool(@Req() request: RequestWithActor, @Body() body: AiDryRunDto) {
    const payload = await this.aiOrchestrationService.runToolDryRun(request, body ?? {});
    return apiSuccess(payload);
  }

  /**
   * Phase 1 Brain V1 `/home`: deterministic rules + template copy.
   * Foundation off → `ai_foundation_disabled`. Foundation on, Brain flag off → `ai_brain_v1_disabled`.
   */
  @Get("brain/home-brief")
  async brainHomeBrief(@Req() request: RequestWithActor) {
    const payload = await this.aiBrainBriefService.getBrainHomeBrief(request);
    return apiSuccess(payload);
  }

  /**
   * Phase 1.5A: staff call-intake envelope dry-run over `recent_calls`.
   * Foundation off → `ai_foundation_disabled`; foundation on, voice intake flag off → `ai_voice_intake_disabled`.
   * Requires `calls.view`. Body: `{ "recentCallId": "<uuid>", "sourceChannel"?: string }`.
   * Manual: set `AI_FOUNDATION_ENABLED` and `AI_VOICE_INTAKE_FOUNDATION_ENABLED`; POST with session cookie;
   * expect `feature_key` = `call_intake_envelope_v0` and `status` = `completed` on `ai_recommendation_runs`.
   */
  @Post("intake/call-envelope/dry-run")
  async callIntakeEnvelopeDryRun(@Req() request: RequestWithActor, @Body() body: AiCallIntakeDryRunDto) {
    const payload = await this.aiCallIntakeService.runCallIntakeEnvelopeDryRun(request, body ?? {});
    return apiSuccess(payload);
  }

  /**
   * Phase 2 — Operator Copilot SMS follow-up draft (calls surface).
   * Gates: `AI_FOUNDATION_ENABLED`, `AI_OPERATOR_COPILOT_ENABLED`, `AI_COPILOT_CALLS_SURFACE_ENABLED`, `AI_COPILOT_CUSTOMER_SMS_DRAFT_ENABLED`.
   * Optional LLM: `AI_COPILOT_LLM_ENABLED` + `DEEPSEEK_API_KEY`.
   */
  @Post("copilot/calls/sms-draft/generate")
  async copilotGenerateSmsDraft(@Req() request: RequestWithActor, @Body() body: GenerateSmsDraftBody) {
    const payload = await this.aiOperatorCopilotService.generateSmsDraft(request, body ?? {});
    return apiSuccess(payload);
  }

  /**
   * Loads the Copilot SMS draft for a call: **`active` first**, else **latest `sent`**
   * for the same `recentCallId` + SMS draft type (`updated_at DESC`, `created_at DESC` tie-break).
   * Phase 4: when `AI_COPILOT_CUSTOMER_SMS_OUTCOME_TRACKING_ENABLED`, response may include read-only outcome fields.
   */
  @Get("copilot/calls/sms-draft")
  async copilotGetSmsDraft(@Req() request: RequestWithActor, @Query("recentCallId") recentCallId: string | undefined) {
    const payload = await this.aiOperatorCopilotService.getSmsDraftForRecentCall(request, recentCallId ?? "");
    return apiSuccess(payload);
  }

  @Patch("copilot/calls/sms-draft/:draftId")
  async copilotPatchSmsDraft(
    @Req() request: RequestWithActor,
    @Param("draftId") draftId: string,
    @Body() body: PatchSmsDraftBody,
  ) {
    const payload = await this.aiOperatorCopilotService.patchSmsDraft(request, draftId, body ?? {});
    return apiSuccess(payload);
  }

  @Post("copilot/calls/sms-draft/:draftId/dismiss")
  async copilotDismissSmsDraft(@Req() request: RequestWithActor, @Param("draftId") draftId: string) {
    const payload = await this.aiOperatorCopilotService.dismissSmsDraft(request, draftId);
    return apiSuccess(payload);
  }

  /**
   * Phase 3 — guarded send (human-confirmed on client). Gates: Phase 2 Copilot flags +
   * `AI_COPILOT_CUSTOMER_SMS_GUARDED_SEND_ENABLED` + `calls.view` + `messaging.send`.
   */
  @Post("copilot/calls/sms-draft/:draftId/send")
  async copilotSendSmsDraft(@Req() request: RequestWithActor, @Param("draftId") draftId: string) {
    const payload = await this.aiOperatorCopilotService.executeGuardedSmsSend(request, draftId);
    return apiSuccess(payload);
  }

  /**
   * AI Actions V1 — unified action runner (wrap-only; existing endpoints unchanged).
   * Gate: `AI_ACTIONS_V1_ENABLED` (+ per-action flags in registry).
   */
  @Post("actions/:actionKey/run")
  async runAiAction(
    @Req() request: RequestWithActor,
    @Param("actionKey") actionKey: string,
    @Body() body: RunAiActionBody,
  ) {
    const payload = await this.aiActionsService.runAction(request, actionKey, body ?? {});
    return apiSuccess(payload);
  }

  /**
   * AI Actions V1 — owner-only month-to-date usage aggregates for Settings panel.
   */
  @Get("usage/summary")
  async aiUsageSummary(@Req() request: RequestWithActor) {
    const payload = await this.aiUsageService.getUsageSummary(request);
    return apiSuccess(payload);
  }

  /**
   * WizField AI Chat — owner/admin general Q&A via DeepSeek. No CRM mutation or outbound side effects.
   * Gates: `AI_FOUNDATION_ENABLED`, `AI_CHAT_ENABLED`, `DEEPSEEK_API_KEY`.
   */
  @Post("chat")
  async aiChat(@Req() request: RequestWithActor, @Body() body: AiChatRequestBody) {
    const payload = await this.aiChatService.postChat(request, body ?? {});
    return apiSuccess(payload);
  }

  /**
   * Product telemetry only — records useful / not_useful on a prior chat run (org-scoped).
   */
  @Post("chat/:runId/feedback")
  async aiChatFeedback(
    @Req() request: RequestWithActor,
    @Param("runId") runId: string,
    @Body() body: AiChatFeedbackRequestBody,
  ) {
    const payload = await this.aiChatService.postChatFeedback(request, runId, body ?? {});
    return apiSuccess(payload);
  }

  /**
   * Field Copilot — gas fireplace trade knowledge via DeepSeek (allowlisted packs only).
   * Gates: `AI_FOUNDATION_ENABLED`, `AI_FIELD_COPILOT_ENABLED`, `DEEPSEEK_API_KEY`.
   * Body: `{ message, jobId?, knowledgeDomain? }` — domain defaults to `gas_fireplace`.
   */
  @Post("field-copilot")
  async fieldCopilot(@Req() request: RequestWithActor, @Body() body: FieldCopilotRequestBody) {
    const payload = await this.aiFieldCopilotService.postFieldCopilot(request, body ?? {});
    return apiSuccess(payload);
  }
}