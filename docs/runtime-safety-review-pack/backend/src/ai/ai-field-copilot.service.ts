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
import {
  ALBERTA_V1_KNOWLEDGE_FILES,
  FIELD_KNOWLEDGE_DOMAIN_DOORS_WINDOWS,
  FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE,
  GAS_FIREPLACE_TOPIC_FILES,
  type FieldKnowledgeDomain,
  type FieldKnowledgeSelectionKey,
} from "./field-knowledge/field-knowledge.constants";
import {
  parseCsvEnvList,
  resolveAiFieldCopilotEnabled,
  resolveAiFieldCopilotVoiceEnabled,
  resolveAiFoundationEnabled,
} from "./ai-environment";
import { evaluateRuntimeGates } from "./field-knowledge/field-knowledge-runtime-gate.engine";
import {
  FIELD_KNOWLEDGE_MANIFEST_STATUS,
  FIELD_KNOWLEDGE_MANIFEST_VERSION,
  FIELD_COPILOT_ALLOWED_ROLES,
} from "./field-knowledge/field-knowledge-runtime.constants";
import type {
  FallbackReason,
  FieldKnowledgeRuntimeAudit,
  GateOutcome,
} from "./field-knowledge/field-knowledge-runtime.types";

export type FieldCopilotRequestBody = {
  message?: string;
  jobId?: string;
  knowledgeDomain?: string;
  runtimeSurface?: string;
  tradeConfidence?: number;
  riskConfidence?: number;
  emergencyFlag?: boolean;
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
  /** Additive runtime safety fields — backward compatible. */
  gate_outcome?: GateOutcome;
  fallback_reason?: FallbackReason | null;
  refusal_reason?: string | null;
  used_llm?: boolean;
};

const FIELD_COPILOT_GAS_SYSTEM_PROMPT =
  "You are WizField Field Copilot - a read-only field assistant for gas fireplace service, inspection, documentation, and safe sales support. "
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

const FIELD_COPILOT_DOORS_WINDOWS_SYSTEM_PROMPT =
  "You are WizField Field Copilot - a read-only field assistant for professional doors and windows field service, documentation, dispatch support, and safe sales support. "
  + "You receive FIELD_KNOWLEDGE excerpts (approved internal trade packs only) and optional FIELD_JOB_CONTEXT (org-scoped job snapshot). "
  + "You have no database, filesystem, env, log, source code, or cross-tenant access. "
  + "HARD BOUNDARIES: Do not provide legal, permit, AHJ, code, egress, fire-rated, tempered-glass, warranty, or manufacturer-specific compliance determinations. "
  + "Do not provide DIY homeowner repair procedures, lock bypass/rekey/security programming, or structural modification guidance. "
  + "Do not claim definitive root cause without supporting evidence from approved context. "
  + "Use assessment-first, non-promissory wording and escalate when safety/compliance scope appears. "
  + "STRUCTURE every answer with these sections (use clear headings): "
  + "1) Immediate safety concern (if any) "
  + "2) What to inspect or capture first "
  + "3) What evidence to collect "
  + "4) What to tell the customer "
  + "5) What not to promise "
  + "6) Recommended next step "
  + "7) When to escalate";

function buildFieldCopilotSystemPrompt(domain: FieldKnowledgeDomain): string {
  if (domain === FIELD_KNOWLEDGE_DOMAIN_DOORS_WINDOWS) {
    return FIELD_COPILOT_DOORS_WINDOWS_SYSTEM_PROMPT;
  }

  if (domain === FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE) {
    return FIELD_COPILOT_GAS_SYSTEM_PROMPT;
  }

  return FIELD_COPILOT_GAS_SYSTEM_PROMPT;
}

function resolveSelectionPath(selectionKey: FieldKnowledgeSelectionKey): string | null {
  if (selectionKey in GAS_FIREPLACE_TOPIC_FILES) {
    return GAS_FIREPLACE_TOPIC_FILES[selectionKey as keyof typeof GAS_FIREPLACE_TOPIC_FILES];
  }
  if (selectionKey in ALBERTA_V1_KNOWLEDGE_FILES) {
    return ALBERTA_V1_KNOWLEDGE_FILES[selectionKey as keyof typeof ALBERTA_V1_KNOWLEDGE_FILES];
  }
  return null;
}

