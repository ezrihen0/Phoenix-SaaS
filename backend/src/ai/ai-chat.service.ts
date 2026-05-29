import { Injectable, Logger } from "@nestjs/common";

import { ConfigService } from "@nestjs/config";



import { apiError } from "../common/api-response";

import type { RequestWithActor } from "../common/request-types";

import type { ProfileRole } from "../crm/constants";

import { AiActionTelemetryService } from "./ai-action-telemetry.service";

import { AiAuditService } from "./ai-audit.service";

import {

  AI_AGENT_KEY_GENERAL_AI_CHAT,

  AI_DEEPSEEK_PROVIDER_NAME,

  AI_FEATURE_GENERAL_AI_CHAT_V1,

  AI_PROMPT_VERSION_GENERAL_AI_CHAT_V1,

} from "./ai.constants";

import { AiChatContextService, GENERAL_CHAT_PRIVACY_SYSTEM_APPENDIX } from "./ai-chat-context.service";

import type { AiChatSmartContextV1 } from "./ai-chat-context.types";

import { buildModeSystemPromptAppendix, detectAiChatMode } from "./ai-chat-mode";

import { AiChatSmartOutputEngine } from "./ai-chat-smart-output.engine";

import type {

  AiChatDetectedMode,

  AiChatFeedbackValue,

  AiChatGroundingItem,

  AiChatRecommendation,

} from "./ai-chat.types";

import {

  AI_CHAT_FEEDBACK_NOT_USEFUL,

  AI_CHAT_FEEDBACK_USEFUL,

} from "./ai-chat.types";

import { AiDeepSeekProviderService } from "./ai-deepseek-provider.service";

import { resolveAiChatEnabled, resolveAiFoundationEnabled } from "./ai-environment";



export type AiChatRequestBody = {

  message?: string;

};



export type AiChatFeedbackRequestBody = {

  feedback?: string;

};



export type AiChatResponse = {

  status: "ok" | "provider_not_configured" | "disabled" | "error";

  agentKey: typeof AI_AGENT_KEY_GENERAL_AI_CHAT;

  provider: typeof AI_DEEPSEEK_PROVIDER_NAME;

  model: string;

  message: string;

  recommendations: AiChatRecommendation[];

  grounding: AiChatGroundingItem[];

  detectedMode?: AiChatDetectedMode;

  runId?: string;

};



const CHAT_ALLOWED_ROLES = new Set<ProfileRole>(["owner", "admin"]);



const GENERAL_CHAT_SYSTEM_PROMPT =

  "You are WizField AI Chat, a read-only assistant for field-service business owners and admins. "

  + "Answer questions about WizField product usage, workflows, and general business operations guidance using WORKSPACE_CONTEXT when relevant. "

  + "You cannot update CRM records, send messages, schedule jobs, change pricing, or take autonomous actions. "

  + "If asked to perform an action in the product, explain what the user should do manually in WizField. "

  + "Never show phone numbers, emails, call transcripts, env secrets, source code, or another organization's data. "

  + "Be concise, honest about limits, and never invent customer or invoice data. "

  + GENERAL_CHAT_PRIVACY_SYSTEM_APPENDIX;



@Injectable()

export class AiChatService {

  private readonly logger = new Logger(AiChatService.name);



  constructor(

    private readonly configService: ConfigService,

    private readonly deepSeekProvider: AiDeepSeekProviderService,

    private readonly telemetry: AiActionTelemetryService,

    private readonly chatContext: AiChatContextService,

    private readonly smartOutput: AiChatSmartOutputEngine,

    private readonly audit: AiAuditService,

  ) {}



  private mergedEnvPreference(name: string): string | undefined {

    const rawEnv = process.env[name];

    const rawConfig = this.configService.get<string | undefined>(name);

    if (typeof rawEnv === "string" && rawEnv.trim() !== "") {

      return rawEnv;

    }

    return rawConfig ?? rawEnv ?? undefined;

  }



  private enforceChatAccess(request: RequestWithActor) {

    const role = (request.actor?.role ?? request.actor?.profile?.role ?? null) as ProfileRole | null;

    if (!role || !CHAT_ALLOWED_ROLES.has(role)) {

      apiError(

        403,

        "ai_chat_forbidden",

        "WizField AI Chat is available to organization owners and admins only.",

      );

    }

  }



