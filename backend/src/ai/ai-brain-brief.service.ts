import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";

import { requirePermission } from "../auth/permissions";
import { CrmOfficeDashboardService } from "../crm/crm-office-dashboard.service";
import { apiError } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import type { AiRecommendationRunEntity } from "../database/entities/ai-recommendation-run.entity";
import { resolveAiBrainV1Enabled, resolveAiFoundationEnabled } from "./ai-environment";
import { AiAuditService } from "./ai-audit.service";
import {
  AI_BRAIN_TRACE_SCHEMA_VERSION,
  AI_FEATURE_BRAIN_V1_HOME,
  AI_MAX_SERIALIZED_TOOL_OUTPUT_BYTES,
  AI_PROMPT_VERSION_BRAIN_V1_TEMPLATE,
} from "./ai.constants";
import type { AiModelInvoker } from "./ai-model-invoker";
import { aiModelInvokerToken } from "./ai-model-invoker";
import { BRAIN_HOME_DISCLAIMER_V1, assembleBrainTemplateBriefV1 } from "./brain-template-wording";
import {
  buildBrainMinimalInputV1,
  digestBrainMinimalInputV1,
  serializedMinimalInputByteLength,
} from "./brain-minimal-input.v1";
import { BrainRulesEngine } from "./brain-rules.engine";

export type AiBrainHomeBriefResponse = {
  runId: string;
  briefing: {
    headline: string;
    body: string;
  };
  disclaimer: string;
  actions: Array<{
    ruleId: string;
    severity: "high" | "medium" | "low";
    title: string;
    groundingLine: string;
    href: string;
    explainBullets: string[];
  }>;
  wordingMode: "template_v1";
  model: { skipped: true; reasonCode: string };
  digest: string;
  rulesEngineVersion: string;
  traceSchemaVersion: string;
};

@Injectable()
export class AiBrainBriefService {
  private readonly logger = new Logger(AiBrainBriefService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly crmOfficeDashboard: CrmOfficeDashboardService,
    private readonly audit: AiAuditService,
    private readonly rulesEngine: BrainRulesEngine,
    @Inject(aiModelInvokerToken) private readonly modelInvoker: AiModelInvoker,
  ) {}

  private mergedEnvPreference(name: string): string | undefined {
    const rawEnv = process.env[name];
    const rawConfig = this.configService.get<string | undefined>(name);
    if (typeof rawEnv === "string" && rawEnv.trim() !== "") {
      return rawEnv;
    }
    return rawConfig ?? rawEnv ?? undefined;
  }

  private enforceFoundationEnabledGate() {
    const merged = this.mergedEnvPreference("AI_FOUNDATION_ENABLED");
    if (!resolveAiFoundationEnabled(merged ?? undefined)) {
      apiError(
        403,
        "ai_foundation_disabled",
        "AI foundation endpoints are disabled in this environment.",
      );
    }
  }

  private enforceBrainV1EnabledGate() {
    const merged = this.mergedEnvPreference("AI_BRAIN_V1_ENABLED");
    if (!resolveAiBrainV1Enabled(merged ?? undefined)) {
      apiError(
        403,
        "ai_brain_v1_disabled",
        "Brain home brief is disabled in this environment.",
      );
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

  async getBrainHomeBrief(request: RequestWithActor): Promise<AiBrainHomeBriefResponse> {
    this.logger.log(`ai.brain.home_brief.start org=${request.actor?.organization_id ?? "unset"}`);
    this.enforceFoundationEnabledGate();
    this.enforceBrainV1EnabledGate();

    const actor = requirePermission(
      request.actor,
      "dashboard.office.view",
      "dashboard_view_forbidden",
      "This account cannot view the office dashboard.",
    );
    const organizationId = this.requireActiveOrganizationIdFromActor(actor.organization_id);
    const actorProfileId = actor.profile.id;
    const sourceChannel = "ui";

    try {
      const snapshot = await this.crmOfficeDashboard.loadOfficeDashboardSnapshot(organizationId);
      const asOf = new Date();
      const minimal = buildBrainMinimalInputV1(snapshot, asOf);
      const byteLength = serializedMinimalInputByteLength(minimal);
      if (byteLength > AI_MAX_SERIALIZED_TOOL_OUTPUT_BYTES) {
        await this.persistRunQuiet({
          id: randomUUID(),
          organization_id: organizationId,
          actor_profile_id: actorProfileId,
          source_channel: sourceChannel,
          feature_key: AI_FEATURE_BRAIN_V1_HOME,
          tool_trace_json: JSON.stringify({
            trace_schema_version: AI_BRAIN_TRACE_SCHEMA_VERSION,
            minimal_input_digest: null,
            error: "oversized_brain_minimal_input",
          }),
          model_id: null,
          prompt_version: AI_PROMPT_VERSION_BRAIN_V1_TEMPLATE,
          status: "failed",
          error_code: "ai_context_oversized",
        });
        apiError(
          413,
          "ai_context_oversized",
          "Brain briefing input exceeded the bounded context allowance.",
        );
      }

      const digest = digestBrainMinimalInputV1(minimal);
      const evaluation = this.rulesEngine.evaluate(minimal);
      const template = assembleBrainTemplateBriefV1(minimal, evaluation.actions);
      const modelOutcome = await this.modelInvoker.invoke({
        featureKey: AI_FEATURE_BRAIN_V1_HOME,
        organizationId,
      });

      const trace = JSON.stringify({
        trace_schema_version: AI_BRAIN_TRACE_SCHEMA_VERSION,
        rules_engine_version: evaluation.rulesEngineVersion,
        minimal_input_digest: digest,
        minimal_input_byte_length: byteLength,
        wording_mode: "template_v1",
        rules_fired: evaluation.rulesFiredOrdered,
        actions_emitted: evaluation.actions.map((a) => ({
          ruleId: a.ruleId,
          severity: a.severity,
          href: a.href,
        })),
        model: modelOutcome,
      });

      const runId = randomUUID();
      await this.audit.persistRun({
        id: runId,
        organization_id: organizationId,
        actor_profile_id: actorProfileId,
        source_channel: sourceChannel,
        feature_key: AI_FEATURE_BRAIN_V1_HOME,
        tool_trace_json: trace,
        model_id: null,
        prompt_version: AI_PROMPT_VERSION_BRAIN_V1_TEMPLATE,
        status: "completed",
        error_code: null,
      });

      return {
        runId,
        briefing: template,
        disclaimer: BRAIN_HOME_DISCLAIMER_V1,
        actions: evaluation.actions,
        wordingMode: "template_v1",
        model: modelOutcome,
        digest,
        rulesEngineVersion: evaluation.rulesEngineVersion,
        traceSchemaVersion: AI_BRAIN_TRACE_SCHEMA_VERSION,
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
        feature_key: AI_FEATURE_BRAIN_V1_HOME,
        tool_trace_json: JSON.stringify({
          trace_schema_version: AI_BRAIN_TRACE_SCHEMA_VERSION,
          error: message.slice(0, 280),
        }),
        model_id: null,
        prompt_version: AI_PROMPT_VERSION_BRAIN_V1_TEMPLATE,
        status: "failed",
        error_code: "ai_brain_brief_failed",
      });
      apiError(
        500,
        "ai_brain_brief_failed",
        "Brain home briefing failed while assembling the deterministic snapshot.",
        message,
      );
    }
  }
}