function buildRuntimeAudit(input: {
  knowledgeDomain: FieldKnowledgeDomain;
  gateOutcome: GateOutcome;
  fallbackReason: FallbackReason | null;
  refusalReason: string | null;
  usedLlm: boolean;
  keysUsed: FieldKnowledgeSelectionKey[];
  evaluation: ReturnType<typeof evaluateRuntimeGates>;
}): FieldKnowledgeRuntimeAudit {
  const ctx = input.evaluation.context;
  return {
    manifest_version: FIELD_KNOWLEDGE_MANIFEST_VERSION,
    manifest_status: FIELD_KNOWLEDGE_MANIFEST_STATUS,
    selected_knowledge_keys: input.keysUsed,
    selected_pack_paths: input.keysUsed
      .map((key) => resolveSelectionPath(key))
      .filter((path): path is string => path != null),
    trade: ctx.trade,
    region_country: ctx.country,
    region_province: ctx.province_or_state,
    region_city: ctx.city_or_ahj,
    runtime_surface: ctx.runtime_surface,
    user_role: ctx.user_role,
    risk_level: ctx.risk_level,
    trade_confidence: ctx.trade_confidence,
    risk_confidence: ctx.risk_confidence,
    emergency_flag: ctx.emergency_flag,
    gate_outcome: input.gateOutcome,
    fallback_reason: input.fallbackReason,
    refusal_reason: input.refusalReason,
    booking_eligibility: ctx.booking_eligibility,
    lead_capture_only: ctx.lead_capture_only,
    booking_outcome: ctx.booking_outcome,
    knowledge_domain: input.knowledgeDomain,
    used_llm: input.usedLlm,
  };
}

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

  private enforceFieldCopilotAccess(request: RequestWithActor): ProfileRole {
    const role = (request.actor?.role ?? request.actor?.profile?.role ?? null) as ProfileRole | null;
    if (!role || !FIELD_COPILOT_ALLOWED_ROLES.has(role)) {
      apiError(403, "field_copilot_forbidden", "Field Copilot is not available for this role.");
    }
    return role;
  }

  private requireActiveOrganizationIdFromActor(actorOrgId: string | null | undefined): string {
    const organizationId = actorOrgId?.trim();
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for this action.");
    }
    return organizationId;
  }

  private resolveKillSwitches(knowledgeDomain: FieldKnowledgeDomain) {
    const disabledDomains = parseCsvEnvList(this.mergedEnvPreference("AI_FIELD_COPILOT_DISABLED_DOMAINS"));
    const disabledSurfaces = parseCsvEnvList(this.mergedEnvPreference("AI_FIELD_COPILOT_DISABLED_SURFACES"));

    return {
      domainDisabled: disabledDomains.includes(knowledgeDomain.toLowerCase()),
      voiceEnabled: resolveAiFieldCopilotVoiceEnabled(
        this.mergedEnvPreference("AI_FIELD_COPILOT_VOICE_ENABLED") ?? undefined,
      ),
      disabledSurfaces,
    };
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

    const userRole = this.enforceFieldCopilotAccess(request);

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

    const actor = request.actor;
    if (!actor) {
      apiError(401, "unauthorized", "Authentication is required.");
    }

    const jobContext = await this.fieldJobContext.buildFieldJobContextV1(
      organizationId,
      actor,
      body.jobId,
    );

    const killSwitchState = this.resolveKillSwitches(knowledgeDomain);

    const gateEvaluation = evaluateRuntimeGates({
      domain: knowledgeDomain,
      userMessage,
      userRole,
      organizationId,
      serviceCity: jobContext?.service_city ?? null,
      requestedSurface: body.runtimeSurface,
      killSwitches: {
        domainDisabled: killSwitchState.domainDisabled,
        surfaceDisabled: false,
        voiceEnabled: killSwitchState.voiceEnabled,
        disabledSurfaces: killSwitchState.disabledSurfaces,
      },
      tradeConfidenceOverride: typeof body.tradeConfidence === "number" ? body.tradeConfidence : undefined,
      riskConfidenceOverride: typeof body.riskConfidence === "number" ? body.riskConfidence : undefined,
      emergencyFlagOverride: body.emergencyFlag === true ? true : undefined,
    });

    const safetyFields = {
      gate_outcome: gateEvaluation.gate_outcome,
      fallback_reason: gateEvaluation.fallback_reason,
      refusal_reason: gateEvaluation.refusal_reason,
      used_llm: false as boolean,
    };

    if (gateEvaluation.skip_llm && gateEvaluation.fallback_message) {
      const audit = buildRuntimeAudit({
        knowledgeDomain,
        gateOutcome: gateEvaluation.gate_outcome,
        fallbackReason: gateEvaluation.fallback_reason,
        refusalReason: gateEvaluation.refusal_reason,
        usedLlm: false,
        keysUsed: [],
        evaluation: gateEvaluation,
      });

      const runId = await this.telemetry.recordActionRun({
        organizationId,
        actorProfileId,
        actionKey: AI_AGENT_KEY_FIELD_COPILOT,
        provider: AI_DEEPSEEK_PROVIDER_NAME,
        featureKey: AI_FEATURE_FIELD_COPILOT_V1,
        promptVersion: AI_PROMPT_VERSION_FIELD_COPILOT_V1,
        status: gateEvaluation.gate_outcome === "refused" ? "refused" : "completed",
        modelId: model,
        traceEnvelope: {
          ...audit,
          field_job_context_used: jobContext != null,
          user_message_length: userMessage.length,
          response_length: gateEvaluation.fallback_message.length,
        },
      });

      return {
        ...baseResponse,
        ...safetyFields,
        topicsUsed: [],
        status: "ok",
        message: gateEvaluation.fallback_message,
        runId,
      };
    }

    if (!this.deepSeekProvider.isConfigured()) {
      return {
        ...baseResponse,
        status: "provider_not_configured",
        message: "DeepSeek is not configured. Add DEEPSEEK_API_KEY to the backend.",
      };
    }

    const allowedPackKeys = gateEvaluation.allowed_pack_keys
      ? new Set(gateEvaluation.allowed_pack_keys)
      : undefined;

    const knowledgeBundle = await this.fieldKnowledge.loadKnowledgeBundle(knowledgeDomain, userMessage, {
      serviceCity: jobContext?.service_city ?? null,
      allowedPackKeys,
      runtimeContext: gateEvaluation.context,
    });

    const knowledgeBlock = this.fieldKnowledge.formatBundleForPrompt(knowledgeBundle);
    const jobBlock = this.fieldJobContext.formatForPrompt(jobContext);
    const domainPrompt = buildFieldCopilotSystemPrompt(knowledgeDomain);
    const systemPrompt = `${domainPrompt}\n\n${knowledgeBlock}\n\n${jobBlock}`;

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

    const audit = buildRuntimeAudit({
      knowledgeDomain,
      gateOutcome: "allowed",
      fallbackReason: null,
      refusalReason: null,
      usedLlm: true,
      keysUsed: topicsUsed,
      evaluation: gateEvaluation,
    });

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
          ...audit,
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
        ...audit,
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
      gate_outcome: "allowed",
      fallback_reason: null,
      refusal_reason: null,
      used_llm: true,
    };
  }
}
