import { randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { RecentCallEntity } from "../database/entities/recent-call.entity";
import { assertTablesExist } from "../database/schema-readiness";
import { tryDecodeTelnyxAiClientStateV1 } from "./telnyx-ai-client-state";
import { VoiceIntakePostCallService } from "./voice-intake-post-call.service";

type TelnyxConversationEnvelope = {
  data?: {
    id?: unknown;
    event_type?: unknown;
    occurred_at?: unknown;
    payload?: unknown;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDuplicateMysqlKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const e = error as { code?: string; errno?: number };
  return e.code === "ER_DUP_ENTRY" || e.errno === 1062;
}

@Injectable()
export class TelnyxConversationIngestService {
  private readonly logger = new Logger(TelnyxConversationIngestService.name);
  private schemaEnsured = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly voiceIntakePostCall: VoiceIntakePostCallService,
    @InjectRepository(RecentCallEntity)
    private readonly recentCallsRepository: Repository<RecentCallEntity>,
  ) {}

  async handleConversationEvent(
    payload: TelnyxConversationEnvelope,
    rawBody: Buffer,
    eventType: string | null,
    providerEventId: string,
  ) {
    await this.ensureSchema();

    const claimed = await this.tryClaimProviderEvent(providerEventId, eventType ?? "unknown");
    if (!claimed) {
      return {
        received: true,
        duplicate: true,
        providerEventId,
        eventType,
      };
    }

    const eventPayload = isRecord(payload.data?.payload) ? payload.data.payload : {};
    const occurredAt = this.asDate(payload.data?.occurred_at);

    const callControlId = this.readCallControlId(eventPayload);
    const conversationId = this.readConversationId(eventPayload);
    const assistantId = this.readAssistantId(eventPayload);
    const clientStateRaw = this.readFirstString(eventPayload, [
      ["client_state"],
      ["call", "client_state"],
      ["conversation", "client_state"],
    ]);
    const clientStateRecentCallId = tryDecodeTelnyxAiClientStateV1(clientStateRaw);

    const recentCall = await this.resolveRecentCallForConversation({
      callControlId,
      conversationId,
      clientStateRecentCallId,
    });

    if (!recentCall) {
      return {
        received: true,
        ignored: true,
        reason: "recent_call_not_found_for_conversation_event",
        providerEventId,
        callControlId,
        conversationId,
      };
    }

    if (conversationId) {
      recentCall.telnyx_conversation_id = recentCall.telnyx_conversation_id ?? conversationId;
    }
    if (assistantId) {
      recentCall.telnyx_ai_assistant_id = recentCall.telnyx_ai_assistant_id ?? assistantId;
    }

    if (eventType === "call.conversation_insights.generated" || eventType === "call.conversation.insights.generated") {
      const summary = this.readInsightsSummary(eventPayload);
      const sentiment = this.readFirstString(eventPayload, [
        ["sentiment"],
        ["insights", "sentiment"],
        ["analysis", "sentiment"],
      ]);
      const model = this.readFirstString(eventPayload, [["model"], ["insights", "model"], ["llm_model"]]);

      if (summary) {
        recentCall.ai_summary = this.pickBetterText(recentCall.ai_summary, summary);
      }
      if (sentiment) {
        recentCall.ai_sentiment = recentCall.ai_sentiment ?? sentiment;
      }
      if (model) {
        recentCall.ai_model = recentCall.ai_model ?? model;
      }
      recentCall.ai_provider = recentCall.ai_provider ?? "telnyx_ai_assistant";
      recentCall.ai_status = "conversation_insights_received";
      recentCall.ai_enriched_at = new Date();
    }

    if (eventType === "call.conversation.ended") {
      const messages = this.readConversationMessages(eventPayload);
      const mergedMessages = this.mergeMessagesJson(recentCall.ai_conversation_messages_json, messages);
      if (mergedMessages) {
        recentCall.ai_conversation_messages_json = mergedMessages;
      }

      const durationSeconds = this.readFirstNumber(eventPayload, [
        ["duration_seconds"],
        ["duration_secs"],
        ["duration"],
        ["call", "duration_seconds"],
      ]);
      if (durationSeconds !== null) {
        recentCall.duration_seconds = recentCall.duration_seconds ?? durationSeconds;
      }

      const endedAt = this.readFirstDate(eventPayload, [
        ["ended_at"],
        ["call_ended_at"],
        ["call", "ended_at"],
      ]);
      if (endedAt) {
        recentCall.call_ended_at = recentCall.call_ended_at ?? endedAt;
      }

      const model = this.readFirstString(eventPayload, [["model"], ["assistant", "model"]]);
      if (model) {
        recentCall.ai_model = recentCall.ai_model ?? model;
      }

      recentCall.ai_provider = recentCall.ai_provider ?? "telnyx_ai_assistant";
      recentCall.ai_status = "conversation_ended";
      recentCall.ai_enriched_at = new Date();
    }

    const saved = await this.recentCallsRepository.save(recentCall);

    try {
      await this.voiceIntakePostCall.maybeFinalizeFromTelnyxEvent(saved.id, eventType ?? null);
    } catch (finalizeError) {
      this.logger.warn(
        `voice_intake_finalize_failed recentCallId=${saved.id}: ${
          finalizeError instanceof Error ? finalizeError.message : String(finalizeError)
        }`,
      );
    }

    await this.insertRecentCallActivity(saved.id, eventType ?? "unknown", providerEventId, occurredAt, {
      callControlId,
      conversationId: saved.telnyx_conversation_id,
      aiSummaryPresent: Boolean(saved.ai_summary),
      messagesPresent: Boolean(saved.ai_conversation_messages_json),
    });

    return {
      received: true,
      duplicate: false,
      updated: true,
      eventType,
      recentCallId: saved.id,
      providerEventId,
      conversationId: saved.telnyx_conversation_id,
    };
  }

  private async resolveRecentCallForConversation(input: {
    callControlId: string | null;
    conversationId: string | null;
    clientStateRecentCallId: string | null;
  }): Promise<RecentCallEntity | null> {
    if (input.callControlId) {
      const byCall = await this.recentCallsRepository.findOne({
        where: { provider: "telnyx", provider_call_id: input.callControlId },
      });
      if (byCall) {
        return byCall;
      }
    }

    if (input.clientStateRecentCallId) {
      const byId = await this.recentCallsRepository.findOne({
        where: { id: input.clientStateRecentCallId },
      });
      if (byId && byId.provider === "telnyx") {
        return byId;
      }
    }

    if (input.conversationId) {
      const byConversation = await this.recentCallsRepository.findOne({
        where: { provider: "telnyx", telnyx_conversation_id: input.conversationId },
      });
      if (byConversation) {
        return byConversation;
      }
    }

    return null;
  }

  private async tryClaimProviderEvent(providerEventId: string, eventType: string): Promise<boolean> {
    try {
      await this.dataSource.query(
        `
          INSERT INTO telnyx_webhook_event_receipts (id, provider, provider_event_id, event_type, recent_call_id, created_at)
          VALUES (?, 'telnyx', ?, ?, NULL, CURRENT_TIMESTAMP(6))
        `,
        [randomUUID(), providerEventId, eventType],
      );
      return true;
    } catch (error) {
      if (isDuplicateMysqlKeyError(error)) {
        return false;
      }
      throw error;
    }
  }

  private readCallControlId(eventPayload: Record<string, unknown>): string | null {
    return (
      this.readFirstString(eventPayload, [
        ["call_control_id"],
        ["call_session_id"],
        ["call_leg_id"],
        ["call_id"],
        ["call", "call_control_id"],
        ["call", "call_session_id"],
      ]) ?? null
    );
  }

  private readConversationId(eventPayload: Record<string, unknown>): string | null {
    return (
      this.readFirstString(eventPayload, [
        ["conversation_id"],
        ["conversation", "id"],
        ["call", "conversation_id"],
      ]) ?? null
    );
  }

  private readAssistantId(eventPayload: Record<string, unknown>): string | null {
    return (
      this.readFirstString(eventPayload, [
        ["assistant_id"],
        ["assistant", "id"],
        ["call", "assistant_id"],
      ]) ?? null
    );
  }

  private readInsightsSummary(eventPayload: Record<string, unknown>): string | null {
    const direct = this.readFirstString(eventPayload, [
      ["summary"],
      ["insights", "summary"],
      ["analysis", "summary"],
      ["result", "summary"],
    ]);
    if (direct) {
      return direct;
    }

    const insights = eventPayload["insights"];
    if (isRecord(insights) && typeof insights["summary"] === "string") {
      return insights["summary"] as string;
    }

    return null;
  }

  private readConversationMessages(eventPayload: Record<string, unknown>): unknown {
    const messages = eventPayload["messages"];
    if (Array.isArray(messages)) {
      return messages;
    }
    const call = eventPayload["call"];
    if (isRecord(call) && Array.isArray(call["messages"])) {
      return call["messages"];
    }
    const conversation = eventPayload["conversation"];
    if (isRecord(conversation) && Array.isArray(conversation["messages"])) {
      return conversation["messages"];
    }
    return [];
  }

  private mergeMessagesJson(previousJson: string | null, incoming: unknown): string | null {
    try {
      const incomingStr = JSON.stringify(incoming ?? []);
      if (!previousJson) {
        return incomingStr;
      }
      return incomingStr.length >= previousJson.length ? incomingStr : previousJson;
    } catch {
      return previousJson;
    }
  }

  private pickBetterText(existing: string | null | undefined, incoming: string | null | undefined): string | null {
    const next = incoming?.trim() ?? "";
    const prev = existing?.trim() ?? "";
    if (!next) {
      return prev || null;
    }
    if (!prev) {
      return incoming ?? null;
    }
    return next.length >= prev.length ? incoming! : existing!;
  }

  private readFirstString(
    source: Record<string, unknown>,
    paths: Array<Array<string>>,
  ): string | null {
    for (const path of paths) {
      let cursor: unknown = source;
      let ok = true;
      for (const key of path) {
        if (!isRecord(cursor)) {
          ok = false;
          break;
        }
        cursor = cursor[key];
      }
      if (!ok) {
        continue;
      }
      if (typeof cursor === "string" && cursor.trim()) {
        return cursor.trim();
      }
    }
    return null;
  }

  private readFirstNumber(source: Record<string, unknown>, paths: Array<Array<string>>): number | null {
    for (const path of paths) {
      let cursor: unknown = source;
      for (const key of path) {
        if (!isRecord(cursor)) {
          cursor = null;
          break;
        }
        cursor = cursor[key];
      }
      if (typeof cursor === "number" && Number.isFinite(cursor)) {
        return cursor;
      }
      if (typeof cursor === "string" && cursor.trim()) {
        const parsed = Number(cursor);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  }

  private readFirstDate(source: Record<string, unknown>, paths: Array<Array<string>>): Date | null {
    for (const path of paths) {
      let cursor: unknown = source;
      for (const key of path) {
        if (!isRecord(cursor)) {
          cursor = null;
          break;
        }
        cursor = cursor[key];
      }
      const asDate = this.asDate(cursor);
      if (asDate) {
        return asDate;
      }
    }
    return null;
  }

  private asDate(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return null;
  }

  private async insertRecentCallActivity(
    recentCallId: string,
    eventType: string,
    providerEventId: string,
    occurredAt: Date | null,
    detail: Record<string, unknown>,
  ) {
    const metadata = {
      eventType,
      providerEventId,
      occurredAt: occurredAt?.toISOString() ?? null,
      ...detail,
    };
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
      [randomUUID(), recentCallId, `telnyx_conversation:${eventType}`, JSON.stringify(metadata)],
    );
  }

  private async ensureSchema() {
    if (this.schemaEnsured) {
      return;
    }
    await assertTablesExist(this.dataSource, ["recent_calls", "recent_call_activity_events", "telnyx_webhook_event_receipts"]);
    this.schemaEnsured = true;
  }
}
