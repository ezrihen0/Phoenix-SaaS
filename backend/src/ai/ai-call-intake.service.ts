import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { randomUUID } from "crypto";

import { requirePermission } from "../auth/permissions";
import { apiError } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { RecentCallEntity } from "../database/entities/recent-call.entity";
import type { AiRecommendationRunEntity } from "../database/entities/ai-recommendation-run.entity";
import { recentCallBelongsToOrgParams, recentCallBelongsToOrgSql } from "../telephony/telephony-org-scope";
import { AiAuditService } from "./ai-audit.service";
import {
  AI_FEATURE_CALL_INTAKE_ENVELOPE_V0,
  AI_INTAKE_NORMALIZER_VERSION,
  AI_INTAKE_TRACE_SCHEMA_VERSION,
  AI_MAX_SERIALIZED_TOOL_OUTPUT_BYTES,
  AI_PROMPT_VERSION_CALL_INTAKE_V0,
  AI_SOURCE_CHANNEL_CALL_RECORDING_DERIVED,
} from "./ai.constants";
import {
  resolveAiFoundationEnabled,
  resolveAiVoiceIntakeFoundationEnabled,
} from "./ai-environment";
import type { AiModelInvoker } from "./ai-model-invoker";
import { aiModelInvokerToken } from "./ai-model-invoker";
import {
  buildCallIntakeEnvelopeSectionsV0,
  buildCallIntakeMinimalDigestInputV1,
  digestCallIntakeMinimalInputV1,
  serializedCallIntakeAuditPayloadByteLength,
} from "./call-intake-contract.v0";

export type AiCallIntakeDryRunDto = {
  recentCallId?: string;
  sourceChannel?: string;
};

export type AiCallIntakeEnvelopeDryRunResponse = {
  runId: string;
  recentCallId: string;
  envelope: {
    sections: ReturnType<typeof buildCallIntakeEnvelopeSectionsV0>;
  };
  digest: string;
  intakeTraceSchemaVersion: string;
  normalizerVersion: string;
  wordingMode: "deterministic_v0";
  model: { skipped: true; reasonCode: string };
};

function normalizeOptionalSourceChannel(raw: string | undefined) {
  const trimmed = (raw ?? "").trim();
  return (trimmed === "" ? AI_SOURCE_CHANNEL_CALL_RECORDING_DERIVED : trimmed).slice(0, 32);
}

@Injectable()
export class AiCallIntakeService {
  private readonly logger = new Logger(AiCallIntakeService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(RecentCallEntity)
    private readonly recentCallsRepo: Repository<RecentCallEntity>,
    private readonly audit: AiAuditService,
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

  private enforceVoiceIntakeFoundationGate() {
    const merged = this.mergedEnvPreference("AI_VOICE_INTAKE_FOUNDATION_ENABLED");
    if (!resolveAiVoiceIntakeFoundationEnabled(merged ?? undefined)) {
      apiError(
        403,
        "ai_voice_intake_disabled",
        "Voice intake foundation is disabled in this environment.",
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

  async runCallIntakeEnvelopeDryRun(
    request: RequestWithActor,
    dto: AiCallIntakeDryRunDto,
  ): Promise<AiCallIntakeEnvelopeDryRunResponse> {
    this.logger.log(`ai.intake.call_envelope_dry_run.start org=${request.actor?.organization_id ?? "unset"}`);
    this.enforceFoundationEnabledGate();
    this.enforceVoiceIntakeFoundationGate();

    const actor = requirePermission(request.actor, "calls.view", "forbidden", "Only office roles can access telephony.");
    const organizationId = this.requireActiveOrganizationIdFromActor(actor.organization_id);
    const actorProfileId = actor.profile.id;

    const rawId = typeof dto.recentCallId === "string" ? dto.recentCallId.trim() : "";
    if (rawId === "") {
      apiError(400, "ai_call_intake_request_invalid", "recentCallId must be a non-empty string.");
    }

    const sourceChannel = normalizeOptionalSourceChannel(dto.sourceChannel);

    await this.assertRecentCallInOrganization(rawId, organizationId);
    const recentCall = await this.recentCallsRepo.findOne({
      where: { id: rawId },
    });

    if (!recentCall) {
      apiError(404, "recent_call_not_found", "The recent call could not be found.");
    }

    try {
      const minimal = buildCallIntakeMinimalDigestInputV1(recentCall);
      const sections = buildCallIntakeEnvelopeSectionsV0(recentCall);
      const byteLength = serializedCallIntakeAuditPayloadByteLength(minimal, sections);

      if (byteLength > AI_MAX_SERIALIZED_TOOL_OUTPUT_BYTES) {
        await this.persistRunQuiet({
          id: randomUUID(),
          organization_id: organizationId,
          actor_profile_id: actorProfileId,
          source_channel: sourceChannel,
          feature_key: AI_FEATURE_CALL_INTAKE_ENVELOPE_V0,
          tool_trace_json: JSON.stringify({
            intake_trace_schema_version: AI_INTAKE_TRACE_SCHEMA_VERSION,
            recent_call_id: rawId,
            error: "oversized_call_intake_context",
          }),
          model_id: null,
          prompt_version: AI_PROMPT_VERSION_CALL_INTAKE_V0,
          status: "failed",
          error_code: "ai_context_oversized",
        });
        apiError(
          413,
          "ai_context_oversized",
          "Call intake envelope payload exceeded the bounded context allowance.",
        );
      }

      const digest = digestCallIntakeMinimalInputV1(minimal);
      const modelOutcome = await this.modelInvoker.invoke({
        featureKey: AI_FEATURE_CALL_INTAKE_ENVELOPE_V0,
        organizationId,
      });

      const trace = JSON.stringify({
        intake_trace_schema_version: AI_INTAKE_TRACE_SCHEMA_VERSION,
        normalizer_version: AI_INTAKE_NORMALIZER_VERSION,
        recent_call_id: rawId,
        minimal_input_digest: digest,
        minimal_input_byte_length: Buffer.byteLength(JSON.stringify(minimal), "utf8"),
        sections_keys: Object.keys(sections),
        sections,
        model: modelOutcome,
      });

      const runId = randomUUID();
      await this.audit.persistRun({
        id: runId,
        organization_id: organizationId,
        actor_profile_id: actorProfileId,
        source_channel: sourceChannel,
        feature_key: AI_FEATURE_CALL_INTAKE_ENVELOPE_V0,
        tool_trace_json: trace,
        model_id: null,
        prompt_version: AI_PROMPT_VERSION_CALL_INTAKE_V0,
        status: "completed",
        error_code: null,
      });

      return {
        runId,
        recentCallId: rawId,
        envelope: { sections },
        digest,
        intakeTraceSchemaVersion: AI_INTAKE_TRACE_SCHEMA_VERSION,
        normalizerVersion: AI_INTAKE_NORMALIZER_VERSION,
        wordingMode: "deterministic_v0",
        model: modelOutcome,
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
        feature_key: AI_FEATURE_CALL_INTAKE_ENVELOPE_V0,
        tool_trace_json: JSON.stringify({
          intake_trace_schema_version: AI_INTAKE_TRACE_SCHEMA_VERSION,
          recent_call_id: rawId,
          error: message.slice(0, 280),
        }),
        model_id: null,
        prompt_version: AI_PROMPT_VERSION_CALL_INTAKE_V0,
        status: "failed",
        error_code: "ai_call_intake_envelope_failed",
      });
      apiError(
        500,
        "ai_call_intake_envelope_failed",
        "Call intake envelope dry-run failed while assembling the deterministic contract.",
        message,
      );
    }
  }
}
