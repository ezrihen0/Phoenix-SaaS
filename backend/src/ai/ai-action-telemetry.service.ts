import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";

import type { AiRecommendationRunEntity } from "../database/entities/ai-recommendation-run.entity";
import { AiAuditService } from "./ai-audit.service";
import {
  AI_ACTIONS_TRACE_SCHEMA_VERSION,
  AI_SOURCE_CHANNEL_UI,
} from "./ai.constants";
export type RecordActionRunInput = {
  organizationId: string;
  actorProfileId: string | null;
  actionKey: string;
  provider: string;
  featureKey: string;
  promptVersion: string;
  status: "completed" | "failed" | "refused";
  errorCode?: string | null;
  modelId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
  latencyMs?: number | null;
  sourceChannel?: string;
  traceEnvelope?: Record<string, unknown>;
};

@Injectable()
export class AiActionTelemetryService {
  private readonly logger = new Logger(AiActionTelemetryService.name);

  constructor(private readonly audit: AiAuditService) {}

  async recordActionRun(input: RecordActionRunInput): Promise<string> {
    const runId = randomUUID();
    const trace = JSON.stringify({
      trace_schema_version: AI_ACTIONS_TRACE_SCHEMA_VERSION,
      action_key: input.actionKey,
      provider: input.provider,
      ...(input.traceEnvelope ?? {}),
    });

    const estimatedCostUsd = input.estimatedCostUsd != null
      ? input.estimatedCostUsd.toFixed(6)
      : null;

    const row: Partial<AiRecommendationRunEntity> = {
      id: runId,
      organization_id: input.organizationId,
      actor_profile_id: input.actorProfileId,
      source_channel: input.sourceChannel ?? AI_SOURCE_CHANNEL_UI,
      feature_key: input.featureKey,
      action_key: input.actionKey,
      provider: input.provider,
      tool_trace_json: trace,
      model_id: input.modelId ?? null,
      prompt_version: input.promptVersion,
      status: input.status,
      error_code: input.errorCode ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      estimated_cost_usd: estimatedCostUsd,
      latency_ms: input.latencyMs ?? null,
      clicked_action: null,
      outcome_key: null,
    };

    try {
      await this.audit.persistRun(row);
    } catch (persistError) {
      this.logger.warn(
        `ai_action_telemetry_persist_failed action=${input.actionKey} feature=${input.featureKey}: `
          + `${persistError instanceof Error ? persistError.message : String(persistError)}`,
      );
    }

    return runId;
  }
}