  private requireActiveOrganizationIdFromActor(actorOrgId: string | null | undefined): string {

    const organizationId = actorOrgId?.trim();

    if (!organizationId) {

      apiError(400, "organization_context_missing", "An active organization is required for this action.");

    }

    return organizationId;

  }



  private emptyStructuredFields(): Pick<AiChatResponse, "recommendations" | "grounding"> {

    return { recommendations: [], grounding: [] };

  }



  private buildStructuredFromContext(

    context: AiChatSmartContextV1,

    mode: AiChatDetectedMode,

  ): Pick<AiChatResponse, "recommendations" | "grounding" | "detectedMode"> {

    return {

      detectedMode: mode,

      recommendations: this.smartOutput.buildRecommendations(context, mode),

      grounding: this.smartOutput.buildGrounding(context, mode),

    };

  }



  private buildTelemetryTrace(

    context: AiChatSmartContextV1,

    mode: AiChatDetectedMode,

    extra?: Record<string, unknown>,

  ): Record<string, unknown> {

    return {

      detected_mode: mode,

      context_used: true,

      context_categories_used: this.smartOutput.listContextCategoriesUsed(context),

      context_schema_version: context.schema_version,

      context_as_of: context.as_of,

      ...extra,

    };

  }



  async postChat(request: RequestWithActor, body: AiChatRequestBody): Promise<AiChatResponse> {

    const model = this.deepSeekProvider.readConfiguredModelId();

    const baseResponse = {

      agentKey: AI_AGENT_KEY_GENERAL_AI_CHAT,

      provider: AI_DEEPSEEK_PROVIDER_NAME,

      model,

      message: "",

      ...this.emptyStructuredFields(),

    } satisfies Omit<AiChatResponse, "status" | "detectedMode">;



    if (!resolveAiFoundationEnabled(this.mergedEnvPreference("AI_FOUNDATION_ENABLED") ?? undefined)) {

      return { ...baseResponse, status: "disabled", message: "AI chat is disabled in this environment." };

    }



    if (!resolveAiChatEnabled(this.mergedEnvPreference("AI_CHAT_ENABLED") ?? undefined)) {

      return { ...baseResponse, status: "disabled", message: "AI chat is disabled in this environment." };

    }



    this.enforceChatAccess(request);



    const organizationId = this.requireActiveOrganizationIdFromActor(request.actor?.organization_id);

    const actorProfileId = request.actor?.profile?.id ?? null;

    const userMessage = typeof body.message === "string" ? body.message.trim() : "";



    if (!userMessage) {

      apiError(400, "ai_chat_message_required", "message is required.");

    }



    if (userMessage.length > 4000) {

      apiError(400, "ai_chat_message_too_long", "message must be 4000 characters or fewer.");

    }



    if (!this.deepSeekProvider.isConfigured()) {

      return {

        ...baseResponse,

        status: "provider_not_configured",

        message: "DeepSeek is not configured for this environment. Add DEEPSEEK_API_KEY to the backend.",

      };

    }



    const actor = request.actor;

    if (!actor) {

      apiError(401, "unauthorized", "Authentication is required.");

    }



    const detectedMode = detectAiChatMode(userMessage);

    const workspaceContext = await this.chatContext.buildSmartContextV1(organizationId, actor);

    const structured = this.buildStructuredFromContext(workspaceContext, detectedMode);

    const contextJson = this.chatContext.formatContextForPrompt(workspaceContext);

    const modeAppendix = buildModeSystemPromptAppendix(detectedMode);

    const systemPrompt =

      `${GENERAL_CHAT_SYSTEM_PROMPT}\n\n${modeAppendix}\n\nWORKSPACE_CONTEXT:\n${contextJson}`;



    const startedAt = Date.now();

    const outcome = await this.deepSeekProvider.completeChat({

      userPrompt: userMessage,

      systemPrompt,

      maxTokens: 800,

      temperature: 0.4,

      maxOutputChars: 4000,

    });

    const latencyMs = Date.now() - startedAt;



    if (!outcome.ok) {

      if (outcome.reasonCode === "provider_not_configured") {

        return {

          ...baseResponse,

          ...structured,

          status: "provider_not_configured",

          message: "DeepSeek is not configured for this environment. Add DEEPSEEK_API_KEY to the backend.",

        };

      }



      await this.telemetry.recordActionRun({

        organizationId,

        actorProfileId,

        actionKey: AI_AGENT_KEY_GENERAL_AI_CHAT,

        provider: AI_DEEPSEEK_PROVIDER_NAME,

        featureKey: AI_FEATURE_GENERAL_AI_CHAT_V1,

        promptVersion: AI_PROMPT_VERSION_GENERAL_AI_CHAT_V1,

        status: "failed",

        errorCode: outcome.reasonCode,

        modelId: model,

        latencyMs,

        traceEnvelope: this.buildTelemetryTrace(workspaceContext, detectedMode, {

          user_message_length: userMessage.length,

        }),

      });



      this.logger.warn(`ai_chat_failed org=${organizationId} reason=${outcome.reasonCode}`);

      return {

        ...baseResponse,

        ...structured,

        status: "error",

        message: "WizField AI Chat could not complete your request. Try again in a moment.",

      };

    }



    const runId = await this.telemetry.recordActionRun({

      organizationId,

      actorProfileId,

      actionKey: AI_AGENT_KEY_GENERAL_AI_CHAT,

      provider: AI_DEEPSEEK_PROVIDER_NAME,

      featureKey: AI_FEATURE_GENERAL_AI_CHAT_V1,

      promptVersion: AI_PROMPT_VERSION_GENERAL_AI_CHAT_V1,

      status: "completed",

      modelId: outcome.modelId,

      inputTokens: outcome.inputTokens,

      outputTokens: outcome.outputTokens,

      estimatedCostUsd: outcome.estimatedCostUsd,

      latencyMs: outcome.latencyMs ?? latencyMs,

      traceEnvelope: this.buildTelemetryTrace(workspaceContext, detectedMode, {

        user_message_length: userMessage.length,

        response_length: outcome.text.length,

      }),

    });



    return {

      ...baseResponse,

      ...structured,

      status: "ok",

      model: outcome.modelId,

      message: outcome.text,

      runId,

    };

  }



