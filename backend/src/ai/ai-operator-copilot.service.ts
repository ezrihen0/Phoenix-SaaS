import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { randomUUID } from "crypto";

import { requirePermission } from "../auth/permissions";
import { apiError } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { AiOperatorDraftEntity, type AiOperatorDraftStatusKey } from "../database/entities/ai-operator-draft.entity";
import { RecentCallEntity } from "../database/entities/recent-call.entity";
import { recentCallBelongsToOrgParams, recentCallBelongsToOrgSql } from "../telephony/telephony-org-scope";
import { AiAuditService } from "./ai-audit.service";
import { AiCopilotOpenAiClient } from "./ai-copilot-openai-client.service";
import {
  AI_DRAFT_TYPE_CUSTOMER_SMS_FOLLOWUP_V1,
  AI_FEATURE_CALL_INTAKE_VOICE_TELNYX_V1,
  AI_FEATURE_OPERATOR_COPILOT_CALLS_SMS_V1,
  AI_MAX_SERIALIZED_TOOL_OUTPUT_BYTES,
  AI_PROMPT_VERSION_OPERATOR_COPILOT_SMS_V1,
  AI_SOURCE_CHANNEL_UI,
} from "./ai.constants";
import {
  resolveAiCopilotCallsSurfaceEnabled,
  resolveAiCopilotCustomerSmsDraftEnabled,
  resolveAiCopilotLlmEnabled,
  resolveAiFoundationEnabled,
  resolveAiOperatorCopilotEnabled,
} from "./ai-environment";
import {
  buildCallIntakeEnvelopeSectionsV0,
} from "./call-intake-contract.v0";
import {
  buildCallIntakeEnvelopeSectionsVoiceV1,
} from "./call-intake-voice-normalizer.v1";

export type CopilotLimitationDto = { code: string; message: string };

export type OperatorCopilotSmsDraftDto = {
  draftId: string;
  recentCallId: string;
  effectiveBody: string;
  generatedBody: string;
  editedBody: string | null;
  limitations: CopilotLimitationDto[];
  recommendationRunId: string | null;
  generationPath: "template" | "llm";
  promptVersion: string;
  modelId: string | null;
};

export type GenerateSmsDraftBody = { recentCallId?: string };

export type PatchSmsDraftBody = { editedBody?: unknown };

type HybridCrmPayload = {
  outcome?: string;
  reason_codes?: string[];
  validation_error?: string;
};

@Injectable()
export class AiOperatorCopilotService {
  private readonly logger = new Logger(AiOperatorCopilotService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(RecentCallEntity)
    private readonly recentCallsRepo: Repository<RecentCallEntity>,
    @InjectRepository(AiOperatorDraftEntity)
    private readonly draftsRepo: Repository<AiOperatorDraftEntity>,
    private readonly audit: AiAuditService,
    private readonly openAiClient: AiCopilotOpenAiClient,
  ) {}

  private mergedEnvPreference(name: string): string | undefined {
    const rawEnv = process.env[name];
    const rawConfig = this.configService.get<string | undefined>(name);
    if (typeof rawEnv === "string" && rawEnv.trim() !== "") {
      return rawEnv;
    }
    return rawConfig ?? rawEnv ?? undefined;
  }

  private enforceCopilotGates() {
    const foundation = this.mergedEnvPreference("AI_FOUNDATION_ENABLED");
    if (!resolveAiFoundationEnabled(foundation ?? undefined)) {
      apiError(403, "ai_foundation_disabled", "AI foundation endpoints are disabled in this environment.");
    }

    const copilot = this.mergedEnvPreference("AI_OPERATOR_COPILOT_ENABLED");
    if (!resolveAiOperatorCopilotEnabled(copilot ?? undefined)) {
      apiError(403, "ai_operator_copilot_disabled", "Operator Copilot is disabled in this environment.");
    }

    const surface = this.mergedEnvPreference("AI_COPILOT_CALLS_SURFACE_ENABLED");
    if (!resolveAiCopilotCallsSurfaceEnabled(surface ?? undefined)) {
      apiError(403, "ai_copilot_calls_surface_disabled", "Calls Copilot surface is disabled in this environment.");
    }

    const sms = this.mergedEnvPreference("AI_COPILOT_CUSTOMER_SMS_DRAFT_ENABLED");
    if (!resolveAiCopilotCustomerSmsDraftEnabled(sms ?? undefined)) {
      apiError(403, "ai_copilot_sms_draft_disabled", "Customer SMS draft workflow is disabled in this environment.");
    }
  }

