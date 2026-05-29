import { HttpException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { requirePermission } from "../auth/permissions";
import { apiError } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { isMarketingOfficeRole } from "../marketing/marketing-access";
import type { AiActionKey, AiActionRegistryEntry } from "./ai-action-registry";
import { getAiActionRegistryEntry, isAiActionKey } from "./ai-action-registry";
import { AiActionTelemetryService } from "./ai-action-telemetry.service";
import { AiBrainBriefService } from "./ai-brain-brief.service";
import { AiCallIntakeService } from "./ai-call-intake.service";
import {
  resolveAiActionsV1Enabled,
  resolveAiBrainV1Enabled,
  resolveAiCopilotCallsSurfaceEnabled,
  resolveAiCopilotCustomerSmsDraftEnabled,
  resolveAiCopilotLlmEnabled,
  resolveAiFoundationEnabled,
  resolveAiOperatorCopilotEnabled,
  resolveAiVoiceIntakeFoundationEnabled,
} from "./ai-environment";
import { AiOperatorCopilotService } from "./ai-operator-copilot.service";
import {
  AI_FEATURE_BRAIN_V1_HOME,
  AI_FEATURE_CALL_INTAKE_ENVELOPE_V0,
  AI_FEATURE_OPERATOR_COPILOT_CALLS_SMS_V1,
  AI_PROMPT_VERSION_BRAIN_V1_TEMPLATE,
  AI_PROMPT_VERSION_CALL_INTAKE_V0,
  AI_PROMPT_VERSION_OPERATOR_COPILOT_SMS_V1,
} from "./ai.constants";

export type RunAiActionBody = {
  recentCallId?: string;
  sourceChannel?: string;
};

export type AiActionRunResponse = {
  actionKey: string;
  status: "ok" | "disabled" | "provider_not_configured" | "not_implemented" | "error";
  summary?: string;
  actions?: Array<{ title: string; href?: string; severity?: string }>;
  runId?: string;
  costEstimate?: number;
};

type EnvResolver = (raw: string | undefined) => boolean;

const FEATURE_FLAG_RESOLVERS: Record<string, EnvResolver> = {
  AI_FOUNDATION_ENABLED: resolveAiFoundationEnabled,
  AI_BRAIN_V1_ENABLED: resolveAiBrainV1Enabled,
  AI_VOICE_INTAKE_FOUNDATION_ENABLED: resolveAiVoiceIntakeFoundationEnabled,
  AI_OPERATOR_COPILOT_ENABLED: resolveAiOperatorCopilotEnabled,
  AI_COPILOT_CALLS_SURFACE_ENABLED: resolveAiCopilotCallsSurfaceEnabled,
  AI_COPILOT_CUSTOMER_SMS_DRAFT_ENABLED: resolveAiCopilotCustomerSmsDraftEnabled,
  AI_COPILOT_LLM_ENABLED: resolveAiCopilotLlmEnabled,
  AI_ACTIONS_V1_ENABLED: resolveAiActionsV1Enabled,
};

@Injectable()
export class AiActionsService {
  private readonly logger = new Logger(AiActionsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly brainBrief: AiBrainBriefService,
    private readonly callIntake: AiCallIntakeService,
    private readonly operatorCopilot: AiOperatorCopilotService,
    private readonly telemetry: AiActionTelemetryService,
  ) {}

  async runAction(
    request: RequestWithActor,
    actionKey: string,
    body: RunAiActionBody,
  ): Promise<AiActionRunResponse> {
    if (!isAiActionKey(actionKey)) {
      apiError(404, "ai_action_not_found", "The requested AI action is not registered.");
    }

    const entry = getAiActionRegistryEntry(actionKey)!;
    const startedAt = Date.now();

    if (!this.isActionsV1Enabled()) {
      return { actionKey, status: "disabled" };
    }

    if (entry.status === "disabled") {
      return { actionKey, status: "disabled" };
    }

    if (!this.areFeatureFlagsEnabled(entry.feature_flag)) {
      return { actionKey, status: "disabled" };
    }

    this.enforceActionPermission(request, entry);

    if (entry.status === "planned") {
      return { actionKey, status: "not_implemented" };
    }

    try {
      switch (entry.action_key) {
        case "home_brain_brief":
          return await this.runHomeBrainBrief(request, entry, startedAt);
        case "sms_followup_draft":
          return await this.runSmsFollowupDraft(request, body, entry, startedAt);
        case "missed_call_summary":
          return await this.runMissedCallSummary(request, body, entry, startedAt);
        default:
          return { actionKey, status: "not_implemented" };
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.warn(
        `ai_action_run_failed action=${actionKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { actionKey, status: "error", summary: "The AI action could not be completed." };
    }
  }

  private mergedEnvPreference(name: string): string | undefined {
    const rawEnv = process.env[name];
    const rawConfig = this.configService.get<string | undefined>(name);
    if (typeof rawEnv === "string" && rawEnv.trim() !== "") {
      return rawEnv;
    }
    return rawConfig ?? rawEnv ?? undefined;
  }

  private isActionsV1Enabled(): boolean {
    return resolveAiActionsV1Enabled(this.mergedEnvPreference("AI_ACTIONS_V1_ENABLED") ?? undefined);
  }

  private areFeatureFlagsEnabled(flags: string | string[]): boolean {
    const list = Array.isArray(flags) ? flags : [flags];
    return list.every((flag) => {
      const resolver = FEATURE_FLAG_RESOLVERS[flag];
      if (!resolver) {
        return false;
      }
      return resolver(this.mergedEnvPreference(flag) ?? undefined);
    });
  }

  private enforceActionPermission(request: RequestWithActor, entry: AiActionRegistryEntry) {
    const permissions = Array.isArray(entry.required_permission)
      ? entry.required_permission
      : [entry.required_permission];

    for (const permission of permissions) {
      if (permission === "marketing.office.read") {
        const role = request.actor?.role ?? request.actor?.profile?.role ?? null;
        if (!isMarketingOfficeRole(role)) {
          apiError(
            403,
            "marketing_access_forbidden",
            "This account cannot access the Growth Center.",
          );
        }
        continue;
      }

      requirePermission(
        request.actor,
        permission as Parameters<typeof requirePermission>[1],
        "forbidden",
        "This action is not available for the current account.",
      );
    }
  }

  private async runHomeBrainBrief(
    request: RequestWithActor,
    entry: AiActionRegistryEntry,
    startedAt: number,
  ): Promise<AiActionRunResponse> {
    const brief = await this.brainBrief.getBrainHomeBrief(request);
    const latencyMs = Date.now() - startedAt;
    const organizationId = request.actor?.organization_id?.trim() ?? "";
    const actorProfileId = request.actor?.profile?.id ?? null;

    const unifiedRunId = await this.telemetry.recordActionRun({
      organizationId,
      actorProfileId,
      actionKey: entry.action_key,
      provider: "deterministic",
      featureKey: entry.legacy_feature_key ?? AI_FEATURE_BRAIN_V1_HOME,
      promptVersion: AI_PROMPT_VERSION_BRAIN_V1_TEMPLATE,
      status: "completed",
      latencyMs,
      traceEnvelope: {
        wrapped_run_id: brief.runId,
        rules_engine_version: brief.rulesEngineVersion,
        digest: brief.digest,
      },
    });

    return {
      actionKey: entry.action_key,
      status: "ok",
      summary: `${brief.briefing.headline}\n\n${brief.briefing.body}`,
      actions: brief.actions.map((action) => ({
        title: action.title,
        href: action.href,
        severity: action.severity,
      })),
      runId: unifiedRunId,
      costEstimate: 0,
    };
  }

  private async runSmsFollowupDraft(
    request: RequestWithActor,
    body: RunAiActionBody,
    entry: AiActionRegistryEntry,
    startedAt: number,
  ): Promise<AiActionRunResponse> {
    const draft = await this.operatorCopilot.generateSmsDraft(request, {
      recentCallId: body.recentCallId,
    });
    const latencyMs = Date.now() - startedAt;
    const organizationId = request.actor?.organization_id?.trim() ?? "";
    const actorProfileId = request.actor?.profile?.id ?? null;
    const bodyText = draft.effectiveBody?.trim() || "";
    const usedLlm = Boolean(draft.modelId);
    const costEstimate = usedLlm ? undefined : 0;

    const unifiedRunId = await this.telemetry.recordActionRun({
      organizationId,
      actorProfileId,
      actionKey: entry.action_key,
      provider: usedLlm ? "deepseek" : "deterministic",
      featureKey: entry.legacy_feature_key ?? AI_FEATURE_OPERATOR_COPILOT_CALLS_SMS_V1,
      promptVersion: AI_PROMPT_VERSION_OPERATOR_COPILOT_SMS_V1,
      status: "completed",
      modelId: draft.modelId,
      latencyMs,
      traceEnvelope: {
        wrapped_recommendation_run_id: draft.recommendationRunId,
        draft_id: draft.draftId,
        generation_path: draft.generationPath,
        limitations: draft.limitations,
      },
    });

    let summary = bodyText;
    if (draft.limitations?.length) {
      summary = `${bodyText}\n\nNote: ${draft.limitations.map((l) => l.message).join(" ")}`;
    }

    return {
      actionKey: entry.action_key,
      status: "ok",
      summary,
      runId: unifiedRunId,
      costEstimate,
    };
  }

  private async runMissedCallSummary(
    request: RequestWithActor,
    body: RunAiActionBody,
    entry: AiActionRegistryEntry,
    startedAt: number,
  ): Promise<AiActionRunResponse> {
    const intake = await this.callIntake.runCallIntakeEnvelopeDryRun(request, {
      recentCallId: body.recentCallId,
      sourceChannel: body.sourceChannel,
    });
    const latencyMs = Date.now() - startedAt;
    const organizationId = request.actor?.organization_id?.trim() ?? "";
    const actorProfileId = request.actor?.profile?.id ?? null;

    const sections = intake.envelope.sections;
    const sectionLines = Object.entries(sections).map(([key, value]) => {
      if (typeof value === "object" && value !== null && "text" in value) {
        const text = String((value as { text?: unknown }).text ?? "—");
        return `${key}: ${text}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    });

    const unifiedRunId = await this.telemetry.recordActionRun({
      organizationId,
      actorProfileId,
      actionKey: entry.action_key,
      provider: "deterministic",
      featureKey: entry.legacy_feature_key ?? AI_FEATURE_CALL_INTAKE_ENVELOPE_V0,
      promptVersion: AI_PROMPT_VERSION_CALL_INTAKE_V0,
      status: "completed",
      latencyMs,
      traceEnvelope: {
        wrapped_run_id: intake.runId,
        recent_call_id: intake.recentCallId,
        digest: intake.digest,
        section_keys: Object.keys(sections),
      },
    });

    return {
      actionKey: entry.action_key,
      status: "ok",
      summary: sectionLines.join("\n\n"),
      runId: unifiedRunId,
      costEstimate: 0,
    };
  }
}
