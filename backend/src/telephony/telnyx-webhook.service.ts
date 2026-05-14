import { randomUUID, verify } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { createTelnyxPublicKey } from "../common/telnyx-signature";
import { CustomerEntity } from "../database/entities/customer.entity";
import { LeadEntity } from "../database/entities/lead.entity";
import { RecentCallEntity } from "../database/entities/recent-call.entity";
import { assertTablesExist } from "../database/schema-readiness";
import { parseDidSourceMapFromEnv, resolveDidSourceMapping } from "../dispatcher/did-source-mapper";
import { OwnedPhoneNumbersService } from "../messaging/phone-numbers/owned-phone-numbers.service";
import { CallFlowSettingsService } from "./call-flow-settings.service";
import { CallbackTaskService, type CallbackTaskSummary } from "./callback-task.service";
import { TelephonyExecutionService } from "./telephony-execution.service";
import {
  recentCallBelongsToOrgSql,
  recentCallBelongsToOrgSqlNamed,
  recentCallBelongsToOrgParams,
  smsLogBelongsToOrgParams,
  smsLogBelongsToOrgSql,
  TELEPHONY_ORG_QUERY_PARAM,
} from "./telephony-org-scope";

type TelnyxEnvelope = {
  data?: {
    id?: unknown;
    event_type?: unknown;
    occurred_at?: unknown;
    payload?: unknown;
  };
};

type RecentCallsFilter = {
  organizationId: string;
  query?: string | null;
  callStatus?: string | null;
  processingStatus?: string | null;
  limit?: number;
};

type RelatedCallSummary = {
  id: string;
  fromNumber: string | null;
  toNumber: string | null;
  callStatus: string;
  processingStatus: string;
  source: string;
  campaignName: string | null;
  businessHoursStatus: string | null;
  callFlowAction: string | null;
  callFlowRouteTarget: string | null;
  selectedServiceType: string | null;
  selectedIvrDigit: string | null;
  ivrStatus: string | null;
  routeExecutionStatus: string | null;
  routeExecutionDetail: string | null;
  whisperText: string | null;
  whisperStatus: string | null;
  voicemailUrl: string | null;
  voicemailStatus: string | null;
  queueStatus: string | null;
  queuePosition: number | null;
  queueEnteredAt: Date | null;
  queueExitedAt: Date | null;
  queueWaitSeconds: number | null;
  queueCallbackRequested: boolean;
  voicemailTranscription: string | null;
  aiSummary: string | null;
  aiSentiment: string | null;
  aiStatus: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  aiEnrichedAt: Date | null;
  matchedClientId: string | null;
  matchedLeadId: string | null;
  matchedClientDisplayName: string | null;
  recordingUrl: string | null;
  providerRecordingId: string | null;
  recordingStatus: string | null;
  durationSeconds: number | null;
  callStartedAt: Date | null;
  callAnsweredAt: Date | null;
  callEndedAt: Date | null;
  callbackTasks: CallbackTaskSummary[];
  missedCallSms: MissedCallSmsLogSummary | null;
  createdAt: Date;
};

type MissedCallSmsLogSummary = {
  deliveryStatus: string;
  renderedMessage: string | null;
  provider: string;
  providerMessageId: string | null;
  cooldownApplied: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  sentAt: Date | null;
};

type MissedCallSmsSettings = {
  enabled: boolean;
  template: string;
  cooldownSeconds: number;
  placeholders: string[];
  providerConfigured: boolean;
  updatedAt: Date | null;
};

type MissedCallSmsSettingsInput = {
  enabled: boolean;
  template: string;
  cooldownSeconds: number;
  updatedByAuthUserId: string | null;
};

type RecentTextSummary = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  phoneNumber: string | null;
  body: string;
  createdAt: Date;
  unread: boolean;
};

type RecentTextsResponse = {
  unreadCount: number;
  items: RecentTextSummary[];
};

type CustomerTextMessageSummary = {
  id: string;
  customerId: string;
  direction: "inbound" | "outbound";
  phoneNumber: string | null;
  body: string;
  createdAt: Date;
  sentAt: Date | null;
  deliveryStatus: string;
  provider: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  unread: boolean;
};

type CustomerTextThreadResponse = {
  unreadCount: number;
  items: CustomerTextMessageSummary[];
};

type MessagingCustomerConversationSummary = {
  customerId: string;
  customerName: string | null;
  phoneNumber: string | null;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
};

type MessagingUnknownConversationSummary = {
  phoneKey: string;
  phoneNumber: string | null;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
};

type MessagingDashboardResponse = {
  customers: MessagingCustomerConversationSummary[];
  unknownNumbers: MessagingUnknownConversationSummary[];
};

type UnknownTextMessageSummary = {
  id: string;
  customerId: null;
  direction: "inbound" | "outbound";
  phoneNumber: string | null;
  body: string;
  createdAt: Date;
  sentAt: Date | null;
  deliveryStatus: string;
  provider: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  unread: boolean;
};

type UnknownTextThreadResponse = {
  unreadCount: number;
  items: UnknownTextMessageSummary[];
};

type DashboardCallSourceSummary = {
  source: string;
  label: string;
  campaignName: string | null;
  count: number;
};

type DashboardCallSummary = {
  incomingCallsToday: number;
  answeredCallsToday: number;
  missedCallsToday: number;
  voicemailsToday: number;
  openCallbackTasks: number;
  answerRate: number;
  leadsCreatedFromCallsToday: number;
  callsBySource: DashboardCallSourceSummary[];
};

type QueueCallbackRequestInput = {
  priority: string | null;
  notes: string | null;
  requestedByAuthUserId: string | null;
};

type AiEnrichmentInput = {
  voicemailTranscription?: string | null;
  aiSummary?: string | null;
  aiSentiment?: string | null;
  aiStatus?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  aiEnrichedAt?: Date | null;
  updatedByAuthUserId: string | null;
};

type ResolvedRecentCallSource = {
  source: string;
  sourceMappingId: string | null;
  campaignName: string | null;
  ownedPhoneNumberId: string | null;
  ownedPhoneNumberLabel: string | null;
  marketKey: string | null;
  marketLabel: string | null;
  matched: boolean;
  /** When set, CRM customer matching for this inbound call should be limited to this organization. */
  matchOrganizationId: string | null;
};

const DEFAULT_MISSED_CALL_SMS_TEMPLATE =
  "Sorry we missed your call to Phoenix Fireplace. Reply to this text or call us back and our office will follow up shortly.";
