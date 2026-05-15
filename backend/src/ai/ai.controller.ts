import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { AiBrainBriefService } from "./ai-brain-brief.service";
import type { AiCallIntakeDryRunDto } from "./ai-call-intake.service";
import { AiCallIntakeService } from "./ai-call-intake.service";
import type { AiDryRunDto } from "./ai-orchestration.service";
import { AiOrchestrationService } from "./ai-orchestration.service";

@Controller("api/ai")
@UseGuards(SessionGuard)
export class AiController {
  constructor(
    private readonly aiOrchestrationService: AiOrchestrationService,
    private readonly aiBrainBriefService: AiBrainBriefService,
    private readonly aiCallIntakeService: AiCallIntakeService,
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
}