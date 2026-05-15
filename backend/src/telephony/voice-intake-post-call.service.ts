import { randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import {
  resolveAiFoundationEnabled,
  resolveAiVoiceIntakeFoundationEnabled,
} from "../ai/ai-environment";
import {
  AI_FEATURE_CALL_INTAKE_VOICE_TELNYX_V1,
  AI_MAX_SERIALIZED_TOOL_OUTPUT_BYTES,
  AI_PROMPT_VERSION_CALL_INTAKE_VOICE_V1,
  AI_SOURCE_CHANNEL_TELNYX_AI_VOICE_WEBHOOK,
} from "../ai/ai.constants";
import {
  buildCallIntakeEnvelopeSectionsVoiceV1,
  buildCallIntakeVoiceMinimalDigestV1,
  digestCallIntakeVoiceMinimalV1,
} from "../ai/call-intake-voice-normalizer.v1";
import { parseCreateLeadPayload } from "../crm/validation";
import { AiRecommendationRunEntity } from "../database/entities/ai-recommendation-run.entity";
import { CustomerEntity } from "../database/entities/customer.entity";
import { LeadEntity } from "../database/entities/lead.entity";
import { RecentCallEntity } from "../database/entities/recent-call.entity";

type HybridOutcome =
  | { outcome: "skipped_existing_lead"; reason_codes: string[] }
  | { outcome: "lead_created"; reason_codes: string[]; created_lead_id: string }
  | { outcome: "artifact_only"; reason_codes: string[]; validation_error?: string };

@Injectable()
export class VoiceIntakePostCallService {
  private readonly logger = new Logger(VoiceIntakePostCallService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(RecentCallEntity)
    private readonly recentCallsRepo: Repository<RecentCallEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customersRepo: Repository<CustomerEntity>,
    @InjectRepository(LeadEntity)
    private readonly leadsRepo: Repository<LeadEntity>,
    @InjectRepository(AiRecommendationRunEntity)
    private readonly runsRepo: Repository<AiRecommendationRunEntity>,
  ) {}

  private mergedEnv(name: string): string | undefined {
    const rawEnv = process.env[name];
    const rawConfig = this.configService.get<string | undefined>(name);
    if (typeof rawEnv === "string" && rawEnv.trim() !== "") {
      return rawEnv;
    }
    return rawConfig ?? rawEnv ?? undefined;
  }

  /**
   * Post-call finalize requires foundation + voice intake foundation only (not live pilot).
   * Live pilot gates attach/routing; conversations started under pilot may finalize after pilot is disabled.
   */
  private isVoiceIntakeFinalizeEnabled(): boolean {
    return (
      resolveAiFoundationEnabled(this.mergedEnv("AI_FOUNDATION_ENABLED"))
      && resolveAiVoiceIntakeFoundationEnabled(this.mergedEnv("AI_VOICE_INTAKE_FOUNDATION_ENABLED"))
    );
  }

  /**
   * Phase 1.5B P3 — after Telnyx conversation webhook enrichment, persist `ai_recommendation_runs` + optional CRM lead.
   */
  async maybeFinalizeFromTelnyxEvent(recentCallId: string, eventType: string | null): Promise<void> {
    if (!this.shouldFinalizeFromTelnyxEvent(eventType)) {
      return;
    }

    if (!this.isVoiceIntakeFinalizeEnabled()) {
      return;
    }

    const call = await this.recentCallsRepo.findOne({ where: { id: recentCallId } });
    if (!call || call.provider !== "telnyx") {
      return;
    }

    const isInsightsEvent =
      eventType === "call.conversation_insights.generated"
      || eventType === "call.conversation.insights.generated";
    if (isInsightsEvent && !call.ai_conversation_messages_json?.trim()) {
      return;
    }

    const organizationId = await this.resolveOrganizationIdForRecentCall(call);
    if (!organizationId) {
      this.logger.warn(`voice_intake_finalize_skipped: no_org recentCallId=${recentCallId}`);
      return;
    }

    const hybrid = await this.resolveHybridCrmOutcome(call, organizationId);

    const minimal = buildCallIntakeVoiceMinimalDigestV1(call);
    const sections = buildCallIntakeEnvelopeSectionsVoiceV1(call);
    const digest = digestCallIntakeVoiceMinimalV1(minimal);

    const tracePayload = {
      voice_intake_trace_schema_version: minimal.voice_intake_trace_schema_version,
      voice_intake_normalizer_version: minimal.voice_intake_normalizer_version,
      recent_call_id: call.id,
      minimal,
      sections,
      digest,
      hybrid_crm: hybrid,
      finalizing_event_type: eventType,
    };

    const byteLen = Buffer.byteLength(JSON.stringify(tracePayload), "utf8");
    if (byteLen > AI_MAX_SERIALIZED_TOOL_OUTPUT_BYTES) {
      await this.upsertRun(organizationId, call.id, {
        tool_trace_json: JSON.stringify({
          ...tracePayload,
          error: "oversized_voice_intake_context",
          hybrid_crm: { outcome: "artifact_only", reason_codes: ["oversized_trace_payload"] } satisfies HybridOutcome,
        }),
        status: "failed",
        error_code: "ai_context_oversized",
        model_id: null,
      });
      return;
    }

    await this.upsertRun(organizationId, call.id, {
      tool_trace_json: JSON.stringify(tracePayload),
      status: "completed",
      error_code: null,
      model_id: null,
    });

    await this.insertActivityIfPresent(call.id, hybrid, eventType);
  }

  private shouldFinalizeFromTelnyxEvent(eventType: string | null): boolean {
    const t = eventType ?? "";
    if (t === "call.conversation.ended") {
      return true;
    }
    if (t === "call.conversation_insights.generated" || t === "call.conversation.insights.generated") {
      return true;
    }
    return false;
  }

  private async upsertRun(
    organizationId: string,
    recentCallId: string,
    patch: Pick<AiRecommendationRunEntity, "tool_trace_json" | "status" | "error_code" | "model_id">,
  ) {
    const existing = await this.runsRepo
      .createQueryBuilder("r")
      .where("r.organization_id = :organizationId", { organizationId })
      .andWhere("r.feature_key = :featureKey", { featureKey: AI_FEATURE_CALL_INTAKE_VOICE_TELNYX_V1 })
      .andWhere("JSON_UNQUOTE(JSON_EXTRACT(r.tool_trace_json, '$.recent_call_id')) = :recentCallId", {
        recentCallId,
      })
      .getOne();

    if (existing) {
      existing.tool_trace_json = patch.tool_trace_json;
      existing.status = patch.status;
      existing.error_code = patch.error_code;
      existing.model_id = patch.model_id;
      await this.runsRepo.save(existing);
      return;
    }

    await this.runsRepo.save(
      this.runsRepo.create({
        id: randomUUID(),
        organization_id: organizationId,
        actor_profile_id: null,
        source_channel: AI_SOURCE_CHANNEL_TELNYX_AI_VOICE_WEBHOOK,
        feature_key: AI_FEATURE_CALL_INTAKE_VOICE_TELNYX_V1,
        prompt_version: AI_PROMPT_VERSION_CALL_INTAKE_VOICE_V1,
        ...patch,
      }),
    );
  }

  private async resolveOrganizationIdForRecentCall(call: RecentCallEntity): Promise<string | null> {
    if (call.inbound_owned_phone_number_id?.trim()) {
      const rows = (await this.dataSource.query(
        `SELECT tenant_id AS org_id FROM owned_phone_numbers WHERE BINARY id = BINARY ? LIMIT 1`,
        [call.inbound_owned_phone_number_id.trim()],
      )) as Array<{ org_id: string | null }>;
      const fromPhone = rows[0]?.org_id?.trim();
      if (fromPhone) {
        return fromPhone;
      }
    }
    if (call.matched_client_id?.trim()) {
      const c = await this.customersRepo.findOne({
        where: { id: call.matched_client_id.trim() },
        select: { organization_id: true },
      });
      if (c?.organization_id?.trim()) {
        return c.organization_id.trim();
      }
    }
    if (call.matched_lead_id?.trim()) {
      const rows = (await this.dataSource.query(
        `SELECT organization_id AS org_id FROM leads WHERE BINARY id = BINARY ? LIMIT 1`,
        [call.matched_lead_id.trim()],
      )) as Array<{ org_id: string | null }>;
      const fromLead = rows[0]?.org_id?.trim();
      if (fromLead) {
        return fromLead;
      }
    }
    return null;
  }

  private async resolveHybridCrmOutcome(call: RecentCallEntity, organizationId: string): Promise<HybridOutcome> {
    if (call.matched_lead_id?.trim()) {
      return { outcome: "skipped_existing_lead", reason_codes: ["matched_lead_already_set"] };
    }

    const clientId = call.matched_client_id?.trim();
    if (!clientId) {
      return {
        outcome: "artifact_only",
        reason_codes: ["no_matched_client"],
      };
    }

    const customer = await this.customersRepo.findOne({ where: { id: clientId } });
    if (!customer) {
      return { outcome: "artifact_only", reason_codes: ["matched_client_not_found"] };
    }

    const org = customer.organization_id?.trim() ?? null;
    if (org && org !== organizationId) {
      return {
        outcome: "artifact_only",
        reason_codes: ["customer_organization_mismatch"],
      };
    }

    if (!this.customerHasCompleteLeadAddress(customer)) {
      return {
        outcome: "artifact_only",
        reason_codes: ["incomplete_customer_service_address_or_phone"],
      };
    }

    if (!customer.preferred_service_type) {
      return {
        outcome: "artifact_only",
        reason_codes: ["missing_preferred_service_type"],
      };
    }

    const payloadJson = {
      fullName: customer.full_name.trim(),
      phone: customer.phone.trim(),
      email: customer.email,
      serviceAddressLine1: customer.service_address_line_1.trim(),
      serviceAddressLine2: customer.service_address_line_2,
      serviceCity: customer.service_city.trim(),
      serviceStateOrRegion: customer.service_state_or_region,
      servicePostalCode: customer.service_postal_code.trim(),
      source: customer.source,
      serviceType: customer.preferred_service_type,
      description: call.ai_summary?.trim() ? call.ai_summary.trim().slice(0, 3000) : null,
    };

    try {
      const parsed = parseCreateLeadPayload(payloadJson);
      const lead = await this.leadsRepo.save(
        this.leadsRepo.create({
          organization_id: organizationId,
          full_name: parsed.fullName,
          phone: parsed.phone,
          email: parsed.email,
          service_address_line_1: parsed.serviceAddressLine1,
          service_address_line_2: parsed.serviceAddressLine2,
          service_city: parsed.serviceCity,
          service_state_or_region: parsed.serviceStateOrRegion,
          service_postal_code: parsed.servicePostalCode,
          source: parsed.source,
          service_type: parsed.serviceType,
          description: parsed.description,
          created_by_auth_user_id: null,
        }),
      );

      call.matched_lead_id = lead.id;
      await this.recentCallsRepo.save(call);

      return {
        outcome: "lead_created",
        reason_codes: ["validated_create_lead_payload"],
        created_lead_id: lead.id,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        outcome: "artifact_only",
        reason_codes: ["parse_create_lead_payload_failed"],
        validation_error: msg,
      };
    }
  }

  private customerHasCompleteLeadAddress(customer: CustomerEntity): boolean {
    const line1 = customer.service_address_line_1?.trim() ?? "";
    const city = customer.service_city?.trim() ?? "";
    const postal = customer.service_postal_code?.trim() ?? "";
    const phone = customer.phone?.trim() ?? "";
    return Boolean(line1 && city && postal && phone);
  }

  private async insertActivityIfPresent(
    recentCallId: string,
    hybrid: HybridOutcome,
    eventType: string | null,
  ) {
    try {
      await this.dataSource.query(
        `
          INSERT INTO recent_call_activity_events (
            id,
            recent_call_id,
            event_key,
            metadata_json,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
        `,
        [
          randomUUID(),
          recentCallId,
          "voice_intake_post_call:finalized",
          JSON.stringify({
            eventType,
            hybrid_crm: hybrid,
          }),
        ],
      );
    } catch (e) {
      this.logger.warn(
        `voice_intake_activity_insert_failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