  async postChatFeedback(

    request: RequestWithActor,

    runId: string,

    body: AiChatFeedbackRequestBody,

  ): Promise<{ ok: true; runId: string; feedback: AiChatFeedbackValue }> {

    if (!resolveAiFoundationEnabled(this.mergedEnvPreference("AI_FOUNDATION_ENABLED") ?? undefined)) {

      apiError(403, "ai_foundation_disabled", "AI foundation is disabled in this environment.");

    }



    if (!resolveAiChatEnabled(this.mergedEnvPreference("AI_CHAT_ENABLED") ?? undefined)) {

      apiError(403, "ai_chat_disabled", "AI chat is disabled in this environment.");

    }



    this.enforceChatAccess(request);



    const organizationId = this.requireActiveOrganizationIdFromActor(request.actor?.organization_id);

    const trimmedRunId = runId?.trim();

    if (!trimmedRunId) {

      apiError(400, "ai_chat_run_id_required", "runId is required.");

    }



    const rawFeedback = typeof body.feedback === "string" ? body.feedback.trim() : "";

    if (rawFeedback !== AI_CHAT_FEEDBACK_USEFUL && rawFeedback !== AI_CHAT_FEEDBACK_NOT_USEFUL) {

      apiError(400, "ai_chat_feedback_invalid", 'feedback must be "useful" or "not_useful".');

    }



    const updated = await this.audit.recordChatFeedback({

      runId: trimmedRunId,

      organizationId,

      actionKey: AI_AGENT_KEY_GENERAL_AI_CHAT,

      feedback: rawFeedback as AiChatFeedbackValue,

    });



    if (!updated) {

      apiError(404, "ai_chat_run_not_found", "This chat run was not found in your active workspace.");

    }



    return { ok: true, runId: trimmedRunId, feedback: rawFeedback as AiChatFeedbackValue };

  }

}