  private requireActiveOrganizationIdFromActor(actorOrgId: string | null | undefined) {
    const organizationId = actorOrgId?.trim();
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for this action.");
    }
    return organizationId;
  }

  private async assertRecentCallInOrganization(recentCallId: string, organizationId: string) {
    const rows = (await this.dataSource.query(
      `
        SELECT rc.id
        FROM recent_calls rc
        WHERE BINARY rc.id = BINARY ?
          AND ${recentCallBelongsToOrgSql("rc")}
        LIMIT 1
      `,
      [recentCallId, ...recentCallBelongsToOrgParams(organizationId)],
    )) as Array<{ id: string }>;

    if (!rows[0]?.id) {
      apiError(404, "recent_call_not_found", "The recent call could not be found.");
    }
  }

  private async findHybridCrmForRecentCall(
    organizationId: string,
    recentCallId: string,
  ): Promise<HybridCrmPayload | null> {
    const rows = (await this.dataSource.query(
      `
        SELECT r.tool_trace_json AS trace
        FROM ai_recommendation_runs r
        WHERE BINARY r.organization_id = BINARY ?
          AND r.feature_key = ?
          AND JSON_UNQUOTE(JSON_EXTRACT(r.tool_trace_json, '$.recent_call_id')) = ?
        ORDER BY r.created_at DESC
        LIMIT 1
      `,
      [organizationId.trim(), AI_FEATURE_CALL_INTAKE_VOICE_TELNYX_V1, recentCallId.trim()],
    )) as Array<{ trace: string }>;

    const raw = rows[0]?.trace?.trim();
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as { hybrid_crm?: HybridCrmPayload };
      return parsed.hybrid_crm ?? null;
    } catch {
      return null;
    }
  }

  private buildLimitations(
    call: RecentCallEntity,
    hybrid: HybridCrmPayload | null,
  ): CopilotLimitationDto[] {
    const limitations: CopilotLimitationDto[] = [];

    if (!call.matched_client_id?.trim() && !call.matched_lead_id?.trim()) {
      limitations.push({
        code: "no_matched_customer",
        message: "No customer or lead is matched to this call — verify identity before sending.",
      });
    }

    if (hybrid?.outcome === "artifact_only") {
      limitations.push({
        code: "artifact_only_intake",
        message: "Voice intake did not auto-create a lead — confirm details before promising service.",
      });
    }

    const summaryPresent = Boolean(call.ai_summary?.trim() || call.voicemail_transcription?.trim());
    const messagesPresent = Boolean(call.ai_conversation_messages_json?.trim());
    if (!summaryPresent && !messagesPresent) {
      limitations.push({
        code: "minimal_transcript",
        message: "Limited call context — keep the message generic and confirm next steps internally.",
      });
    }

    limitations.push({
      code: "assistive_only",
      message: "Draft is assistive — not a booking or price confirmation. Review before any customer send.",
    });

    return limitations;
  }

  private buildTemplateSmsBody(input: {
    call: RecentCallEntity;
    organizationDisplayName: string;
    limitations: CopilotLimitationDto[];
  }): string {
    const { call } = input;
    const business = input.organizationDisplayName.trim() || "our team";
    const name =
      call.matched_client_display_name?.trim()
      ?? (call.from_number ? `there` : "there");

    const greet = name === "there" ? "Hi," : `Hi ${name.split(/\s+/)[0] ?? name},`;

    const summarySnippet =
      call.ai_summary?.trim()
      ?? call.voicemail_transcription?.trim()?.slice(0, 120)
      ?? "";

    const middle = summarySnippet
      ? ` Thanks for reaching ${business}. We're following up on your call${summarySnippet ? ` (${summarySnippet.slice(0, 80)}${summarySnippet.length > 80 ? "…" : ""})` : ""}.`
      : ` Thanks for contacting ${business}.`;

    const close =
      " Our office will confirm details — reply here or call us back when convenient.";

    const body = `${greet}${middle}${close}`.replace(/\s+/g, " ").trim();
    return body.length > 480 ? body.slice(0, 477).trimEnd() + "…" : body;
  }

  private buildVoiceIntakeSections(call: RecentCallEntity) {
    const isTelnyxVoice = (call.ai_provider ?? "").trim() === "telnyx_ai_assistant";
    if (isTelnyxVoice) {
      return buildCallIntakeEnvelopeSectionsVoiceV1(call);
    }
    return buildCallIntakeEnvelopeSectionsV0(call);
  }

  private buildLlmUserPrompt(input: {
    organizationName: string;
    call: RecentCallEntity;
    sections: Record<string, unknown>;
    limitations: CopilotLimitationDto[];
  }): string {
    const safeContext = {
      organization: input.organizationName,
      call_status: input.call.call_status,
      matched_display_name: input.call.matched_client_display_name,
      from_number_suffix: input.call.from_number_normalized?.slice(-4) ?? null,
      intake_sections: input.sections,
      limitations: input.limitations,
    };

    return [
      "Write one SMS draft (plain text) for the customer after this call.",
      "Rules: under ~280 characters if possible; no appointment guarantees; no pricing; no warranty claims.",
      "Context JSON:",
      JSON.stringify(safeContext),
    ].join("\n");
  }

  private mapDraft(entity: AiOperatorDraftEntity): OperatorCopilotSmsDraftDto {
    let limitations: CopilotLimitationDto[] = [];
    try {
      limitations = JSON.parse(entity.limitations_json) as CopilotLimitationDto[];
      if (!Array.isArray(limitations)) {
        limitations = [];
      }
    } catch {
      limitations = [];
    }

    const effective =
      entity.edited_body !== null && entity.edited_body !== undefined && entity.edited_body.trim() !== ""
        ? entity.edited_body.trim()
        : entity.generated_body.trim();

    return {
      draftId: entity.id,
      recentCallId: entity.recent_call_id,
      effectiveBody: effective,
      generatedBody: entity.generated_body,
      editedBody: entity.edited_body,
      limitations,
      recommendationRunId: entity.recommendation_run_id,
      generationPath: entity.model_id ? "llm" : "template",
      promptVersion: entity.prompt_version,
      modelId: entity.model_id,
    };
  }

  async generateSmsDraft(request: RequestWithActor, body: GenerateSmsDraftBody): Promise<OperatorCopilotSmsDraftDto> {
    this.enforceCopilotGates();
    const actor = requirePermission(request.actor, "calls.view", "forbidden", "Only office roles can access telephony.");
    const organizationId = this.requireActiveOrganizationIdFromActor(actor.organization_id);
    const profileId = actor.profile?.id?.trim();
    if (!profileId) {
      apiError(400, "profile_context_missing", "A staff profile is required for Operator Copilot.");
    }

    const recentCallId = typeof body.recentCallId === "string" ? body.recentCallId.trim() : "";
    if (!recentCallId) {
      apiError(400, "recent_call_required", "recentCallId is required.");
    }

    await this.assertRecentCallInOrganization(recentCallId, organizationId);

    const existing = await this.draftsRepo.findOne({
      where: {
        organization_id: organizationId,
        recent_call_id: recentCallId,
        draft_type: AI_DRAFT_TYPE_CUSTOMER_SMS_FOLLOWUP_V1,
        status: "active",
      },
    });
    if (existing) {
      return this.mapDraft(existing);
    }

    const call = await this.recentCallsRepo.findOne({ where: { id: recentCallId } });
    if (!call) {
      apiError(404, "recent_call_not_found", "The recent call could not be found.");
    }

    const hybrid = await this.findHybridCrmForRecentCall(organizationId, recentCallId);
    const limitations = this.buildLimitations(call, hybrid);
    const orgName = actor.organization?.name?.trim() ?? "Your business";
    const sections = this.buildVoiceIntakeSections(call);

    const tracePreview = {
      recent_call_id: recentCallId,
      intake_section_keys: Object.keys(sections),
      limitations,
    };
    const traceBytes = Buffer.byteLength(JSON.stringify(tracePreview), "utf8");
    if (traceBytes > AI_MAX_SERIALIZED_TOOL_OUTPUT_BYTES) {
      apiError(413, "ai_context_oversized", "Copilot context exceeded bounded allowance.");
    }

    let generatedBody = this.buildTemplateSmsBody({ call, organizationDisplayName: orgName, limitations });
    let generationPath: "template" | "llm" = "template";
    let modelId: string | null = null;
    let llmFallbackReason: string | null = null;

    const llmFlag = this.mergedEnvPreference("AI_COPILOT_LLM_ENABLED");
    if (resolveAiCopilotLlmEnabled(llmFlag ?? undefined)) {
      const userPrompt = this.buildLlmUserPrompt({
        organizationName: orgName,
        call,
        sections,
        limitations,
      });
      const llmOutcome = await this.openAiClient.tryCompleteUserPrompt({
        userPrompt,
        featureKey: AI_FEATURE_OPERATOR_COPILOT_CALLS_SMS_V1,
      });
      if (llmOutcome.ok) {
        generatedBody = llmOutcome.text;
        generationPath = "llm";
        modelId = llmOutcome.modelId;
      } else {
        llmFallbackReason = llmOutcome.reasonCode;
      }
    }

    const runId = randomUUID();
    const tracePayload = JSON.stringify({
      recent_call_id: recentCallId,
      generation_path: generationPath,
      llm_fallback_reason: llmFallbackReason,
      limitations,
      intake_section_keys: Object.keys(sections),
    });

    await this.audit.persistRun({
      id: runId,
      organization_id: organizationId,
      actor_profile_id: profileId,
      source_channel: AI_SOURCE_CHANNEL_UI,
      feature_key: AI_FEATURE_OPERATOR_COPILOT_CALLS_SMS_V1,
      tool_trace_json: tracePayload,
      model_id: modelId,
      prompt_version: AI_PROMPT_VERSION_OPERATOR_COPILOT_SMS_V1,
      status: "completed",
      error_code: null,
    });

    const draftId = randomUUID();
    const draft = this.draftsRepo.create({
      id: draftId,
      organization_id: organizationId,
      actor_profile_id: profileId,
      recent_call_id: recentCallId,
      draft_type: AI_DRAFT_TYPE_CUSTOMER_SMS_FOLLOWUP_V1,
      status: "active" satisfies AiOperatorDraftStatusKey,
      generated_body: generatedBody,
      edited_body: null,
      recommendation_run_id: runId,
      limitations_json: JSON.stringify(limitations),
      prompt_version: AI_PROMPT_VERSION_OPERATOR_COPILOT_SMS_V1,
      model_id: modelId,
      dismissed_at: null,
    });
    await this.draftsRepo.save(draft);
    return this.mapDraft(draft);
  }

  async getActiveSmsDraft(request: RequestWithActor, recentCallIdRaw: string): Promise<OperatorCopilotSmsDraftDto | null> {
    this.enforceCopilotGates();
    const actor = requirePermission(request.actor, "calls.view", "forbidden", "Only office roles can access telephony.");
    const organizationId = this.requireActiveOrganizationIdFromActor(actor.organization_id);
    const recentCallId = recentCallIdRaw.trim();
    if (!recentCallId) {
      apiError(400, "recent_call_required", "recentCallId is required.");
    }

    await this.assertRecentCallInOrganization(recentCallId, organizationId);

    const existing = await this.draftsRepo.findOne({
      where: {
        organization_id: organizationId,
        recent_call_id: recentCallId,
        draft_type: AI_DRAFT_TYPE_CUSTOMER_SMS_FOLLOWUP_V1,
        status: "active",
      },
    });

    return existing ? this.mapDraft(existing) : null;
  }

  async patchSmsDraft(request: RequestWithActor, draftIdRaw: string, body: PatchSmsDraftBody): Promise<OperatorCopilotSmsDraftDto> {
    this.enforceCopilotGates();
    const actor = requirePermission(request.actor, "calls.view", "forbidden", "Only office roles can access telephony.");
    const organizationId = this.requireActiveOrganizationIdFromActor(actor.organization_id);

    const draftId = draftIdRaw.trim();
    if (!draftId) {
      apiError(400, "draft_id_required", "draftId is required.");
    }

    if (typeof body.editedBody !== "string") {
      apiError(400, "edited_body_invalid", "editedBody must be a string.");
    }

    const edited =
      body.editedBody.trim() === ""
        ? null
        : body.editedBody.trim();

    const draft = await this.draftsRepo.findOne({
      where: { id: draftId, organization_id: organizationId },
    });

    if (!draft || draft.status !== "active") {
      apiError(404, "operator_draft_not_found", "Draft not found or not active.");
    }

    draft.edited_body = edited;
    await this.draftsRepo.save(draft);
    return this.mapDraft(draft);
  }

  async dismissSmsDraft(request: RequestWithActor, draftIdRaw: string): Promise<{ ok: true }> {
    this.enforceCopilotGates();
    const actor = requirePermission(request.actor, "calls.view", "forbidden", "Only office roles can access telephony.");
    const organizationId = this.requireActiveOrganizationIdFromActor(actor.organization_id);
    const draftId = draftIdRaw.trim();
    if (!draftId) {
      apiError(400, "draft_id_required", "draftId is required.");
    }

    const draft = await this.draftsRepo.findOne({
      where: { id: draftId, organization_id: organizationId },
    });

    if (!draft || draft.status !== "active") {
      apiError(404, "operator_draft_not_found", "Draft not found or not active.");
    }

    draft.status = "dismissed";
    draft.dismissed_at = new Date();
    await this.draftsRepo.save(draft);
    return { ok: true };
  }
}
