import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { apiError } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import type { ProfileRole } from "../crm/constants";
import { AiActionTelemetryService } from "./ai-action-telemetry.service";
import {
  AI_AGENT_KEY_FIELD_COPILOT,
  AI_DEEPSEEK_PROVIDER_NAME,
  AI_FEATURE_FIELD_COPILOT_V1,
  AI_PROMPT_VERSION_FIELD_COPILOT_V1,
} from "./ai.constants";
import { AiDeepSeekProviderService } from "./ai-deepseek-provider.service";
import { AiFieldJobContextService } from "./ai-field-job-context.service";
import { AiFieldKnowledgeService } from "./ai-field-knowledge.service";
import type { FieldKnowledgeSelectionKey } from "./field-knowledge/field-knowledge.constants";
import { resolveAiFieldCopilotEnabled, resolveAiFoundationEnabled } from "./ai-environment";

export type FieldCopilotRequestBody = {
  message?: string;
  jobId?: string;
  knowledgeDomain?: string;
};

export type FieldCopilotResponse = {
  status: "ok" | "provider_not_configured" | "disabled" | "error";
  agentKey: typeof AI_AGENT_KEY_FIELD_COPILOT;
  provider: typeof AI_DEEPSEEK_PROVIDER_NAME;
  model: string;
  message: string;
  knowledgeDomain: string;
  topicsUsed: FieldKnowledgeSelectionKey[];
  runId?: string;
};

const FIELD_COPILOT_ALLOWED_ROLES = new Set<ProfileRole>([
  "owner",
  "admin",
  "office_admin",
  "dispatcher",
  "technician",
]);

const FIELD_COPILOT_SYSTEM_PROMPT =
  "You are WizField Field Copilot — a read-only field assistant for gas fireplace service, inspection, documentation, and safe sales support. "
  + "You receive FIELD_KNOWLEDGE excerpts (generic trade knowledge) and optional FIELD_JOB_CONTEXT (org-scoped job snapshot). "
  + "You have no database, filesystem, env, log, source code, or cross-tenant access. "
  + "HARD BOUNDARIES: Do not provide final gas code compliance certification. "
  + "Do not state exact clearance numbers unless the user provides a specific approved manual/code excerpt in the message. "
  + "Do not instruct unlicensed gas work, gas pressure adjustment, burner modification, or bypassing safeties. "
  + "Do not promise service eliminates CO risk or that the appliance is 'safe' without qualified scope. "
  + "Do not recommend parts without verified model/manual compatibility. "
  + "Manufacturer instructions and applicable local code are always controlling. "
  + "On safety concern: document, stop use if needed, escalate to qualified gasfitter/supervisor. "
  + "STRUCTURE every answer with these sections (use clear headings): "
  + "1) Immediate safety concern (if any) "
  + "2) What to inspect first "
  + "3) What evidence to collect "
  + "4) What to tell the customer "
  + "5) What not to promise "
  + "6) Recommended next step "
  + "7) When to escalate";

@Injectable()
export class AiFieldCopilotService {
  private readonly logger = new Logger(AiFieldCopilotService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly deepSeekProvider: AiDeepSeekProviderService,
    private readonly telemetry: AiActionTelemetryService,
    private readonly fieldKnowledge: AiFieldKnowledgeService,
    private readonly fieldJobContext: AiFieldJobContextService,
  ) {}

  private mergedEnvPreference(name: string): string | undefined {
    const rawEnv = process.env[name];
    const rawConfig = this.configService.get<string | undefined>(name);
    if (typeof rawEnv === "string" && rawEnv.trim() !== "") {
      return rawEnv;
    }
    return rawConfig ?? rawEnv ?? undefined;
  }

  private enforceFieldCopilotAccess(request: RequestWithActor) {
    const role = (request.actor?.role ?? request.actor?.profile?.role ?? null) as ProfileRole | null;
    if (!role || !FIELD_COPILOT_ALLOWED_ROLES.has(role)) {
      apiError(403, "field_copilot_forbidden", "Field Copilot is not available for this role.");
    }
  }

