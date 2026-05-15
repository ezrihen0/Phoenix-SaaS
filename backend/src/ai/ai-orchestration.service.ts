import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "crypto";

import { requirePermission } from "../auth/permissions";
import { apiError } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import type { AiRecommendationRunEntity } from "../database/entities/ai-recommendation-run.entity";
import type { AiModelInvoker } from "./ai-model-invoker";
import { aiModelInvokerToken } from "./ai-model-invoker";
import { AiAuditService } from "./ai-audit.service";
import { AiContextBuilderService } from "./ai-context-builder.service";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import {
  AI_FEATURE_PHASE0_DRY_RUN,
  AI_PROMPT_VERSION_PHASE0,
} from "./ai.constants";
import { resolveAiFoundationEnabled } from "./ai-environment";

export type AiDryRunDto = {
  toolId?: string;
  sourceChannel?: string;
};

function sha256Utf8(payload: string) {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function normalizeOptionalSourceChannel(raw: string | undefined) {
  const trimmed = (raw ?? "").trim();
  return (trimmed === "" ? "ui" : trimmed).slice(0, 32);
}

@Injectable()
export class AiOrchestrationService {
  private readonly logger = new Logger(AiOrchestrationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly registry: AiToolRegistryService,
    private readonly audit: AiAuditService,
    private readonly contextBuilder: AiContextBuilderService,
    @Inject(aiModelInvokerToken) private readonly modelInvoker: AiModelInvoker,
  ) {}

  private enforceFoundationEnabledGate() {
    const rawEnv = process.env.AI_FOUNDATION_ENABLED;
    const rawConfig = this.configService.get<string | undefined>("AI_FOUNDATION_ENABLED");
    const merged = typeof rawEnv === "string" && rawEnv.trim() !== ""
      ? rawEnv
      : rawConfig ?? rawEnv ?? "";
    if (!resolveAiFoundationEnabled(typeof merged === "string" ? merged : undefined)) {
      apiError(403, "ai_foundation_disabled", "AI foundation endpoints are disabled in this environment.");
    }
  }

  private requireActiveOrganizationIdFromActor(actorOrgId: string | null | undefined) {
    const organizationId = actorOrgId?.trim();
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for this action.");
    }
    return organizationId;
  }

  private async persistRunQuiet(row: Partial<AiRecommendationRunEntity>) {
    try {
      await this.audit.persistRun(row);
    } catch (persistError) {
      this.logger.warn(
        `ai_audit_persist_failed: ${persistError instanceof Error ? persistError.message : String(persistError)}`,
      );
    }
  }

  async runToolDryRun(request: RequestWithActor, dto: AiDryRunDto) {
    this.logger.log(`ai.tool_dry_run.start org=${request.actor?.organization_id ?? "unset"}`);
    this.enforceFoundationEnabledGate();

    const actor = requirePermission(
      request.actor,
      "dashboard.office.view",
      "dashboard_view_forbidden",
      "This account cannot view the office dashboard.",
    );
    const organizationId = this.requireActiveOrganizationIdFromActor(actor.organization_id);
    const actorProfileId = actor.profile.id;
    const sourceChannel = normalizeOptionalSourceChannel(dto.sourceChannel);

    const toolNormalized = typeof dto.toolId === "string" ? dto.toolId.trim() : "";
    if (!toolNormalized) {
      apiError(400, "ai_tool_request_invalid", "toolId must be a non-empty string.");
    }

    const resolvedTool = this.registry.resolveRegisteredTool(toolNormalized);

    if (!resolvedTool) {
      await this.persistRunQuiet({
        id: randomUUID(),
        organization_id: organizationId,
        actor_profile_id: actorProfileId,
        source_channel: sourceChannel,
        feature_key: AI_FEATURE_PHASE0_DRY_RUN,
        tool_trace_json: JSON.stringify({ tools: [{ id: toolNormalized, error: "unknown_tool" }] }),
        model_id: null,
        prompt_version: AI_PROMPT_VERSION_PHASE0,
        status: "failed",
        error_code: "ai_tool_unknown",
      });
      apiError(400, "ai_tool_unknown", "The requested tool is not available for Phase 0.");
    }

    const modelOutcome = await this.modelInvoker.invoke({
      featureKey: AI_FEATURE_PHASE0_DRY_RUN,
      organizationId,
    });

    try {
      const toolOutput = await this.registry.executeRegisteredTool(resolvedTool, organizationId);
      const { json, byteLength } = this.contextBuilder.summarizeToolOutput(toolOutput);
      if (!this.contextBuilder.enforceOutputCap(byteLength)) {
        await this.persistRunQuiet({
          id: randomUUID(),
          organization_id: organizationId,
          actor_profile_id: actorProfileId,
          source_channel: sourceChannel,
          feature_key: AI_FEATURE_PHASE0_DRY_RUN,
          tool_trace_json: JSON.stringify({
            tools: [{ id: resolvedTool, byte_length: byteLength, error: "oversized_context" }],
          }),
          model_id: null,
          prompt_version: AI_PROMPT_VERSION_PHASE0,
          status: "failed",
          error_code: "ai_context_oversized",
        });
        apiError(413, "ai_context_oversized", "Resolved tool output exceeded the bounded context allowance.");
      }

      const digest = sha256Utf8(json);
      const trace = JSON.stringify({
        tools: [{ id: resolvedTool, sha256_hex: digest, byte_length: byteLength }],
      });
      const runId = randomUUID();
      await this.audit.persistRun({
        id: runId,
        organization_id: organizationId,
        actor_profile_id: actorProfileId,
        source_channel: sourceChannel,
        feature_key: AI_FEATURE_PHASE0_DRY_RUN,
        tool_trace_json: trace,
        model_id: null,
        prompt_version: AI_PROMPT_VERSION_PHASE0,
        status: "completed",
        error_code: null,
      });
      this.logger.log(`ai.tool_dry_run.end runId=${runId} tool=${resolvedTool}`);

      return {
        runId,
        toolId: resolvedTool,
        featureKey: AI_FEATURE_PHASE0_DRY_RUN,
        sourceChannel,
        digest,
        outputByteLength: byteLength,
        model: modelOutcome,
        toolOutput,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const failedId = randomUUID();
      const message = error instanceof Error ? error.message : String(error);
      await this.persistRunQuiet({
        id: failedId,
        organization_id: organizationId,
        actor_profile_id: actorProfileId,
        source_channel: sourceChannel,
        feature_key: AI_FEATURE_PHASE0_DRY_RUN,
        tool_trace_json: JSON.stringify({ tools: [{ id: resolvedTool, error: message.slice(0, 280) }] }),
        model_id: null,
        prompt_version: AI_PROMPT_VERSION_PHASE0,
        status: "failed",
        error_code: "ai_tool_execution_failed",
      });
      apiError(
        500,
        "ai_tool_execution_failed",
        "The AI orchestration dry-run failed while executing a registered tool.",
        message,
      );
    }
  }
}