const DEFAULT_MISSED_CALL_SMS_COOLDOWN_SECONDS = 900;
const MISSED_CALL_SMS_PLACEHOLDERS = ["customer_name", "caller_number", "called_number", "recent_call_id"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

@Injectable()
export class TelnyxWebhookService {
  private recentCallsSchemaEnsured = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(RecentCallEntity)
    private readonly recentCallsRepository: Repository<RecentCallEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
    @InjectRepository(LeadEntity)
    private readonly leadsRepository: Repository<LeadEntity>,
    private readonly ownedPhoneNumbersService: OwnedPhoneNumbersService,
    private readonly callFlowSettingsService: CallFlowSettingsService,
    private readonly telephonyExecutionService: TelephonyExecutionService,
    private readonly callbackTaskService: CallbackTaskService,
  ) {}

  async processWebhook(rawBody: Buffer, signature: string | null, timestamp: string | null) {
    await this.ensureRecentCallsSchema();
    this.verifySignature(rawBody, signature, timestamp);

    const payload = this.parsePayload(rawBody);
    const eventType = this.asTrimmedString(payload.data?.event_type);
    const providerEventId = this.asTrimmedString(payload.data?.id);

    if (!providerEventId) {
      apiError(400, "telnyx_event_id_missing", "Telnyx event id is required.");
    }

    if (this.isRecordingEventType(eventType)) {
      return this.handleRecordingEvent(payload, rawBody, eventType, providerEventId);
    }

    if (this.isQueueEventType(eventType, payload)) {
      return this.handleQueueEvent(payload, rawBody, eventType, providerEventId);
    }

    if (this.isIvrInputEventType(eventType, payload)) {
      return this.handleIvrInputEvent(payload, rawBody, eventType, providerEventId);
    }

    if (this.isLifecycleEventType(eventType)) {
      return this.handleLifecycleEvent(payload, rawBody, eventType, providerEventId);
    }

    if (eventType !== "call.initiated") {
      return {
        received: true,
        ignored: true,
        reason: "unsupported_event_type",
      };
    }

    const existing = await this.recentCallsRepository.findOne({
      where: {
        provider: "telnyx",
        provider_event_id: providerEventId,
      },
    });

    if (existing) {
      return {
        received: true,
        duplicate: true,
        recentCallId: existing.id,
      };
    }

    const eventPayload = isRecord(payload.data?.payload) ? payload.data.payload : {};
    const fromNumber = this.readFirstString(eventPayload, [
      ["from"],
      ["from_number"],
      ["ani"],
      ["caller_number"],
      ["from", "phone_number"],
      ["from", "e164"],
    ]);
    const toNumber = this.readFirstString(eventPayload, [
      ["to"],
      ["to_number"],
      ["dnis"],
      ["called_number"],
      ["to", "phone_number"],
      ["to", "e164"],
    ]);
    const fromNumberNormalized = this.normalizePhone(fromNumber);
    const toNumberNormalized = this.normalizePhone(toNumber);
    const sourceContext = await this.resolveRecentCallSource(toNumber);
    const matchedClient = await this.matchCustomerByPhone(fromNumberNormalized, sourceContext.matchOrganizationId);
    const providerCallId = this.readFirstString(eventPayload, [
      ["call_control_id"],
      ["call_session_id"],
      ["call_leg_id"],
      ["call_id"],
    ]);
    const providerConnectionId = this.readFirstString(eventPayload, [
      ["connection_id"],
      ["connection", "id"],
      ["call_connection_id"],
    ]);
    const occurredAt = this.asDate(payload.data?.occurred_at);
    const callFlowDecision = await this.callFlowSettingsService.evaluateActiveCallFlow(occurredAt ?? new Date());

    let saved: RecentCallEntity;

    try {
      saved = await this.recentCallsRepository.save(
        this.recentCallsRepository.create({
          provider: "telnyx",
          provider_event_id: providerEventId,
          provider_call_id: providerCallId,
          provider_connection_id: providerConnectionId,
          from_number: fromNumber,
          from_number_normalized: fromNumberNormalized,
          to_number: toNumber,
          to_number_normalized: toNumberNormalized,
          source: sourceContext.source,
          source_mapping_id: sourceContext.sourceMappingId,
          campaign_name: sourceContext.campaignName,
          inbound_owned_phone_number_id: sourceContext.ownedPhoneNumberId,
          inbound_owned_phone_number_label: sourceContext.ownedPhoneNumberLabel,
          inbound_market_key: sourceContext.marketKey,
          inbound_market_label: sourceContext.marketLabel,
          call_status: "initiated",
          processing_status: matchedClient ? "matched_customer" : "unmatched_customer",
          business_hours_status: callFlowDecision.businessHoursStatus,
          call_flow_action: callFlowDecision.callFlowAction,
          call_flow_route_target: callFlowDecision.callFlowRouteTarget,
          selected_service_type: null,
          selected_ivr_digit: null,
          matched_client_id: matchedClient?.id ?? null,
          matched_lead_id: null,
          matched_client_display_name: matchedClient?.full_name ?? null,
          recording_url: null,
          provider_recording_id: null,
          recording_status: null,
          duration_seconds: null,
          call_started_at: occurredAt,
          call_answered_at: null,
          call_ended_at: null,
          raw_payload_snapshot: rawBody.toString("utf8"),
        }),
      );
    } catch {
      const duplicate = await this.recentCallsRepository.findOne({
        where: {
          provider: "telnyx",
          provider_event_id: providerEventId,
        },
      });

      if (duplicate) {
        return {
          received: true,
          duplicate: true,
          recentCallId: duplicate.id,
        };
      }

      apiError(500, "recent_call_create_failed", "The recent call record could not be created.");
    }

    const initialExecution = await this.executeInitialCallFlow(saved);

    if (initialExecution) {
      saved = await this.recentCallsRepository.save(saved);
    }

    return {
      received: true,
      duplicate: false,
      recentCallId: saved.id,
      matchedClientId: saved.matched_client_id,
      businessHoursStatus: saved.business_hours_status,
      callFlowAction: saved.call_flow_action,
      ivrStatus: saved.ivr_status,
      routeExecutionStatus: saved.route_execution_status,
      voicemailStatus: saved.voicemail_status,
    };
  }

  async listRecentCalls(input: RecentCallsFilter) {
    await this.ensureRecentCallsSchema();

    const queryBuilder = this.recentCallsRepository.createQueryBuilder("recent_call");
    const query = (input.query ?? "").trim();

    queryBuilder.andWhere(
      recentCallBelongsToOrgSqlNamed("recent_call", TELEPHONY_ORG_QUERY_PARAM),
    );
    queryBuilder.setParameter(TELEPHONY_ORG_QUERY_PARAM, input.organizationId.trim());

    if (query) {
      queryBuilder.andWhere(
        "(recent_call.from_number LIKE :query OR recent_call.to_number LIKE :query OR recent_call.matched_client_display_name LIKE :query)",
        { query: `%${query}%` },
      );
    }

    if (input.callStatus) {
      queryBuilder.andWhere("recent_call.call_status = :callStatus", { callStatus: input.callStatus });
    }

    if (input.processingStatus) {
      queryBuilder.andWhere("recent_call.processing_status = :processingStatus", { processingStatus: input.processingStatus });
    }

    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    const records = await queryBuilder
      .orderBy("recent_call.created_at", "DESC")
      .take(limit)
      .getMany();
    const callbackTaskMap = await this.callbackTaskService.listCallbackTasksByRecentCallIds(records.map((record) => record.id));
    const latestSmsLogMap = await this.loadLatestMissedCallSmsLogMap(records.map((record) => record.id));

    return records.map((record) => ({
      id: record.id,
      provider: record.provider,
      providerEventId: record.provider_event_id,
      providerCallId: record.provider_call_id,
      providerConnectionId: record.provider_connection_id,
      fromNumber: record.from_number,
      toNumber: record.to_number,
      source: record.source,
      campaignName: record.campaign_name,
      inboundOwnedPhoneNumberId: record.inbound_owned_phone_number_id,
      inboundOwnedPhoneNumberLabel: record.inbound_owned_phone_number_label,
      inboundMarketKey: record.inbound_market_key,
      inboundMarketLabel: record.inbound_market_label,
      callStatus: record.call_status,
      processingStatus: record.processing_status,
      businessHoursStatus: record.business_hours_status,
      callFlowAction: record.call_flow_action,
      callFlowRouteTarget: record.call_flow_route_target,
      selectedServiceType: record.selected_service_type,
      selectedIvrDigit: record.selected_ivr_digit,
      ivrStatus: record.ivr_status,
      routeExecutionStatus: record.route_execution_status,
      routeExecutionDetail: record.route_execution_detail,
      whisperText: record.whisper_text,
      whisperStatus: record.whisper_status,
      voicemailUrl: record.voicemail_url,
      voicemailStatus: record.voicemail_status,
      queueStatus: record.queue_status,
      queuePosition: record.queue_position,
      queueEnteredAt: record.queue_entered_at,
      queueExitedAt: record.queue_exited_at,
      queueWaitSeconds: record.queue_wait_seconds,
      queueCallbackRequested: record.queue_callback_requested,
      voicemailTranscription: record.voicemail_transcription,
      aiSummary: record.ai_summary,
      aiSentiment: record.ai_sentiment,
      aiStatus: record.ai_status,
      aiProvider: record.ai_provider,
      aiModel: record.ai_model,
      aiEnrichedAt: record.ai_enriched_at,
      matchedClientId: record.matched_client_id,
      matchedLeadId: record.matched_lead_id,
      matchedClientDisplayName: record.matched_client_display_name,
      recordingUrl: record.recording_url,
      providerRecordingId: record.provider_recording_id,
      recordingStatus: record.recording_status,
      durationSeconds: record.duration_seconds,
      callStartedAt: record.call_started_at,
      callAnsweredAt: record.call_answered_at,
      callEndedAt: record.call_ended_at,
      callbackTasks: callbackTaskMap.get(record.id) ?? [],
      missedCallSms: latestSmsLogMap.get(record.id) ?? null,
      createdAt: record.created_at,
    }));
  }

  async getDashboardCallSummary(input: { organizationId: string; todayStart: Date; todayEnd: Date }): Promise<DashboardCallSummary> {
    await this.ensureRecentCallsSchema();

    const orgParams = recentCallBelongsToOrgParams(input.organizationId);

    const [countRows, sourceRows, openCallbackTasks] = await Promise.all([
      this.dataSource.query(
        `
          SELECT
            COUNT(*) AS incoming_calls_today,
            SUM(CASE WHEN rc.call_answered_at IS NOT NULL OR rc.call_status IN ('answered', 'completed') THEN 1 ELSE 0 END) AS answered_calls_today,
            SUM(CASE WHEN rc.call_status = 'missed' THEN 1 ELSE 0 END) AS missed_calls_today,
            SUM(CASE WHEN rc.call_status = 'voicemail' THEN 1 ELSE 0 END) AS voicemails_today,
            SUM(CASE WHEN rc.matched_lead_id IS NOT NULL THEN 1 ELSE 0 END) AS leads_created_from_calls_today
          FROM recent_calls rc
          WHERE COALESCE(rc.call_started_at, rc.created_at) >= ?
            AND COALESCE(rc.call_started_at, rc.created_at) <= ?
            AND ${recentCallBelongsToOrgSql("rc")}
        `,
        [input.todayStart, input.todayEnd, ...orgParams],
      ) as Promise<Array<Record<string, unknown>>>,
      this.dataSource.query(
        `
          SELECT
            rc.source,
            rc.campaign_name,
            COUNT(*) AS total
          FROM recent_calls rc
          WHERE COALESCE(rc.call_started_at, rc.created_at) >= ?
            AND COALESCE(rc.call_started_at, rc.created_at) <= ?
            AND ${recentCallBelongsToOrgSql("rc")}
          GROUP BY rc.source, rc.campaign_name
          ORDER BY total DESC, rc.source ASC, rc.campaign_name ASC
          LIMIT 5
        `,
        [input.todayStart, input.todayEnd, ...orgParams],
      ) as Promise<Array<Record<string, unknown>>>,
      this.callbackTaskService.countOpenCallbackTasks(input.organizationId),
    ]);

    const countRow = countRows[0] ?? {};
    const incomingCallsToday = this.toSafeInteger(countRow.incoming_calls_today);
    const answeredCallsToday = this.toSafeInteger(countRow.answered_calls_today);
    const missedCallsToday = this.toSafeInteger(countRow.missed_calls_today);
    const voicemailsToday = this.toSafeInteger(countRow.voicemails_today);
    const leadsCreatedFromCallsToday = this.toSafeInteger(countRow.leads_created_from_calls_today);

    return {
      incomingCallsToday,
      answeredCallsToday,
      missedCallsToday,
      voicemailsToday,
      openCallbackTasks,
      answerRate: incomingCallsToday > 0 ? Math.round((answeredCallsToday / incomingCallsToday) * 100) : 0,
      leadsCreatedFromCallsToday,
      callsBySource: sourceRows.map((row) => {
        const source = this.asTrimmedString(row.source) ?? "unknown";
        const campaignName = this.asTrimmedString(row.campaign_name);

        return {
          source,
          label: campaignName ?? this.formatCallSourceLabel(source),
          campaignName,
          count: this.toSafeInteger(row.total),
        } satisfies DashboardCallSourceSummary;
      }),
    };
  }

  async listCustomerCalls(customerId: string) {
    await this.ensureRecentCallsSchema();

    const records = await this.recentCallsRepository.find({
      where: {
        matched_client_id: customerId,
      },
      order: {
        created_at: "DESC",
      },
      take: 25,
    });
    const callbackTaskMap = await this.callbackTaskService.listCallbackTasksByRecentCallIds(records.map((record) => record.id));
    const latestSmsLogMap = await this.loadLatestMissedCallSmsLogMap(records.map((record) => record.id));

    return records.map((record) => this.toRelatedCallSummary(record, callbackTaskMap.get(record.id) ?? [], latestSmsLogMap.get(record.id) ?? null));
  }

  async listLeadCalls(leadId: string) {
    await this.ensureRecentCallsSchema();

    const records = await this.recentCallsRepository.find({
      where: {
        matched_lead_id: leadId,
      },
      order: {
        created_at: "DESC",
      },
      take: 25,
    });
    const callbackTaskMap = await this.callbackTaskService.listCallbackTasksByRecentCallIds(records.map((record) => record.id));
    const latestSmsLogMap = await this.loadLatestMissedCallSmsLogMap(records.map((record) => record.id));

    return records.map((record) => this.toRelatedCallSummary(record, callbackTaskMap.get(record.id) ?? [], latestSmsLogMap.get(record.id) ?? null));
  }

  async attachRecentCallToLead(recentCallId: string, leadId: string) {
    await this.ensureRecentCallsSchema();

    const [recentCall, lead] = await Promise.all([
      this.recentCallsRepository.findOne({
        where: {
          id: recentCallId,
        },
      }),
      this.leadsRepository.findOne({
        where: {
          id: leadId,
        },
      }),
    ]);

    if (!recentCall) {
      apiError(404, "recent_call_not_found", "The recent call could not be found.");
    }

    if (!lead) {
      apiError(404, "lead_not_found", "The lead could not be found.");
    }

    recentCall.matched_lead_id = lead.id;

    if (recentCall.processing_status === "unmatched_customer") {
      recentCall.processing_status = "linked_to_lead";
    } else if (recentCall.processing_status === "matched_customer") {
      recentCall.processing_status = "matched_customer_with_lead";
    }

    await this.recentCallsRepository.save(recentCall);

    const [callbackTaskMap, latestSmsLogMap] = await Promise.all([
      this.callbackTaskService.listCallbackTasksByRecentCallIds([recentCall.id]),
      this.loadLatestMissedCallSmsLogMap([recentCall.id]),
    ]);
    return this.toRelatedCallSummary(
      recentCall,
      callbackTaskMap.get(recentCall.id) ?? [],
      latestSmsLogMap.get(recentCall.id) ?? null,
    );
  }

  async requestQueueCallback(recentCallId: string, organizationId: string, input: QueueCallbackRequestInput) {
    await this.ensureRecentCallsSchema();

    await this.assertRecentCallInOrganization(recentCallId, organizationId);

    const recentCall = await this.recentCallsRepository.findOne({
      where: {
        id: recentCallId,
      },
    });

    if (!recentCall) {
      apiError(404, "recent_call_not_found", "The recent call could not be found.");
    }

    const requestedAt = new Date();
    recentCall.queue_callback_requested = true;
    recentCall.queue_status = "callback_requested";
    recentCall.queue_exited_at = recentCall.queue_exited_at ?? requestedAt;
    recentCall.queue_wait_seconds = this.computeQueueWaitSeconds(recentCall.queue_entered_at, recentCall.queue_exited_at);

    await this.recentCallsRepository.save(recentCall);

    const callbackTask = await this.callbackTaskService.createCallbackTask({
      organizationId,
      recentCallId: recentCall.id,
      priority: input.priority === "high" || input.priority === "normal" || input.priority === "low" ? input.priority : undefined,
      dueAt: requestedAt,
      assignedToProfileId: null,
      notes: input.notes?.trim() || "Queue callback requested from the recent calls operations surface.",
      createdByAuthUserId: input.requestedByAuthUserId,
    });

    await this.insertRecentCallActivityEvent(recentCall.id, "recent_call_queue_updated", {
      queueStatus: recentCall.queue_status,
      queuePosition: recentCall.queue_position,
      queueWaitSeconds: recentCall.queue_wait_seconds,
      queueCallbackRequested: recentCall.queue_callback_requested,
      callbackTaskId: callbackTask.id,
      requestedByAuthUserId: input.requestedByAuthUserId,
    });

    const latestSmsLogMap = await this.loadLatestMissedCallSmsLogMap([recentCall.id]);
    return this.toRelatedCallSummary(recentCall, [callbackTask], latestSmsLogMap.get(recentCall.id) ?? null);
  }

  async submitAiEnrichment(recentCallId: string, organizationId: string, input: AiEnrichmentInput) {
    await this.ensureRecentCallsSchema();

    await this.assertRecentCallInOrganization(recentCallId, organizationId);

    const recentCall = await this.recentCallsRepository.findOne({
      where: {
        id: recentCallId,
      },
    });

    if (!recentCall) {
      apiError(404, "recent_call_not_found", "The recent call could not be found.");
    }

    if (input.voicemailTranscription !== undefined) {
      recentCall.voicemail_transcription = input.voicemailTranscription;
    }

    if (input.aiSummary !== undefined) {
      recentCall.ai_summary = input.aiSummary;
    }

    if (input.aiSentiment !== undefined) {
      recentCall.ai_sentiment = this.normalizeStatusToken(input.aiSentiment);
    }

    if (input.aiStatus !== undefined) {
      recentCall.ai_status = this.normalizeStatusToken(input.aiStatus);
    } else if (input.voicemailTranscription !== undefined || input.aiSummary !== undefined || input.aiSentiment !== undefined) {
      recentCall.ai_status = "completed";
    }

    if (input.aiProvider !== undefined) {
      recentCall.ai_provider = input.aiProvider;
    }

    if (input.aiModel !== undefined) {
      recentCall.ai_model = input.aiModel;
    }

    if (
      input.aiEnrichedAt !== undefined
      || input.voicemailTranscription !== undefined
      || input.aiSummary !== undefined
      || input.aiSentiment !== undefined
      || input.aiStatus !== undefined
    ) {
      recentCall.ai_enriched_at = input.aiEnrichedAt ?? new Date();
    }

    await this.recentCallsRepository.save(recentCall);

    await this.insertRecentCallActivityEvent(recentCall.id, "recent_call_ai_enriched", {
      aiStatus: recentCall.ai_status,
      aiSentiment: recentCall.ai_sentiment,
      aiProvider: recentCall.ai_provider,
      aiModel: recentCall.ai_model,
      aiEnrichedAt: recentCall.ai_enriched_at?.toISOString() ?? null,
      updatedByAuthUserId: input.updatedByAuthUserId,
    });

    const [callbackTaskMap, latestSmsLogMap] = await Promise.all([
      this.callbackTaskService.listCallbackTasksByRecentCallIds([recentCall.id]),
      this.loadLatestMissedCallSmsLogMap([recentCall.id]),
    ]);

    return this.toRelatedCallSummary(
      recentCall,
      callbackTaskMap.get(recentCall.id) ?? [],
      latestSmsLogMap.get(recentCall.id) ?? null,
    );
  }

  async getMissedCallSmsSettings(): Promise<MissedCallSmsSettings> {
    await this.ensureRecentCallsSchema();

    const rows = await this.dataSource.query(
      `
        SELECT is_enabled, template, cooldown_seconds, updated_at
        FROM missed_call_sms_settings
        WHERE settings_key = 'default'
        LIMIT 1
      `,
    ) as Array<{
      is_enabled: number | boolean | string;
      template: string | null;
      cooldown_seconds: number | string | null;
      updated_at: Date | string | null;
    }>;

    const row = rows[0] ?? null;

    return {
      enabled: row ? this.toBoolean(row.is_enabled) : false,
      template: row?.template?.trim() || DEFAULT_MISSED_CALL_SMS_TEMPLATE,
      cooldownSeconds: row?.cooldown_seconds !== null && row?.cooldown_seconds !== undefined
        ? Number(row.cooldown_seconds)
        : DEFAULT_MISSED_CALL_SMS_COOLDOWN_SECONDS,
      placeholders: [...MISSED_CALL_SMS_PLACEHOLDERS],
      providerConfigured: this.isSmsProviderConfigured(),
      updatedAt: this.asDate(row?.updated_at ?? null),
    };
  }

  async updateMissedCallSmsSettings(input: MissedCallSmsSettingsInput) {
    await this.ensureRecentCallsSchema();

    const template = this.validateMissedCallSmsTemplate(input.template);
    const cooldownSeconds = Math.max(0, Math.min(Math.trunc(input.cooldownSeconds), 604800));

    await this.dataSource.query(
      `
        INSERT INTO missed_call_sms_settings (
          id,
          settings_key,
          is_enabled,
          template,
          cooldown_seconds,
          updated_by_auth_user_id
        ) VALUES (?, 'default', ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          is_enabled = VALUES(is_enabled),
          template = VALUES(template),
          cooldown_seconds = VALUES(cooldown_seconds),
          updated_by_auth_user_id = VALUES(updated_by_auth_user_id)
      `,
      [randomUUID(), input.enabled ? 1 : 0, template, cooldownSeconds, input.updatedByAuthUserId],
    );

    return this.getMissedCallSmsSettings();
  }

  async listRecentTexts(organizationId: string, limitRaw?: number): Promise<RecentTextsResponse> {
    await this.ensureRecentCallsSchema();

    const limit = Math.max(1, Math.min(limitRaw ?? 6, 20));
    const smsParams = smsLogBelongsToOrgParams(organizationId);
    const [rows, unreadRows] = await Promise.all([
      this.dataSource.query(
        `
          SELECT
            log.id,
            log.customer_id,
            customer.full_name AS customer_name,
            log.phone_number,
            log.rendered_message,
            log.created_at,
            log.read_at
          FROM recent_call_sms_logs log
          LEFT JOIN customers customer
            ON BINARY customer.id = BINARY log.customer_id
          WHERE log.direction = 'inbound'
            AND ${smsLogBelongsToOrgSql("log", "rc_txt")}
          ORDER BY log.created_at DESC
          LIMIT ?
        `,
        [...smsParams, limit],
      ) as Promise<Array<{
        id: string;
        customer_id: string | null;
        customer_name: string | null;
        phone_number: string | null;
        rendered_message: string | null;
        created_at: Date | string;
        read_at: Date | string | null;
      }>>,
      this.dataSource.query(
        `
          SELECT COUNT(*) AS unread_count
          FROM recent_call_sms_logs log
          WHERE log.direction = 'inbound'
            AND log.read_at IS NULL
            AND ${smsLogBelongsToOrgSql("log", "rc_unread")}
        `,
        smsParams,
      ) as Promise<Array<{ unread_count: number | string }>>,
    ]);

    return {
      unreadCount: Number(unreadRows[0]?.unread_count ?? 0),
      items: rows.map((row) => ({
        id: row.id,
        customerId: row.customer_id,
        customerName: row.customer_name,
        phoneNumber: row.phone_number,
        body: row.rendered_message?.trim() || "(empty text message)",
        createdAt: this.asDate(row.created_at) ?? new Date(),
        unread: !this.asDate(row.read_at),
      } satisfies RecentTextSummary)),
    };
  }

  async markAllRecentTextsRead(organizationId: string, limitRaw?: number): Promise<RecentTextsResponse> {
    await this.ensureRecentCallsSchema();

    const smsParams = smsLogBelongsToOrgParams(organizationId);
    await this.dataSource.query(
      `
        UPDATE recent_call_sms_logs log
        SET read_at = CURRENT_TIMESTAMP(6)
        WHERE log.direction = 'inbound'
          AND log.read_at IS NULL
          AND ${smsLogBelongsToOrgSql("log", "rc_mr")}
      `,
      smsParams,
    );

    return this.listRecentTexts(organizationId, limitRaw);
  }

  async listMessagingDashboard(organizationId: string, limitRaw?: number): Promise<MessagingDashboardResponse> {
    await this.ensureRecentCallsSchema();

    const limit = Math.max(1, Math.min(limitRaw ?? 100, 250));
    const smsParams = smsLogBelongsToOrgParams(organizationId);
    const [customerRows, unknownRows] = await Promise.all([
      this.dataSource.query(
        `
          SELECT
            log.customer_id,
            customer.full_name AS customer_name,
            SUBSTRING_INDEX(GROUP_CONCAT(log.phone_number ORDER BY log.created_at DESC SEPARATOR '\\n'), '\\n', 1) AS phone_number,
            SUBSTRING_INDEX(
              GROUP_CONCAT(COALESCE(NULLIF(TRIM(log.rendered_message), ''), '(empty text message)') ORDER BY log.created_at DESC SEPARATOR '\\n'),
              '\\n',
              1
            ) AS last_message,
            MAX(log.created_at) AS last_message_at,
            SUM(CASE WHEN log.direction = 'inbound' AND log.read_at IS NULL THEN 1 ELSE 0 END) AS unread_count
          FROM recent_call_sms_logs log
          LEFT JOIN customers customer
            ON BINARY customer.id = BINARY log.customer_id
          WHERE log.customer_id IS NOT NULL
            AND ${smsLogBelongsToOrgSql("log", "rc_dash_c")}
          GROUP BY log.customer_id, customer.full_name
          ORDER BY last_message_at DESC
          LIMIT ?
        `,
        [...smsParams, limit],
      ) as Promise<Array<{
        customer_id: string;
        customer_name: string | null;
        phone_number: string | null;
        last_message: string | null;
        last_message_at: Date | string;
        unread_count: number | string;
      }>>,
      this.dataSource.query(
        `
          SELECT
            COALESCE(NULLIF(log.phone_number_normalized, ''), NULLIF(log.phone_number, '')) AS phone_key,
            SUBSTRING_INDEX(GROUP_CONCAT(log.phone_number ORDER BY log.created_at DESC SEPARATOR '\\n'), '\\n', 1) AS phone_number,
            SUBSTRING_INDEX(
              GROUP_CONCAT(COALESCE(NULLIF(TRIM(log.rendered_message), ''), '(empty text message)') ORDER BY log.created_at DESC SEPARATOR '\\n'),
              '\\n',
              1
            ) AS last_message,
            MAX(log.created_at) AS last_message_at,
            SUM(CASE WHEN log.direction = 'inbound' AND log.read_at IS NULL THEN 1 ELSE 0 END) AS unread_count
          FROM recent_call_sms_logs log
          WHERE log.customer_id IS NULL
            AND COALESCE(NULLIF(log.phone_number_normalized, ''), NULLIF(log.phone_number, '')) IS NOT NULL
            AND ${smsLogBelongsToOrgSql("log", "rc_dash_u")}
          GROUP BY phone_key
          ORDER BY last_message_at DESC
          LIMIT ?
        `,
        [...smsParams, limit],
      ) as Promise<Array<{
        phone_key: string;
        phone_number: string | null;
        last_message: string | null;
        last_message_at: Date | string;
        unread_count: number | string;
      }>>,
    ]);

    return {
      customers: customerRows.map((row) => ({
        customerId: row.customer_id,
        customerName: row.customer_name,
        phoneNumber: row.phone_number,
        lastMessage: row.last_message?.trim() || "(empty text message)",
        lastMessageAt: this.asDate(row.last_message_at) ?? new Date(),
        unreadCount: Number(row.unread_count ?? 0),
      })),
      unknownNumbers: unknownRows.map((row) => ({
        phoneKey: row.phone_key,
        phoneNumber: row.phone_number,
        lastMessage: row.last_message?.trim() || "(empty text message)",
        lastMessageAt: this.asDate(row.last_message_at) ?? new Date(),
        unreadCount: Number(row.unread_count ?? 0),
      })),
    };
  }

  async listUnknownTextThread(organizationId: string, phoneKeyRaw: string, limitRaw?: number): Promise<UnknownTextThreadResponse> {
    await this.ensureRecentCallsSchema();

    const normalizedPhone = this.normalizePhone(phoneKeyRaw);
    const phoneKey = normalizedPhone ?? phoneKeyRaw.trim();

    if (!phoneKey) {
      apiError(400, "unknown_sms_phone_required", "A phone number key is required.");
    }

    const limit = Math.max(1, Math.min(limitRaw ?? 200, 400));
    const smsParams = smsLogBelongsToOrgParams(organizationId);
    const [rows, unreadRows] = await Promise.all([
      this.dataSource.query(
        `
          SELECT
            log.id,
            log.direction,
            log.phone_number,
            log.rendered_message,
            log.created_at,
            log.sent_at,
            log.delivery_status,
            log.provider,
            log.provider_message_id,
            log.error_message,
            log.read_at
          FROM recent_call_sms_logs log
          WHERE log.customer_id IS NULL
            AND (
              COALESCE(NULLIF(log.phone_number_normalized, ''), NULLIF(log.phone_number, '')) = ?
              OR log.phone_number = ?
            )
            AND ${smsLogBelongsToOrgSql("log", "rc_unk")}
          ORDER BY log.created_at DESC
          LIMIT ?
        `,
        [...smsParams, phoneKey, phoneKeyRaw.trim(), limit],
      ) as Promise<Array<{
        id: string;
        direction: "inbound" | "outbound";
        phone_number: string | null;
        rendered_message: string | null;
        created_at: Date | string;
        sent_at: Date | string | null;
        delivery_status: string;
        provider: string;
        provider_message_id: string | null;
        error_message: string | null;
        read_at: Date | string | null;
      }>>,
      this.dataSource.query(
        `
          SELECT COUNT(*) AS unread_count
          FROM recent_call_sms_logs log
          WHERE log.customer_id IS NULL
            AND log.direction = 'inbound'
            AND log.read_at IS NULL
            AND (
              COALESCE(NULLIF(log.phone_number_normalized, ''), NULLIF(log.phone_number, '')) = ?
              OR log.phone_number = ?
            )
            AND ${smsLogBelongsToOrgSql("log", "rc_unk_u")}
        `,
        [...smsParams, phoneKey, phoneKeyRaw.trim()],
      ) as Promise<Array<{ unread_count: number | string }>>,
    ]);

    return {
      unreadCount: Number(unreadRows[0]?.unread_count ?? 0),
      items: rows.map((row) => ({
        id: row.id,
        customerId: null,
        direction: row.direction,
        phoneNumber: row.phone_number,
        body: row.rendered_message?.trim() || "(empty text message)",
        createdAt: this.asDate(row.created_at) ?? new Date(),
        sentAt: this.asDate(row.sent_at),
        deliveryStatus: row.delivery_status,
        provider: row.provider,
        providerMessageId: row.provider_message_id,
        errorMessage: row.error_message,
        unread: row.direction === "inbound" && !this.asDate(row.read_at),
      })),
    };
  }

  async listCustomerTextThread(customerId: string, organizationId: string, limitRaw?: number): Promise<CustomerTextThreadResponse> {
    await this.ensureRecentCallsSchema();
    await this.requireCustomerForTexting(customerId, organizationId);

    const limit = Math.max(1, Math.min(limitRaw ?? 50, 200));
    const [rows, unreadRows] = await Promise.all([
      this.dataSource.query(
        `
          SELECT
            log.id,
            log.customer_id,
            log.direction,
            log.phone_number,
            log.rendered_message,
            log.created_at,
            log.sent_at,
            log.delivery_status,
            log.provider,
            log.provider_message_id,
            log.error_message,
            log.read_at
          FROM recent_call_sms_logs log
          WHERE log.customer_id = ?
            AND EXISTS (
              SELECT 1 FROM customers c
              WHERE BINARY c.id = BINARY log.customer_id
                AND c.organization_id = ?
            )
          ORDER BY log.created_at DESC
          LIMIT ?
        `,
        [customerId, organizationId, limit],
      ) as Promise<Array<{
        id: string;
        customer_id: string;
        direction: "inbound" | "outbound";
        phone_number: string | null;
        rendered_message: string | null;
        created_at: Date | string;
        sent_at: Date | string | null;
        delivery_status: string;
        provider: string;
        provider_message_id: string | null;
        error_message: string | null;
        read_at: Date | string | null;
      }>>,
      this.dataSource.query(
        `
          SELECT COUNT(*) AS unread_count
          FROM recent_call_sms_logs log
          WHERE log.customer_id = ?
            AND log.direction = 'inbound'
            AND log.read_at IS NULL
            AND EXISTS (
              SELECT 1 FROM customers c
              WHERE BINARY c.id = BINARY log.customer_id
                AND c.organization_id = ?
            )
        `,
        [customerId, organizationId],
      ) as Promise<Array<{ unread_count: number | string }>>,
    ]);

    return {
      unreadCount: Number(unreadRows[0]?.unread_count ?? 0),
      items: rows.map((row) => ({
        id: row.id,
        customerId: row.customer_id,
        direction: row.direction,
        phoneNumber: row.phone_number,
        body: row.rendered_message?.trim() || "(empty text message)",
        createdAt: this.asDate(row.created_at) ?? new Date(),
        sentAt: this.asDate(row.sent_at),
        deliveryStatus: row.delivery_status,
        provider: row.provider,
        providerMessageId: row.provider_message_id,
        errorMessage: row.error_message,
        unread: row.direction === "inbound" && !this.asDate(row.read_at),
      } satisfies CustomerTextMessageSummary)),
    };
  }

  async markCustomerTextThreadRead(customerId: string, organizationId: string, limitRaw?: number): Promise<CustomerTextThreadResponse> {
    await this.ensureRecentCallsSchema();
    await this.requireCustomerForTexting(customerId, organizationId);

    await this.dataSource.query(
      `
        UPDATE recent_call_sms_logs log
        SET read_at = CURRENT_TIMESTAMP(6)
        WHERE log.customer_id = ?
          AND log.direction = 'inbound'
          AND log.read_at IS NULL
          AND EXISTS (
            SELECT 1 FROM customers c
            WHERE BINARY c.id = BINARY log.customer_id
              AND c.organization_id = ?
          )
      `,
      [customerId, organizationId],
    );

    return this.listCustomerTextThread(customerId, organizationId, limitRaw);
  }

  async sendCustomerText(customerId: string, organizationId: string, messageBody: string) {
    await this.ensureRecentCallsSchema();

    const customer = await this.requireCustomerForTexting(customerId, organizationId);
    const normalizedPhone = this.normalizePhone(customer.phone);
    const phoneNumber = customer.phone?.trim() ?? "";
    const phoneNumberE164 = this.toE164Phone(customer.phone);
    const message = messageBody.trim();

    if (!message) {
      apiError(400, "customer_sms_body_required", "Text message body is required.");
    }

    if (!phoneNumber || !normalizedPhone || !phoneNumberE164) {
      apiError(400, "customer_sms_phone_missing", "This customer does not have a valid phone number for SMS.");
    }

    const smsResult = await this.sendSmsViaTelnyx({
      to: phoneNumberE164,
      message,
    });

    const sentAt = smsResult.ok ? new Date() : null;

    await this.insertMissedCallSmsLog({
      recentCallId: null,
      customerId: customer.id,
      phoneNumber,
      phoneNumberNormalized: normalizedPhone,
      provider: "telnyx",
      deliveryStatus: smsResult.ok ? "sent" : "failed_delivery",
      templateBody: null,
      renderedMessage: message,
      providerMessageId: smsResult.messageId,
      cooldownApplied: false,
      errorCode: smsResult.errorCode,
      errorMessage: smsResult.errorMessage,
      sentAt,
      direction: "outbound",
      readAt: new Date(),
    });

    return this.listCustomerTextThread(customer.id, organizationId);
  }

  async sendUnknownText(organizationId: string, phoneRaw: string, messageBody: string) {
    await this.ensureRecentCallsSchema();

    const trimmedPhone = phoneRaw.trim();
    const normalizedPhone = this.normalizePhone(trimmedPhone);
    const phoneNumberE164 = this.toE164Phone(trimmedPhone);
    const message = messageBody.trim();

    if (!trimmedPhone || !normalizedPhone || !phoneNumberE164) {
      apiError(400, "unknown_sms_phone_invalid", "A valid phone number is required to send a new TXT message.");
    }

    if (!message) {
      apiError(400, "unknown_sms_body_required", "Text message body is required.");
    }

    const smsResult = await this.sendSmsViaTelnyx({
      to: phoneNumberE164,
      message,
    });

    const sentAt = smsResult.ok ? new Date() : null;

    await this.insertMissedCallSmsLog({
      recentCallId: null,
      customerId: null,
      phoneNumber: trimmedPhone,
      phoneNumberNormalized: normalizedPhone,
      provider: "telnyx",
      deliveryStatus: smsResult.ok ? "sent" : "failed_delivery",
      templateBody: null,
      renderedMessage: message,
      providerMessageId: smsResult.messageId,
      cooldownApplied: false,
      errorCode: smsResult.errorCode,
      errorMessage: smsResult.errorMessage,
      sentAt,
      direction: "outbound",
      readAt: new Date(),
    });

    return this.listUnknownTextThread(organizationId, normalizedPhone);
  }

  async processTwilioMessageWebhook(payload: Record<string, unknown>) {
    await this.ensureRecentCallsSchema();

    const providerMessageId = this.asTrimmedString(payload.MessageSid) ?? this.asTrimmedString(payload.SmsSid);
    const fromNumber = this.asTrimmedString(payload.From);
    const body = this.asTrimmedString(payload.Body);
    const deliveryStatus = this.normalizeStatusToken(
      this.asTrimmedString(payload.SmsStatus) ?? this.asTrimmedString(payload.MessageStatus),
    ) ?? "received";

    if (!providerMessageId) {
      return {
        received: true,
        ignored: true,
        reason: "provider_message_id_missing",
      };
    }

    if (!fromNumber || !body) {
      return {
        received: true,
        ignored: true,
        reason: "message_payload_incomplete",
        providerMessageId,
      };
    }

    const duplicates = await this.dataSource.query(
      `
        SELECT id
        FROM recent_call_sms_logs
        WHERE provider = 'twilio'
          AND provider_message_id = ?
        LIMIT 1
      `,
      [providerMessageId],
    ) as Array<{ id: string }>;

    if (duplicates[0]?.id) {
      return {
        received: true,
        duplicate: true,
        messageId: duplicates[0].id,
      };
    }

    const phoneNumberNormalized = this.normalizePhone(fromNumber);
    const toNumber = this.asTrimmedString(payload.To);
    const smsOwnedNumber = toNumber
      ? await this.ownedPhoneNumbersService.findActiveSmsOwnedNumberByNormalized(toNumber)
      : null;
    const matchOrganizationId = smsOwnedNumber?.tenantId?.trim() ?? null;
    const matchedCustomer = await this.matchCustomerByPhone(phoneNumberNormalized, matchOrganizationId);

    await this.insertMissedCallSmsLog({
      recentCallId: null,
      customerId: matchedCustomer?.id ?? null,
      phoneNumber: fromNumber,
      phoneNumberNormalized,
      provider: "twilio",
      deliveryStatus,
      templateBody: null,
      renderedMessage: body,
      providerMessageId,
      cooldownApplied: false,
      errorCode: null,
      errorMessage: null,
      sentAt: null,
      direction: "inbound",
      readAt: null,
    });

    return {
      received: true,
      duplicate: false,
      providerMessageId,
      matchedClientId: matchedCustomer?.id ?? null,
    };
  }

  private async handleLifecycleEvent(
    payload: TelnyxEnvelope,
    rawBody: Buffer,
    eventType: string | null,
    providerEventId: string,
  ) {
    const eventPayload = isRecord(payload.data?.payload) ? payload.data.payload : {};
    const providerCallId = this.readFirstString(eventPayload, [
      ["call_control_id"],
      ["call_session_id"],
      ["call_leg_id"],
      ["call_id"],
      ["call", "call_control_id"],
      ["call", "call_session_id"],
    ]);

    if (!providerCallId) {
      return {
        received: true,
        ignored: true,
        reason: "lifecycle_call_id_missing",
        providerEventId,
      };
    }

    const recentCall = await this.recentCallsRepository.findOne({
      where: {
        provider: "telnyx",
        provider_call_id: providerCallId,
      },
    });

    if (!recentCall) {
      return {
        received: true,
        ignored: true,
        reason: "recent_call_not_found_for_lifecycle_event",
        providerCallId,
        providerEventId,
      };
    }

    const fromNumber = this.readFirstString(eventPayload, [
      ["from"],
      ["from_number"],
      ["ani"],
      ["caller_number"],
      ["from", "phone_number"],
      ["from", "e164"],
    ]);
    const toNumber = this.readFirstString(eventPayload, [
      ["to"],
      ["to_number"],
      ["dnis"],
      ["called_number"],
      ["to", "phone_number"],
      ["to", "e164"],
    ]);

    recentCall.from_number = recentCall.from_number ?? fromNumber;
    recentCall.from_number_normalized = recentCall.from_number_normalized ?? this.normalizePhone(recentCall.from_number);
    recentCall.to_number = recentCall.to_number ?? toNumber;
    recentCall.to_number_normalized = recentCall.to_number_normalized ?? this.normalizePhone(recentCall.to_number);

    if (
      recentCall.source === "unknown"
      || !recentCall.inbound_owned_phone_number_id
      || !recentCall.inbound_market_key
    ) {
      const sourceContext = await this.resolveRecentCallSource(recentCall.to_number);

      if (recentCall.source === "unknown") {
        recentCall.source = sourceContext.source;
      }

      recentCall.source_mapping_id = recentCall.source_mapping_id ?? sourceContext.sourceMappingId;
      recentCall.campaign_name = recentCall.campaign_name ?? sourceContext.campaignName;
      recentCall.inbound_owned_phone_number_id = recentCall.inbound_owned_phone_number_id ?? sourceContext.ownedPhoneNumberId;
      recentCall.inbound_owned_phone_number_label = recentCall.inbound_owned_phone_number_label ?? sourceContext.ownedPhoneNumberLabel;
      recentCall.inbound_market_key = recentCall.inbound_market_key ?? sourceContext.marketKey;
      recentCall.inbound_market_label = recentCall.inbound_market_label ?? sourceContext.marketLabel;
    }

    recentCall.duration_seconds = this.readFirstNumber(eventPayload, [
      ["duration_seconds"],
      ["duration_secs"],
      ["duration"],
      ["call", "duration_seconds"],
    ]) ?? recentCall.duration_seconds;
    recentCall.call_started_at = this.readFirstDate(eventPayload, [
      ["call_started_at"],
      ["started_at"],
      ["call", "started_at"],
    ]) ?? recentCall.call_started_at;
    recentCall.call_answered_at = this.readFirstDate(eventPayload, [
      ["call_answered_at"],
      ["answered_at"],
      ["call", "answered_at"],
    ]) ?? recentCall.call_answered_at;
    recentCall.call_ended_at = this.readFirstDate(eventPayload, [
      ["call_ended_at"],
      ["ended_at"],
      ["call", "ended_at"],
    ]) ?? recentCall.call_ended_at;
    recentCall.call_status = this.resolveLifecycleCallStatus(recentCall, eventPayload, eventType) ?? recentCall.call_status;
    recentCall.raw_payload_snapshot = rawBody.toString("utf8");

    const saved = await this.recentCallsRepository.save(recentCall);

    let missedCallSms = await this.getLatestMissedCallSmsLog(saved.id);

    if (!missedCallSms && this.isMissedCall(saved, eventPayload, eventType)) {
      missedCallSms = await this.maybeSendMissedCallSms(saved);
    }

    let callbackTask = null;
    if (this.isCallbackTaskEligibleStatus(saved.call_status)) {
      callbackTask = await this.callbackTaskService.maybeAutoCreateForRecentCall(saved);
    }

    return {
      received: true,
      duplicate: false,
      updated: true,
      eventType,
      recentCallId: saved.id,
      providerCallId,
      callStatus: saved.call_status,
      missedCallSmsStatus: missedCallSms?.deliveryStatus ?? null,
      callbackTaskStatus: callbackTask?.status ?? null,
    };
  }

  private async handleIvrInputEvent(
    payload: TelnyxEnvelope,
    rawBody: Buffer,
    eventType: string | null,
    providerEventId: string,
  ) {
    const eventPayload = isRecord(payload.data?.payload) ? payload.data.payload : {};
    const providerCallId = this.readFirstString(eventPayload, [
      ["call_control_id"],
      ["call_session_id"],
      ["call_leg_id"],
      ["call_id"],
      ["call", "call_control_id"],
      ["call", "call_session_id"],
    ]);

    if (!providerCallId) {
      return {
        received: true,
        ignored: true,
        reason: "ivr_call_id_missing",
        providerEventId,
      };
    }

    const recentCall = await this.recentCallsRepository.findOne({
      where: {
        provider: "telnyx",
        provider_call_id: providerCallId,
      },
    });

    if (!recentCall) {
      return {
        received: true,
        ignored: true,
        reason: "recent_call_not_found_for_ivr_event",
        providerCallId,
        providerEventId,
      };
    }

    const digit = this.readFirstString(eventPayload, [
      ["digit"],
      ["digits"],
      ["dtmf", "digit"],
      ["dtmf", "digits"],
      ["gathered_digits"],
      ["result", "digits"],
    ]);
    const settings = await this.callFlowSettingsService.getSettings();
    const selection = await this.telephonyExecutionService.handleIvrSelection(settings, {
      providerCallId: recentCall.provider_call_id,
      source: recentCall.source,
      businessHoursStatus: recentCall.business_hours_status,
      callFlowAction: recentCall.call_flow_action,
      callFlowRouteTarget: recentCall.call_flow_route_target,
      selectedServiceType: recentCall.selected_service_type,
      selectedIvrDigit: recentCall.selected_ivr_digit,
      callerNumber: recentCall.from_number,
    }, { digit });

    recentCall.selected_ivr_digit = selection.selectedIvrDigit;
    recentCall.selected_service_type = selection.selectedServiceType;
    recentCall.ivr_status = selection.ivrStatus;
    recentCall.route_execution_status = selection.routeExecutionStatus;
    recentCall.route_execution_detail = selection.routeExecutionDetail;
    recentCall.route_command_id = selection.routeCommandId;
    recentCall.whisper_text = selection.whisperText;
    recentCall.whisper_status = selection.whisperStatus;
    recentCall.whisper_command_id = selection.whisperCommandId;
    recentCall.call_flow_route_target = selection.callFlowRouteTarget;
    recentCall.voicemail_status = selection.voicemailStatus;
    recentCall.raw_payload_snapshot = rawBody.toString("utf8");

    const saved = await this.recentCallsRepository.save(recentCall);

    return {
      received: true,
      duplicate: false,
      updated: true,
      eventType,
      recentCallId: saved.id,
      providerCallId,
      selectedIvrDigit: saved.selected_ivr_digit,
      selectedServiceType: saved.selected_service_type,
      ivrStatus: saved.ivr_status,
      routeExecutionStatus: saved.route_execution_status,
    };
  }

  private async handleRecordingEvent(
    payload: TelnyxEnvelope,
    rawBody: Buffer,
    eventType: string | null,
    providerEventId: string,
  ) {
    const eventPayload = isRecord(payload.data?.payload) ? payload.data.payload : {};
    const providerCallId = this.readFirstString(eventPayload, [
      ["call_control_id"],
      ["call_session_id"],
      ["call_leg_id"],
      ["call_id"],
      ["recording", "call_control_id"],
      ["recording", "call_session_id"],
      ["payload", "call_control_id"],
      ["payload", "call_session_id"],
    ]);

    if (!providerCallId) {
      return {
        received: true,
        ignored: true,
        reason: "recording_call_id_missing",
        providerEventId,
      };
    }

    const recentCall = await this.recentCallsRepository.findOne({
      where: {
        provider: "telnyx",
        provider_call_id: providerCallId,
      },
    });

    if (!recentCall) {
      return {
        received: true,
        ignored: true,
        reason: "recent_call_not_found_for_recording",
        providerCallId,
        providerEventId,
      };
    }

    recentCall.provider_recording_id = this.readFirstString(eventPayload, [
      ["recording_id"],
      ["id"],
      ["recording", "id"],
      ["media", "id"],
    ]) ?? recentCall.provider_recording_id;
    recentCall.recording_url = this.readFirstString(eventPayload, [
      ["recording_url"],
      ["recording_urls", "mp3"],
      ["recording_urls", "wav"],
      ["urls", "mp3"],
      ["urls", "wav"],
      ["recording", "download_url"],
      ["recording", "url"],
      ["media", "url"],
    ]) ?? recentCall.recording_url;
    recentCall.recording_status = this.resolveRecordingStatus(eventPayload, eventType) ?? recentCall.recording_status;
    recentCall.duration_seconds = this.readFirstNumber(eventPayload, [
      ["duration_seconds"],
      ["duration_secs"],
      ["duration"],
      ["recording", "duration_seconds"],
      ["call", "duration_seconds"],
    ]) ?? recentCall.duration_seconds;
    recentCall.call_started_at = this.readFirstDate(eventPayload, [
      ["call_started_at"],
      ["started_at"],
      ["call", "started_at"],
      ["recording", "call_started_at"],
    ]) ?? recentCall.call_started_at;
    recentCall.call_answered_at = this.readFirstDate(eventPayload, [
      ["call_answered_at"],
      ["answered_at"],
      ["call", "answered_at"],
      ["recording", "call_answered_at"],
    ]) ?? recentCall.call_answered_at;
    recentCall.call_ended_at = this.readFirstDate(eventPayload, [
      ["call_ended_at"],
      ["ended_at"],
      ["call", "ended_at"],
      ["recording", "call_ended_at"],
    ]) ?? recentCall.call_ended_at;

    if (!recentCall.recording_status) {
      recentCall.recording_status = recentCall.recording_url ? "available" : "pending";
    }

    if (this.isVoicemailRecordingEvent(recentCall, eventPayload, eventType)) {
      recentCall.provider_voicemail_recording_id = recentCall.provider_recording_id;
      recentCall.voicemail_url = recentCall.recording_url;
      recentCall.voicemail_status = recentCall.recording_url ? "available" : (recentCall.voicemail_status ?? "recording_received");
      recentCall.call_status = "voicemail";
    }

    this.applyProviderAiHints(recentCall, eventPayload);

    recentCall.raw_payload_snapshot = rawBody.toString("utf8");

    const saved = await this.recentCallsRepository.save(recentCall);

    let callbackTaskStatus: string | null = null;
    if (saved.call_status === "voicemail") {
      const callbackTask = await this.callbackTaskService.maybeAutoCreateForRecentCall(saved);
      callbackTaskStatus = callbackTask?.status ?? null;
    }

    return {
      received: true,
      duplicate: false,
      updated: true,
      eventType,
      recentCallId: saved.id,
      providerCallId,
      recordingStatus: saved.recording_status,
      voicemailStatus: saved.voicemail_status,
      callbackTaskStatus,
    };
  }

  private async handleQueueEvent(
    payload: TelnyxEnvelope,
    rawBody: Buffer,
    eventType: string | null,
    providerEventId: string,
  ) {
    const eventPayload = isRecord(payload.data?.payload) ? payload.data.payload : {};
    const providerCallId = this.readFirstString(eventPayload, [
      ["call_control_id"],
      ["call_session_id"],
      ["call_leg_id"],
      ["call_id"],
      ["call", "call_control_id"],
      ["call", "call_session_id"],
    ]);

    if (!providerCallId) {
      return {
        received: true,
        ignored: true,
        reason: "queue_call_id_missing",
        providerEventId,
      };
    }

    const recentCall = await this.recentCallsRepository.findOne({
      where: {
        provider: "telnyx",
        provider_call_id: providerCallId,
      },
    });

    if (!recentCall) {
      return {
        received: true,
        ignored: true,
        reason: "recent_call_not_found_for_queue_event",
        providerCallId,
        providerEventId,
      };
    }

    const eventOccurredAt = this.asDate(payload.data?.occurred_at) ?? new Date();
    const queueStatus = this.resolveQueueStatus(eventPayload, eventType);
    const queuePosition = this.readFirstNumber(eventPayload, [
      ["queue_position"],
      ["queue", "position"],
      ["position"],
      ["queue", "place"],
    ]);
    const callbackRequested = this.readFirstBoolean(eventPayload, [
      ["queue_callback_requested"],
      ["queue", "callback_requested"],
      ["callback_requested"],
    ]);

    recentCall.queue_status = queueStatus ?? recentCall.queue_status ?? "queued";
    recentCall.queue_position = queuePosition ?? recentCall.queue_position;
    recentCall.queue_callback_requested = callbackRequested ?? recentCall.queue_callback_requested;

    if (this.isActiveQueueStatus(recentCall.queue_status)) {
      recentCall.queue_entered_at = recentCall.queue_entered_at ?? eventOccurredAt;
      recentCall.queue_exited_at = null;
    }

    if (this.isExitedQueueStatus(recentCall.queue_status)) {
      recentCall.queue_exited_at = recentCall.queue_exited_at ?? eventOccurredAt;
    }

    recentCall.queue_wait_seconds = this.computeQueueWaitSeconds(recentCall.queue_entered_at, recentCall.queue_exited_at ?? eventOccurredAt);
    recentCall.raw_payload_snapshot = rawBody.toString("utf8");

    const saved = await this.recentCallsRepository.save(recentCall);
    await this.insertRecentCallActivityEvent(saved.id, "recent_call_queue_updated", {
      queueStatus: saved.queue_status,
      queuePosition: saved.queue_position,
      queueEnteredAt: saved.queue_entered_at?.toISOString() ?? null,
      queueExitedAt: saved.queue_exited_at?.toISOString() ?? null,
      queueWaitSeconds: saved.queue_wait_seconds,
      queueCallbackRequested: saved.queue_callback_requested,
      providerEventId,
    });

    return {
      received: true,
      duplicate: false,
      updated: true,
      eventType,
      recentCallId: saved.id,
      providerCallId,
      queueStatus: saved.queue_status,
      queuePosition: saved.queue_position,
      queueCallbackRequested: saved.queue_callback_requested,
    };
  }

  private async ensureRecentCallsSchema() {
    if (this.recentCallsSchemaEnsured) {
      return;
    }

    await assertTablesExist(this.dataSource, [
      "recent_calls",
      "missed_call_sms_settings",
      "missed_call_sms_cooldowns",
      "recent_call_sms_logs",
      "recent_call_activity_events",
    ]);

    this.recentCallsSchemaEnsured = true;
  }

  private async ensureRecentCallsColumn(columnName: string, alterSql: string) {
    const rows = await this.dataSource.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'recent_calls'
          AND COLUMN_NAME = ?
        LIMIT 1
      `,
      [columnName],
    ) as Array<{ COLUMN_NAME?: string }>;

    if (rows.length > 0) {
      return;
    }

    await this.dataSource.query(alterSql);
  }

  private async ensureRecentCallsPrimaryKeyColumn() {
    const idColumnRows = await this.dataSource.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'recent_calls'
          AND COLUMN_NAME = 'id'
        LIMIT 1
      `,
    ) as Array<{ COLUMN_NAME?: string }>;

    if (idColumnRows.length === 0) {
      await this.dataSource.query("ALTER TABLE recent_calls ADD COLUMN id char(36) NULL FIRST");
    }

    await this.dataSource.query("UPDATE recent_calls SET id = UUID() WHERE id IS NULL OR id = ''");

    const primaryKeyRows = await this.dataSource.query(
      `
        SELECT CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'recent_calls'
          AND CONSTRAINT_TYPE = 'PRIMARY KEY'
        LIMIT 1
      `,
    ) as Array<{ CONSTRAINT_NAME?: string }>;

    if (primaryKeyRows.length === 0) {
      await this.dataSource.query("ALTER TABLE recent_calls MODIFY COLUMN id char(36) NOT NULL, ADD PRIMARY KEY (id)");
      return;
    }

    await this.dataSource.query("ALTER TABLE recent_calls MODIFY COLUMN id char(36) NOT NULL");
  }

  private async ensureRecentCallSmsLogsColumn(columnName: string, alterSql: string) {
    const rows = await this.dataSource.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'recent_call_sms_logs'
          AND COLUMN_NAME = ?
        LIMIT 1
      `,
      [columnName],
    ) as Array<{ COLUMN_NAME?: string }>;

    if (rows.length > 0) {
      return;
    }

    await this.dataSource.query(alterSql);
  }

  private async insertRecentCallActivityEvent(recentCallId: string, eventKey: string, metadata: Record<string, unknown>) {
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
      [randomUUID(), recentCallId, eventKey, JSON.stringify(metadata)],
    );
  }

  private verifySignature(rawBody: Buffer, signature: string | null, timestamp: string | null) {
    if (this.toBoolean(this.configService.get<string>("TELNYX_SKIP_SIGNATURE_VERIFICATION"))) {
      return;
    }

    const publicKey = this.configService.get<string>("TELNYX_PUBLIC_KEY")?.trim() ?? "";

    if (!publicKey) {
      apiError(500, "telnyx_public_key_missing", "TELNYX_PUBLIC_KEY is required to verify Telnyx webhooks.");
    }

    if (!signature || !timestamp) {
      apiError(400, "telnyx_signature_missing", "Telnyx signature and timestamp headers are required.");
    }

    const message = Buffer.from(`${timestamp}|${rawBody.toString("utf8")}`, "utf8");

    let signatureBuffer: Buffer | null = null;

    try {
      signatureBuffer = Buffer.from(signature, "base64");
      if (!signatureBuffer.length) {
        signatureBuffer = null;
      }
    } catch {
      signatureBuffer = null;
    }

    if (!signatureBuffer) {
      try {
        signatureBuffer = Buffer.from(signature, "hex");
      } catch {
        apiError(400, "telnyx_signature_invalid", "Telnyx signature header is malformed.");
      }
    }

    let keyObject;

    try {
      keyObject = createTelnyxPublicKey(publicKey);
    } catch {
      apiError(500, "telnyx_public_key_invalid", "TELNYX_PUBLIC_KEY could not be parsed.");
    }

    try {
      const verified = verify(null, message, keyObject, signatureBuffer);

      if (!verified) {
        apiError(401, "telnyx_signature_verification_failed", "Telnyx webhook signature verification failed.");
      }
    } catch {
      apiError(401, "telnyx_signature_verification_failed", "Telnyx webhook signature verification failed.");
    }
  }

  private parsePayload(rawBody: Buffer) {
    try {
      return JSON.parse(rawBody.toString("utf8")) as TelnyxEnvelope;
    } catch {
      apiError(400, "telnyx_payload_invalid", "The Telnyx payload must be valid JSON.");
    }
  }

  private async matchCustomerByPhone(normalizedPhone: string | null, organizationId: string | null) {
    if (!normalizedPhone) {
      return null;
    }

    const customers = await this.customersRepository.find({
      select: {
        id: true,
        full_name: true,
        phone: true,
        updated_at: true,
      },
      where: organizationId ? { organization_id: organizationId } : {},
      take: 5000,
      order: {
        updated_at: "DESC",
      },
    });

    const normalizedTarget = this.lastTenDigits(normalizedPhone);

    return customers.find((customer) => {
      const candidate = this.lastTenDigits(this.normalizePhone(customer.phone));
      return Boolean(candidate) && candidate === normalizedTarget;
    }) ?? null;
  }

  private async requireCustomerForTexting(customerId: string, organizationId: string) {
    const customer = await this.customersRepository.findOne({
      where: {
        id: customerId,
        organization_id: organizationId,
      },
    });

    if (!customer) {
      apiError(404, "customer_not_found", "The customer could not be found.");
    }

    return customer;
  }

  private async assertRecentCallInOrganization(recentCallId: string, organizationId: string) {
    const rows = await this.dataSource.query(
      `
        SELECT rc.id
        FROM recent_calls rc
        WHERE BINARY rc.id = BINARY ?
          AND ${recentCallBelongsToOrgSql("rc")}
        LIMIT 1
      `,
      [recentCallId, ...recentCallBelongsToOrgParams(organizationId)],
    ) as Array<{ id: string }>;

    if (!rows[0]?.id) {
      apiError(404, "recent_call_not_found", "The recent call could not be found.");
    }
  }

  private normalizePhone(value: string | null) {
    if (!value) {
      return null;
    }

    const digits = value.replace(/\D+/g, "");
    return digits || null;
  }

  private toE164Phone(value: string | null) {
    const normalized = this.normalizePhone(value);
    if (!normalized) {
      return null;
    }

    if (normalized.length === 10) {
      return `+1${normalized}`;
    }

    if (normalized.length >= 11 && normalized.length <= 15) {
      return `+${normalized}`;
    }

    return null;
  }

  private lastTenDigits(value: string | null) {
    if (!value) {
      return null;
    }

    return value.length > 10 ? value.slice(-10) : value;
  }

  private async resolveRecentCallSource(toNumber: string | null): Promise<ResolvedRecentCallSource> {
    const ownedPhoneNumber = toNumber
      ? await this.ownedPhoneNumbersService.findActiveVoiceOwnedNumberByNormalized(toNumber)
      : null;
    const sourceMap = parseDidSourceMapFromEnv(this.configService.get<string>("DISPATCHER_DID_SOURCE_MAP"));
    const resolved = resolveDidSourceMapping(toNumber, sourceMap);

    if (ownedPhoneNumber) {
      return {
        source: ownedPhoneNumber.defaultSource ?? (resolved.matched ? resolved.mapping.source : "unknown"),
        sourceMappingId: ownedPhoneNumber.sourceMappingId ?? (resolved.matched ? resolved.id : null),
        campaignName: ownedPhoneNumber.campaignName
          ?? ownedPhoneNumber.label
          ?? (resolved.matched ? resolved.mapping.campaignName ?? resolved.mapping.label ?? null : null),
        ownedPhoneNumberId: ownedPhoneNumber.id,
        ownedPhoneNumberLabel: ownedPhoneNumber.label,
        marketKey: ownedPhoneNumber.marketKey,
        marketLabel: ownedPhoneNumber.marketLabel,
        matched: true,
        matchOrganizationId: ownedPhoneNumber.tenantId?.trim() ?? null,
      };
    }

    if (!resolved.matched) {
      return {
        source: "unknown",
        sourceMappingId: null,
        campaignName: null,
        ownedPhoneNumberId: null,
        ownedPhoneNumberLabel: null,
        marketKey: null,
        marketLabel: null,
        matched: false,
        matchOrganizationId: null,
      };
    }

    return {
      source: resolved.mapping.source,
      sourceMappingId: resolved.id,
      campaignName: resolved.mapping.campaignName ?? resolved.mapping.label ?? null,
      ownedPhoneNumberId: null,
      ownedPhoneNumberLabel: null,
      marketKey: null,
      marketLabel: null,
      matched: true,
      matchOrganizationId: null,
    };
  }

  private formatCallSourceLabel(source: string | null) {
    if (!source) {
      return "Unknown";
    }

    switch (source) {
      case "google":
        return "Google";
      case "website":
        return "Website";
      case "repeat_customer":
        return "Repeat Customer";
      case "phone":
        return "Phone";
      case "referral":
        return "Referral";
      case "other":
        return "Other";
      case "unknown":
        return "Unknown";
      default:
        return source.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
    }
  }

  private asTrimmedString(value: unknown) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private asDate(value: unknown) {
    const text = this.asTrimmedString(value);
    if (!text) {
      return null;
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private readFirstString(payload: Record<string, unknown>, candidatePaths: string[][]) {
    for (const path of candidatePaths) {
      const value = this.readPath(payload, path);
      const text = this.asTrimmedString(value);

      if (text) {
        return text;
      }
    }

    return null;
  }

  private readFirstNumber(payload: Record<string, unknown>, candidatePaths: string[][]) {
    for (const path of candidatePaths) {
      const value = this.readPath(payload, path);
      const parsed = this.asNumber(value);

      if (parsed !== null) {
        return parsed;
      }
    }

    return null;
  }

  private readFirstDate(payload: Record<string, unknown>, candidatePaths: string[][]) {
    for (const path of candidatePaths) {
      const value = this.readPath(payload, path);
      const parsed = this.asDate(value);

      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private readFirstBoolean(payload: Record<string, unknown>, candidatePaths: string[][]) {
    for (const path of candidatePaths) {
      const value = this.readPath(payload, path);

      if (typeof value === "boolean") {
        return value;
      }

      if (typeof value === "number") {
        return value !== 0;
      }

      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["1", "true", "yes"].includes(normalized)) {
          return true;
        }
        if (["0", "false", "no"].includes(normalized)) {
          return false;
        }
      }
    }

    return null;
  }

  private readPath(payload: Record<string, unknown>, path: string[]) {
    let current: unknown = payload;

    for (const part of path) {
      if (!isRecord(current)) {
        return null;
      }

      current = current[part];
    }

    return current;
  }

  private asNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();

      if (!trimmed) {
        return null;
      }

      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private toSafeInteger(value: unknown) {
    const parsed = this.asNumber(value);
    if (parsed === null) {
      return 0;
    }

    return Math.max(0, Math.round(parsed));
  }

  private isRecordingEventType(eventType: string | null) {
    if (!eventType) {
      return false;
    }

    return eventType.startsWith("call.recording.") || eventType.startsWith("recording.");
  }

  private isLifecycleEventType(eventType: string | null) {
    return eventType === "call.answered" || eventType === "call.hangup" || eventType === "call.ended";
  }

  private isIvrInputEventType(eventType: string | null, payload: TelnyxEnvelope) {
    if (eventType === "call.dtmf.received" || eventType === "call.gather.ended" || eventType === "call.gather.partial_results") {
      return true;
    }

    const eventPayload = isRecord(payload.data?.payload) ? payload.data.payload : {};
    return Boolean(this.readFirstString(eventPayload, [["digit"], ["digits"], ["dtmf", "digit"], ["dtmf", "digits"], ["gathered_digits"]]));
  }

  private isQueueEventType(eventType: string | null, payload: TelnyxEnvelope) {
    const normalizedEventType = this.normalizeStatusToken(eventType);
    if (normalizedEventType?.includes("queue") || normalizedEventType?.includes("enqueue") || normalizedEventType?.includes("dequeue")) {
      return true;
    }

    const eventPayload = isRecord(payload.data?.payload) ? payload.data.payload : {};
    return Boolean(
      this.readFirstString(eventPayload, [["queue_status"], ["queue", "status"]])
      || this.readFirstNumber(eventPayload, [["queue_position"], ["queue", "position"]]) !== null,
    );
  }

  private isCallbackTaskEligibleStatus(status: string | null) {
    return status === "missed" || status === "abandoned" || status === "voicemail";
  }

  private isTerminalCallEventType(eventType: string | null) {
    return eventType === "call.hangup" || eventType === "call.ended";
  }

  private resolveLifecycleCallStatus(
    recentCall: RecentCallEntity,
    payload: Record<string, unknown>,
    eventType: string | null,
  ) {
    const explicitStatus = this.normalizeStatusToken(this.readFirstString(payload, [
      ["call_status"],
      ["status"],
      ["state"],
      ["result"],
      ["disposition"],
      ["hangup_cause"],
      ["call", "status"],
      ["call", "state"],
    ]));

    if (explicitStatus) {
      if (
        this.isTerminalCallEventType(eventType)
        && this.isMissedStatusToken(explicitStatus)
      ) {
        return "missed";
      }

      if (
        this.isTerminalCallEventType(eventType)
        && ["hangup", "ended", "completed"].includes(explicitStatus)
        && !recentCall.call_answered_at
        && (recentCall.duration_seconds ?? 0) <= 0
      ) {
        return "missed";
      }

      return explicitStatus;
    }

    if (eventType === "call.answered") {
      return "answered";
    }

    if (this.isTerminalCallEventType(eventType)) {
      return !recentCall.call_answered_at && (recentCall.duration_seconds ?? 0) <= 0 ? "missed" : "completed";
    }

    return null;
  }

  private resolveRecordingStatus(payload: Record<string, unknown>, eventType: string | null) {
    const explicitStatus = this.readFirstString(payload, [
      ["recording_status"],
      ["status"],
      ["recording", "status"],
      ["media", "status"],
    ]);

    if (explicitStatus) {
      return explicitStatus;
    }

    if (!eventType) {
      return null;
    }

    if (eventType.endsWith(".saved") || eventType.endsWith(".available") || eventType.endsWith(".completed")) {
      return "available";
    }

    return "pending";
  }

  private isVoicemailRecordingEvent(
    recentCall: RecentCallEntity,
    payload: Record<string, unknown>,
    eventType: string | null,
  ) {
    const recordingType = this.normalizeStatusToken(this.readFirstString(payload, [
      ["recording_type"],
      ["type"],
      ["recording", "type"],
      ["media", "type"],
    ]));

    if (recordingType === "voicemail") {
      return true;
    }

    if (recentCall.voicemail_status === "recording_requested" || recentCall.voicemail_status === "simulated") {
      return true;
    }

    return eventType === "call.recording.saved" && recentCall.call_flow_action === "voicemail";
  }

  private resolveQueueStatus(payload: Record<string, unknown>, eventType: string | null) {
    const explicitStatus = this.normalizeStatusToken(this.readFirstString(payload, [
      ["queue_status"],
      ["queue", "status"],
      ["status"],
      ["result"],
    ]));

    if (explicitStatus) {
      if (explicitStatus === "waiting" || explicitStatus === "in_queue") {
        return "queued";
      }

      return explicitStatus;
    }

    const normalizedEventType = this.normalizeStatusToken(eventType);
    if (!normalizedEventType) {
      return null;
    }

    if (normalizedEventType.includes("callback")) {
      return "callback_requested";
    }

    if (normalizedEventType.includes("bridge") || normalizedEventType.includes("answer")) {
      return "bridged";
    }

    if (normalizedEventType.includes("exit") || normalizedEventType.includes("leave") || normalizedEventType.includes("dequeue")) {
      return "exited";
    }

    if (normalizedEventType.includes("timeout")) {
      return "timeout";
    }

    if (normalizedEventType.includes("abandon")) {
      return "abandoned";
    }

    if (normalizedEventType.includes("queue") || normalizedEventType.includes("enqueue")) {
      return "queued";
    }

    return normalizedEventType;
  }

  private isActiveQueueStatus(status: string | null) {
    return status === "queued" || status === "waiting" || status === "in_queue";
  }

  private isExitedQueueStatus(status: string | null) {
    return status === "exited" || status === "bridged" || status === "timeout" || status === "abandoned" || status === "callback_requested";
  }

  private computeQueueWaitSeconds(enteredAt: Date | null, exitedAt: Date | null) {
    if (!enteredAt || !exitedAt) {
      return null;
    }

    const diff = exitedAt.getTime() - enteredAt.getTime();
    if (!Number.isFinite(diff) || diff < 0) {
      return null;
    }

    return Math.round(diff / 1000);
  }

  private applyProviderAiHints(recentCall: RecentCallEntity, payload: Record<string, unknown>) {
    const voicemailTranscription = this.readFirstString(payload, [
      ["transcription", "text"],
      ["transcription_text"],
      ["transcript"],
      ["recording", "transcription", "text"],
    ]);
    const aiSummary = this.readFirstString(payload, [
      ["summary"],
      ["recording", "summary"],
      ["analysis", "summary"],
    ]);
    const aiSentiment = this.normalizeStatusToken(this.readFirstString(payload, [
      ["sentiment"],
      ["analysis", "sentiment"],
      ["recording", "sentiment"],
    ]));
    const aiProvider = this.readFirstString(payload, [
      ["ai_provider"],
      ["provider"],
      ["analysis", "provider"],
    ]);
    const aiModel = this.readFirstString(payload, [
      ["ai_model"],
      ["model"],
      ["analysis", "model"],
    ]);

    if (!voicemailTranscription && !aiSummary && !aiSentiment && !aiProvider && !aiModel) {
      return;
    }

    recentCall.voicemail_transcription = voicemailTranscription ?? recentCall.voicemail_transcription;
    recentCall.ai_summary = aiSummary ?? recentCall.ai_summary;
    recentCall.ai_sentiment = aiSentiment ?? recentCall.ai_sentiment;
    recentCall.ai_provider = aiProvider ?? recentCall.ai_provider;
    recentCall.ai_model = aiModel ?? recentCall.ai_model;
    recentCall.ai_status = recentCall.ai_status ?? "provider_hint";
    recentCall.ai_enriched_at = recentCall.ai_enriched_at ?? new Date();
  }

  private async executeInitialCallFlow(recentCall: RecentCallEntity) {
    const settings = await this.callFlowSettingsService.getSettings();
    const execution = await this.telephonyExecutionService.runInitialFlow(settings, {
      providerCallId: recentCall.provider_call_id,
      source: recentCall.source,
      businessHoursStatus: recentCall.business_hours_status,
      callFlowAction: recentCall.call_flow_action,
      callFlowRouteTarget: recentCall.call_flow_route_target,
      selectedServiceType: recentCall.selected_service_type,
      selectedIvrDigit: recentCall.selected_ivr_digit,
      callerNumber: recentCall.from_number,
    });

    recentCall.ivr_status = execution.ivrStatus;
    recentCall.route_execution_status = execution.routeExecutionStatus;
    recentCall.route_execution_detail = execution.routeExecutionDetail;
    recentCall.route_command_id = execution.routeCommandId;
    recentCall.whisper_text = execution.whisperText;
    recentCall.whisper_status = execution.whisperStatus;
    recentCall.whisper_command_id = execution.whisperCommandId;
    recentCall.voicemail_status = execution.voicemailStatus;

    return true;
  }

  private async maybeSendMissedCallSms(recentCall: RecentCallEntity) {
    const settings = await this.getMissedCallSmsSettings();

    if (!settings.enabled) {
      return null;
    }

    const toNumber = recentCall.from_number?.trim() ?? "";
    const normalizedPhone = this.normalizePhone(toNumber);
    const toNumberE164 = this.toE164Phone(toNumber);

    if (!toNumber || !normalizedPhone || !toNumberE164) {
      return await this.insertMissedCallSmsLog({
        recentCallId: recentCall.id,
        customerId: recentCall.matched_client_id,
        phoneNumber: recentCall.from_number,
        phoneNumberNormalized: normalizedPhone,
        provider: "telnyx",
        deliveryStatus: "failed_missing_phone",
        templateBody: settings.template,
        renderedMessage: null,
        providerMessageId: null,
        cooldownApplied: false,
        errorCode: "sms_phone_missing",
        errorMessage: "The missed call does not have a callable caller number.",
        sentAt: null,
        direction: "outbound",
        readAt: new Date(),
      });
    }

    const cooldownRow = await this.getMissedCallSmsCooldown(normalizedPhone);
    const now = new Date();

    if (cooldownRow && cooldownRow.nextAllowedAt.getTime() > now.getTime()) {
      return await this.insertMissedCallSmsLog({
        recentCallId: recentCall.id,
        customerId: recentCall.matched_client_id,
        phoneNumber: toNumber,
        phoneNumberNormalized: normalizedPhone,
        provider: "telnyx",
        deliveryStatus: "skipped_cooldown",
        templateBody: settings.template,
        renderedMessage: this.renderMissedCallSmsTemplate(settings.template, recentCall),
        providerMessageId: null,
        cooldownApplied: true,
        errorCode: null,
        errorMessage: null,
        sentAt: null,
        direction: "outbound",
        readAt: new Date(),
      });
    }

    const message = this.renderMissedCallSmsTemplate(settings.template, recentCall);
    const smsResult = await this.sendSmsViaTelnyx({
      to: toNumberE164,
      message,
    });

    const sentAt = smsResult.ok ? now : null;
    const log = await this.insertMissedCallSmsLog({
      recentCallId: recentCall.id,
      customerId: recentCall.matched_client_id,
      phoneNumber: toNumber,
      phoneNumberNormalized: normalizedPhone,
      provider: "telnyx",
      deliveryStatus: smsResult.ok ? "sent" : "failed_delivery",
      templateBody: settings.template,
      renderedMessage: message,
      providerMessageId: smsResult.messageId,
      cooldownApplied: false,
      errorCode: smsResult.errorCode,
      errorMessage: smsResult.errorMessage,
      sentAt,
      direction: "outbound",
      readAt: new Date(),
    });

    if (smsResult.ok) {
      const nextAllowedAt = new Date(now.getTime() + settings.cooldownSeconds * 1000);
      await this.upsertMissedCallSmsCooldown({
        phoneNumberNormalized: normalizedPhone,
        nextAllowedAt,
        lastRecentCallId: recentCall.id,
        lastSmsLogId: log.providerMessageId ? null : null,
      });
    }

    return log;
  }

  private async sendSmsViaTelnyx(input: { to: string; message: string }) {
    const apiKey = (this.configService.get<string>("TELNYX_API_KEY") ?? "").trim();
    const fromNumber = (
      this.configService.get<string>("TELNYX_SMS_FROM_NUMBER")
      ?? this.configService.get<string>("TELNYX_OUTBOUND_FROM_NUMBER")
      ?? ""
    ).trim();

    if (!apiKey || !fromNumber) {
      return {
        ok: false,
        messageId: null,
        errorCode: "sms_delivery_not_configured",
        errorMessage: "SMS delivery is not configured for Telnyx.",
      };
    }

    const response = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: input.to,
        from: fromNumber,
        text: input.message,
      }),
    });

    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;

    const payloadErrors = payload?.errors;
    const detailFromArray = Array.isArray(payloadErrors)
      ? payloadErrors.find((item) => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).detail === "string") as Record<string, unknown> | undefined
      : undefined;
    const detailFromObject = (typeof payloadErrors === "object" && payloadErrors !== null)
      ? payloadErrors as Record<string, unknown>
      : null;
    const errorDetail = typeof detailFromArray?.detail === "string"
      ? detailFromArray.detail
      : typeof detailFromObject?.detail === "string"
        ? detailFromObject.detail
        : typeof payload?.message === "string"
          ? payload.message
          : null;

    if (!response.ok) {
      return {
        ok: false,
        messageId: null,
        errorCode: "sms_delivery_failed",
        errorMessage: errorDetail ?? "Telnyx SMS delivery failed.",
      };
    }

    const payloadData = (typeof payload?.data === "object" && payload.data !== null)
      ? payload.data as Record<string, unknown>
      : null;

    return {
      ok: true,
      messageId: typeof payloadData?.id === "string" ? payloadData.id : randomUUID(),
      errorCode: null,
      errorMessage: null,
    };
  }

  async sendSmsOnly(input: { to: string; message: string }) {
    return this.sendSmsViaTelnyx(input);
  }

  private async getMissedCallSmsCooldown(phoneNumberNormalized: string) {
    const rows = await this.dataSource.query(
      `
        SELECT next_allowed_at
        FROM missed_call_sms_cooldowns
        WHERE phone_number_normalized = ?
        LIMIT 1
      `,
      [phoneNumberNormalized],
    ) as Array<{ next_allowed_at: Date | string | null }>;

    const row = rows[0] ?? null;

    return row
      ? {
        nextAllowedAt: this.asDate(row.next_allowed_at) ?? new Date(0),
      }
      : null;
  }

  private async upsertMissedCallSmsCooldown(input: {
    phoneNumberNormalized: string;
    nextAllowedAt: Date;
    lastRecentCallId: string;
    lastSmsLogId: string | null;
  }) {
    await this.dataSource.query(
      `
        INSERT INTO missed_call_sms_cooldowns (
          phone_number_normalized,
          next_allowed_at,
          last_recent_call_id,
          last_sms_log_id
        ) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          next_allowed_at = VALUES(next_allowed_at),
          last_recent_call_id = VALUES(last_recent_call_id),
          last_sms_log_id = VALUES(last_sms_log_id)
      `,
      [input.phoneNumberNormalized, input.nextAllowedAt, input.lastRecentCallId, input.lastSmsLogId],
    );
  }

  private async insertMissedCallSmsLog(input: {
    recentCallId: string | null;
    customerId: string | null;
    phoneNumber: string | null;
    phoneNumberNormalized: string | null;
    provider: "twilio" | "telnyx";
    deliveryStatus: string;
    templateBody: string | null;
    renderedMessage: string | null;
    providerMessageId: string | null;
    cooldownApplied: boolean;
    errorCode: string | null;
    errorMessage: string | null;
    sentAt: Date | null;
    direction: "outbound" | "inbound";
    readAt: Date | null;
  }) {
    const id = randomUUID();
    const createdAt = new Date();

    await this.dataSource.query(
      `
        INSERT INTO recent_call_sms_logs (
          id,
          recent_call_id,
          customer_id,
          phone_number,
          phone_number_normalized,
          direction,
          provider,
          delivery_status,
          provider_message_id,
          template_body,
          rendered_message,
          cooldown_applied,
          error_code,
          error_message,
          sent_at,
          read_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        input.recentCallId,
        input.customerId,
        input.phoneNumber,
        input.phoneNumberNormalized,
        input.direction,
        input.provider,
        input.deliveryStatus,
        input.providerMessageId,
        input.templateBody,
        input.renderedMessage,
        input.cooldownApplied ? 1 : 0,
        input.errorCode,
        input.errorMessage,
        input.sentAt,
        input.readAt,
        createdAt,
        createdAt,
      ],
    );

    return {
      deliveryStatus: input.deliveryStatus,
      renderedMessage: input.renderedMessage,
      provider: input.provider,
      providerMessageId: input.providerMessageId,
      cooldownApplied: input.cooldownApplied,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      createdAt,
      sentAt: input.sentAt,
    } satisfies MissedCallSmsLogSummary;
  }

  private async getLatestMissedCallSmsLog(recentCallId: string) {
    const map = await this.loadLatestMissedCallSmsLogMap([recentCallId]);
    return map.get(recentCallId) ?? null;
  }

  private async loadLatestMissedCallSmsLogMap(recentCallIds: string[]) {
    const uniqueIds = [...new Set(recentCallIds.filter(Boolean))];
    const result = new Map<string, MissedCallSmsLogSummary>();

    if (!uniqueIds.length) {
      return result;
    }

    const placeholders = uniqueIds.map(() => "?").join(", ");
    const rows = await this.dataSource.query(
      `
        SELECT
          recent_call_id,
          delivery_status,
          provider,
          provider_message_id,
          rendered_message,
          cooldown_applied,
          error_code,
          error_message,
          created_at,
          sent_at
        FROM recent_call_sms_logs
        WHERE recent_call_id IN (${placeholders})
        ORDER BY created_at DESC
      `,
      uniqueIds,
    ) as Array<{
      recent_call_id: string;
      delivery_status: string;
      provider: string;
      provider_message_id: string | null;
      rendered_message: string | null;
      cooldown_applied: number | boolean | string;
      error_code: string | null;
      error_message: string | null;
      created_at: Date | string;
      sent_at: Date | string | null;
    }>;

    for (const row of rows) {
      if (result.has(row.recent_call_id)) {
        continue;
      }

      result.set(row.recent_call_id, {
        deliveryStatus: row.delivery_status,
        renderedMessage: row.rendered_message,
        provider: row.provider,
        providerMessageId: row.provider_message_id,
        cooldownApplied: this.toBoolean(row.cooldown_applied),
        errorCode: row.error_code,
        errorMessage: row.error_message,
        createdAt: this.asDate(row.created_at) ?? new Date(),
        sentAt: this.asDate(row.sent_at),
      });
    }

    return result;
  }

  private validateMissedCallSmsTemplate(template: string) {
    const trimmed = template.trim();

    if (!trimmed) {
      apiError(400, "missed_call_sms_template_required", "The missed-call SMS template is required.");
    }

    const invalidPlaceholders = [...trimmed.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)]
      .map((match) => match[1])
      .filter((placeholder) => !MISSED_CALL_SMS_PLACEHOLDERS.includes(placeholder as (typeof MISSED_CALL_SMS_PLACEHOLDERS)[number]));

    if (invalidPlaceholders.length) {
      apiError(
        400,
        "missed_call_sms_placeholder_invalid",
        `Unsupported missed-call SMS placeholders: ${[...new Set(invalidPlaceholders)].join(", ")}.`,
      );
    }

    return trimmed;
  }

  private renderMissedCallSmsTemplate(template: string, recentCall: RecentCallEntity) {
    const replacements: Record<(typeof MISSED_CALL_SMS_PLACEHOLDERS)[number], string> = {
      customer_name: recentCall.matched_client_display_name?.trim() || "there",
      caller_number: recentCall.from_number?.trim() || "unknown caller",
      called_number: recentCall.to_number?.trim() || "unknown line",
      recent_call_id: recentCall.id,
    };

    return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, placeholder: string) => {
      return replacements[placeholder as (typeof MISSED_CALL_SMS_PLACEHOLDERS)[number]] ?? "";
    });
  }

  private isMissedCall(recentCall: RecentCallEntity, payload: Record<string, unknown>, eventType: string | null) {
    if (!this.isTerminalCallEventType(eventType)) {
      return false;
    }

    const explicitStatus = this.normalizeStatusToken(this.readFirstString(payload, [
      ["call_status"],
      ["status"],
      ["state"],
      ["result"],
      ["disposition"],
      ["hangup_cause"],
      ["call", "status"],
      ["call", "state"],
    ]));

    if (explicitStatus && this.isMissedStatusToken(explicitStatus)) {
      return true;
    }

    return recentCall.call_status === "missed"
      || (!recentCall.call_answered_at && (recentCall.duration_seconds ?? 0) <= 0);
  }

  private isMissedStatusToken(status: string | null) {
    if (!status) {
      return false;
    }

    return ["missed", "no_answer", "unanswered", "busy", "timeout"].includes(status);
  }

  private normalizeStatusToken(value: string | null) {
    if (!value) {
      return null;
    }

    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  private isSmsProviderConfigured() {
    const apiKey = (this.configService.get<string>("TELNYX_API_KEY") ?? "").trim();
    const fromNumber = (
      this.configService.get<string>("TELNYX_SMS_FROM_NUMBER")
      ?? this.configService.get<string>("TELNYX_OUTBOUND_FROM_NUMBER")
      ?? ""
    ).trim();

    return Boolean(apiKey && fromNumber);
  }

  private toBoolean(value: unknown) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value !== 0;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "yes";
    }

    return false;
  }

  private toRelatedCallSummary(
    record: RecentCallEntity,
    callbackTasks: CallbackTaskSummary[],
    missedCallSms: MissedCallSmsLogSummary | null,
  ): RelatedCallSummary {
    return {
      id: record.id,
      fromNumber: record.from_number,
      toNumber: record.to_number,
      callStatus: record.call_status,
      processingStatus: record.processing_status,
      source: record.source,
      campaignName: record.campaign_name,
      businessHoursStatus: record.business_hours_status,
      callFlowAction: record.call_flow_action,
      callFlowRouteTarget: record.call_flow_route_target,
      selectedServiceType: record.selected_service_type,
      selectedIvrDigit: record.selected_ivr_digit,
      ivrStatus: record.ivr_status,
      routeExecutionStatus: record.route_execution_status,
      routeExecutionDetail: record.route_execution_detail,
      whisperText: record.whisper_text,
      whisperStatus: record.whisper_status,
      voicemailUrl: record.voicemail_url,
      voicemailStatus: record.voicemail_status,
      queueStatus: record.queue_status,
      queuePosition: record.queue_position,
      queueEnteredAt: record.queue_entered_at,
      queueExitedAt: record.queue_exited_at,
      queueWaitSeconds: record.queue_wait_seconds,
      queueCallbackRequested: record.queue_callback_requested,
      voicemailTranscription: record.voicemail_transcription,
      aiSummary: record.ai_summary,
      aiSentiment: record.ai_sentiment,
      aiStatus: record.ai_status,
      aiProvider: record.ai_provider,
      aiModel: record.ai_model,
      aiEnrichedAt: record.ai_enriched_at,
      matchedClientId: record.matched_client_id,
      matchedLeadId: record.matched_lead_id,
      matchedClientDisplayName: record.matched_client_display_name,
      recordingUrl: record.recording_url,
      providerRecordingId: record.provider_recording_id,
      recordingStatus: record.recording_status,
      durationSeconds: record.duration_seconds,
      callStartedAt: record.call_started_at,
      callAnsweredAt: record.call_answered_at,
      callEndedAt: record.call_ended_at,
      callbackTasks,
      missedCallSms,
      createdAt: record.created_at,
    };
  }
}