  private requireActiveOrganizationIdFromActor(actorOrgId: string | null | undefined): string {
    const organizationId = actorOrgId?.trim();
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for this action.");
    }
    return organizationId;
  }

  async postFieldCopilot(
    request: RequestWithActor,
    body: FieldCopilotRequestBody,
  ): Promise<FieldCopilotResponse> {
    const model = this.deepSeekProvider.readConfiguredModelId();
    const knowledgeDomain = this.fieldKnowledge.assertApprovedDomain(body.knowledgeDomain);
    const baseResponse = {
      agentKey: AI_AGENT_KEY_FIELD_COPILOT,
      provider: AI_DEEPSEEK_PROVIDER_NAME,
      model,
      message: "",
      knowledgeDomain,
      topicsUsed: [] as FieldKnowledgeSelectionKey[],
    } satisfies Omit<FieldCopilotResponse, "status">;

    if (!resolveAiFoundationEnabled(this.mergedEnvPreference("AI_FOUNDATION_ENABLED") ?? undefined)) {
      return { ...baseResponse, status: "disabled", message: "Field Copilot is disabled in this environment." };
    }

    if (!resolveAiFieldCopilotEnabled(this.mergedEnvPreference("AI_FIELD_COPILOT_ENABLED") ?? undefined)) {
      return { ...baseResponse, status: "disabled", message: "Field Copilot is disabled in this environment." };
    }

    this.enforceFieldCopilotAccess(request);

    const organizationId = this.requireActiveOrganizationIdFromActor(request.actor?.organization_id);
    const actorProfileId = request.actor?.profile?.id ?? null;
    const userMessage = typeof body.message === "string" ? body.message.trim() : "";

    if (!userMessage) {
      apiError(400, "field_copilot_message_required", "message is required.");
    }

    if (userMessage.length > 4000) {
      apiError(400, "field_copilot_message_too_long", "message must be 4000 characters or fewer.");
    }

    if (body.jobId != null && typeof body.jobId !== "string") {
      apiError(400, "field_copilot_job_id_invalid", "jobId must be a string when provided.");
    }

    if (!this.deepSeekProvider.isConfigured()) {
      return {
        ...baseResponse,
        status: "provider_not_configured",
        message: "DeepSeek is not configured. Add DEEPSEEK_API_KEY to the backend.",
      };
    }

    const actor = request.actor;
    if (!actor) {
      apiError(401, "unauthorized", "Authentication is required.");
    }

    const jobContext = await this.fieldJobContext.buildFieldJobContextV1(
      organizationId,
      actor,
      body.jobId,
    );

    const knowledgeBundle = await this.fieldKnowledge.loadKnowledgeBundle(knowledgeDomain, userMessage, {
      serviceCity: jobContext?.service_city ?? null,
    });

    const knowledgeBlock = this.fieldKnowledge.formatBundleForPrompt(knowledgeBundle);
    const jobBlock = this.fieldJobContext.formatForPrompt(jobContext);
    const systemPrompt = `${FIELD_COPILOT_SYSTEM_PROMPT}\n\n${knowledgeBlock}\n\n${jobBlock}`;

    const startedAt = Date.now();
    const outcome = await this.deepSeekProvider.completeChat({
      userPrompt: userMessage,
      systemPrompt,
      maxTokens: 1200,
      temperature: 0.3,
      maxOutputChars: 6000,
    });
    const latencyMs = Date.now() - startedAt;

    const topicsUsed = knowledgeBundle.keysUsed;

    if (!outcome.ok) {
      if (outcome.reasonCode === "provider_not_configured") {
        return {
          ...baseResponse,
          topicsUsed,
          status: "provider_not_configured",
          message: "DeepSeek is not configured. Add DEEPSEEK_API_KEY to the backend.",
        };
      }

      await this.telemetry.recordActionRun({
        organizationId,
        actorProfileId,
        actionKey: AI_AGENT_KEY_FIELD_COPILOT,
        provider: AI_DEEPSEEK_PROVIDER_NAME,
        featureKey: AI_FEATURE_FIELD_COPILOT_V1,
        promptVersion: AI_PROMPT_VERSION_FIELD_COPILOT_V1,
        status: "failed",
        errorCode: outcome.reasonCode,
        modelId: model,
        latencyMs,
        traceEnvelope: {
          knowledge_domain: knowledgeDomain,
          topics_used: topicsUsed,
          jurisdiction_packs: knowledgeBundle.jurisdictionPacks,
          jurisdiction_notice: knowledgeBundle.jurisdictionNotice != null,
          field_job_context_used: jobContext != null,
          user_message_length: userMessage.length,
        },
      });

      this.logger.warn(`field_copilot_failed org=${organizationId} reason=${outcome.reasonCode}`);
      return {
        ...baseResponse,
        topicsUsed,
        status: "error",
        message: "Field Copilot could not complete your request. Try again in a moment.",
      };
    }

    const runId = await this.telemetry.recordActionRun({
      organizationId,
      actorProfileId,
      actionKey: AI_AGENT_KEY_FIELD_COPILOT,
      provider: AI_DEEPSEEK_PROVIDER_NAME,
      featureKey: AI_FEATURE_FIELD_COPILOT_V1,
      promptVersion: AI_PROMPT_VERSION_FIELD_COPILOT_V1,
      status: "completed",
      modelId: outcome.modelId,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
      estimatedCostUsd: outcome.estimatedCostUsd,
      latencyMs: outcome.latencyMs ?? latencyMs,
      traceEnvelope: {
        knowledge_domain: knowledgeDomain,
        topics_used: topicsUsed,
        jurisdiction_packs: knowledgeBundle.jurisdictionPacks,
        jurisdiction_notice: knowledgeBundle.jurisdictionNotice != null,
        knowledge_bytes: knowledgeBundle.totalBytes,
        field_job_context_used: jobContext != null,
        user_message_length: userMessage.length,
        response_length: outcome.text.length,
      },
    });

    return {
      ...baseResponse,
      topicsUsed,
      status: "ok",
      model: outcome.modelId,
      message: outcome.text,
      runId,
    };
  }
}
