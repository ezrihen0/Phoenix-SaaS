import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { verify } from "node:crypto";
import { Repository } from "typeorm";

import { apiError } from "../../common/api-response";
import { createTelnyxPublicKey } from "../../common/telnyx-signature";
import { CustomerEntity } from "../../database/entities/customer.entity";
import { OwnedPhoneNumbersService } from "../phone-numbers/owned-phone-numbers.service";
import { TxtConversationsService } from "./txt-conversations.service";
import { TxtMessagesService } from "./txt-messages.service";

type MessagingTxtConversation = {
  id: string;
  kind: "customer" | "unknown";
  customerId: string | null;
  customerName: string | null;
  phoneNumber: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

type MessagingTxtConversationsResponse = {
  unreadCount: number;
  items: MessagingTxtConversation[];
};

type MessagingTxtThreadItem = {
  id: string;
  customerId: string | null;
  direction: "inbound" | "outbound";
  phoneNumber: string | null;
  body: string;
  createdAt: string;
  sentAt: string | null;
  deliveryStatus: string;
  provider: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  unread: boolean;
};

type MessagingTxtThreadResponse = {
  unreadCount: number;
  items: MessagingTxtThreadItem[];
};

type MessagingTxtUnreadSummaryResponse = {
  unreadCount: number;
};

type MessagingConversationShortLinkPayload = {
  lane: "customers" | "unknown";
  customerId: string | null;
  phoneKey: string | null;
};

type MessagingConversationShortLinkResponse = {
  publicConversationCode: string;
  shortId: string;
  conversationId: string;
  lane: "customers" | "unknown";
  customerId: string | null;
  phoneKey: string | null;
};

type TelnyxTxtWebhookEnvelope = {
  data?: {
    id?: unknown;
    event_type?: unknown;
    occurred_at?: unknown;
    payload?: unknown;
  };
};

@Injectable()
export class TxtService {
  constructor(
    private readonly configService: ConfigService,
    private readonly ownedPhoneNumbersService: OwnedPhoneNumbersService,
    private readonly txtConversationsService: TxtConversationsService,
    private readonly txtMessagesService: TxtMessagesService,
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
  ) {}

  async listConversations(limitRaw?: number): Promise<MessagingTxtConversationsResponse> {
    const limit = this.clampLimit(limitRaw, 120, 500);

    const rows = await this.txtConversationsService.listRecentConversations(limit * 4);
    const grouped = new Map<string, MessagingTxtConversation>();

    for (const row of rows) {
      const kind = row.customerId ? "customer" as const : "unknown" as const;
      const id = row.customerId
        ? `customer:${row.customerId}`
        : `phone:${row.customerPhoneNumberNormalized || row.customerPhoneNumber}`;
      const candidate: MessagingTxtConversation = {
        id,
        kind,
        customerId: row.customerId,
        customerName: row.displayName,
        phoneNumber: row.customerPhoneNumber,
        lastMessage: row.lastMessagePreview ?? "(no messages yet)",
        lastMessageAt: (row.lastMessageAt ?? row.updatedAt).toISOString(),
        unreadCount: row.unreadCount,
      };

      const existing = grouped.get(id);

      if (!existing) {
        grouped.set(id, candidate);
        continue;
      }

      const existingTime = new Date(existing.lastMessageAt).getTime();
      const candidateTime = new Date(candidate.lastMessageAt).getTime();

      if (candidateTime > existingTime) {
        existing.lastMessage = candidate.lastMessage;
        existing.lastMessageAt = candidate.lastMessageAt;
        existing.phoneNumber = candidate.phoneNumber;
        existing.customerName = candidate.customerName;
      }

      existing.unreadCount += candidate.unreadCount;
    }

    const items = Array.from(grouped.values())
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, limit);

    return {
      unreadCount: items.reduce((sum, item) => sum + item.unreadCount, 0),
      items,
    };
  }

  async listConversationMessages(conversationId: string, limitRaw?: number): Promise<MessagingTxtThreadResponse> {
    const parsed = this.parseConversationId(conversationId);
    const limit = this.clampLimit(limitRaw, 200, 600);
    const conversations = await this.resolveConversationTargets(parsed);

    if (!conversations.length) {
      return {
        unreadCount: 0,
        items: [],
      };
    }

    const conversationIdSet = new Set(conversations.map((item) => item.id));
    const unreadCount = conversations.reduce((sum, item) => sum + item.unreadCount, 0);
    const messages = await this.txtMessagesService.listByConversationIds(
      Array.from(conversationIdSet),
      limit,
    );

    const items = messages.map((message) => {
      const conversation = conversations.find((item) => item.id === message.conversationId) ?? null;
      const contactPhone = message.direction === "inbound" ? message.fromNumber : message.toNumber;

      return {
        id: message.id,
        customerId: conversation?.customerId ?? null,
        direction: message.direction,
        phoneNumber: contactPhone || conversation?.customerPhoneNumber || null,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        sentAt: message.sentAt ? message.sentAt.toISOString() : null,
        deliveryStatus: message.providerStatus ?? message.status,
        provider: message.provider,
        providerMessageId: message.providerMessageId,
        errorMessage: message.errorMessage,
        unread: message.direction === "inbound" && !message.readAt,
      };
    });

    return {
      unreadCount,
      items,
    };
  }

  async createConversationShortLink(payload: MessagingConversationShortLinkPayload): Promise<MessagingConversationShortLinkResponse> {
    const conversation = await this.resolveShortLinkConversation(payload);
    return this.toConversationShortLink(conversation);
  }

  async resolveConversationShortLink(shortIdRaw: string): Promise<MessagingConversationShortLinkResponse> {
    const shortId = shortIdRaw.trim();

    if (!shortId) {
      apiError(400, "messaging_short_link_required", "A messaging short link id is required.");
    }

    const conversation = await this.txtConversationsService.getConversationByIdOrCode(shortId);
    return this.toConversationShortLink(conversation);
  }

  async sendMessage(payload: {
    conversationId: string;
    body: string;
    sentByUserId?: string | null;
    organizationIdForCustomerScope?: string | null;
    outboundRawPayloadExtras?: Record<string, unknown> | null;
  }): Promise<{ thread: MessagingTxtThreadResponse; outboundTxtMessageId: string }> {
    const parsed = this.parseConversationId(payload.conversationId);
    const messageBody = payload.body.trim();

    if (!messageBody) {
      apiError(400, "messaging_txt_body_required", "TXT message body is required.");
    }

    const ownedPhoneNumberRaw = (
      this.configService.get<string>("TELNYX_SMS_FROM_NUMBER")
      ?? this.configService.get<string>("TELNYX_OUTBOUND_FROM_NUMBER")
      ?? ""
    ).trim();
    const ownedPhoneNumberNormalized = this.ownedPhoneNumbersService.normalizePhone(ownedPhoneNumberRaw);

    if (!ownedPhoneNumberRaw || !ownedPhoneNumberNormalized) {
      apiError(500, "messaging_txt_owned_number_missing", "Outbound TXT number is not configured.");
    }

    const ownedNumber = await this.ownedPhoneNumbersService.upsertOwnedPhoneNumber({
      phoneNumber: ownedPhoneNumberRaw,
      provider: "telnyx",
      label: "Primary TXT Number",
      purpose: "both",
      smsEnabled: true,
      voiceEnabled: true,
      isActive: true,
    });

    const target = await this.resolveConversationTarget(parsed, payload.organizationIdForCustomerScope);
    const conversation = await this.txtConversationsService.findOrCreateConversation({
      customerId: target.customerId,
      customerPhoneNumber: target.phoneNumber,
      ownedPhoneNumberId: ownedNumber.id,
      ownedPhoneNumber: ownedNumber.phoneNumber,
      title: target.displayName,
      displayName: target.displayName,
    });

    const baseRawPayload = {
      source: "api/messaging/txt/send",
      legacyConversationId: payload.conversationId,
      sentByUserId: payload.sentByUserId ?? null,
      ...(payload.outboundRawPayloadExtras ?? {}),
    };

    const pendingMessage = await this.txtMessagesService.persistMessage({
      conversationId: conversation.id,
      direction: "outbound",
      sentByUserId: payload.sentByUserId ?? null,
      provider: "telnyx",
      providerMessageId: null,
      providerStatus: "queued",
      fromNumber: ownedNumber.phoneNumber,
      fromNumberNormalized: ownedNumber.phoneNumberNormalized,
      toNumber: target.phoneNumber,
      toNumberNormalized: target.phoneNumberNormalized,
      body: messageBody,
      status: "pending",
      rawPayload: baseRawPayload,
    });

    try {
      const smsResult = await this.sendSmsOnly({
        to: target.phoneNumberNormalized,
        message: messageBody,
      });
      const eventTime = new Date();
      const status = smsResult.ok ? "sent" : "failed";
      const providerStatus = smsResult.ok ? "sent" : "failed_delivery";

      await this.txtMessagesService.updateMessageDelivery({
        idOrProviderMessageId: pendingMessage.id,
        providerMessageId: smsResult.messageId,
        providerStatus,
        status,
        errorCode: smsResult.errorCode,
        errorMessage: smsResult.errorMessage,
        sentAt: smsResult.ok ? eventTime : null,
        rawPayload: {
          source: "telnyx-send-sms-only",
          ok: smsResult.ok,
        },
      });

      await this.txtConversationsService.applyConversationActivity({
        conversationId: conversation.id,
        body: messageBody,
        direction: "outbound",
        occurredAt: eventTime,
      });

      const thread = await this.listConversationMessages(payload.conversationId);
      return { thread, outboundTxtMessageId: pendingMessage.id };
    } catch (error) {
      await this.txtMessagesService.updateMessageDelivery({
        idOrProviderMessageId: pendingMessage.id,
        providerStatus: "failed_delivery",
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "TXT send failed.",
        rawPayload: {
          source: "api/messaging/txt/send",
          error: this.serializeUnknown(error),
        },
      });

      await this.txtConversationsService.applyConversationActivity({
        conversationId: conversation.id,
        body: messageBody,
        direction: "outbound",
        occurredAt: new Date(),
      });

      throw error;
    }
  }

  async markConversationRead(conversationId: string, limitRaw?: number): Promise<MessagingTxtThreadResponse> {
    const parsed = this.parseConversationId(conversationId);
    const conversations = await this.resolveConversationTargets(parsed);

    if (!conversations.length) {
      return {
        unreadCount: 0,
        items: [],
      };
    }

    const conversationIds = conversations.map((item) => item.id);
    await this.txtMessagesService.markInboundMessagesRead(conversationIds);
    await this.txtConversationsService.resetUnreadCount(conversationIds);

    return this.listConversationMessages(conversationId, limitRaw);
  }

  async markConversationUnread(conversationId: string, limitRaw?: number): Promise<MessagingTxtThreadResponse> {
    const parsed = this.parseConversationId(conversationId);
    const conversations = await this.resolveConversationTargets(parsed);

    if (!conversations.length) {
      return {
        unreadCount: 0,
        items: [],
      };
    }

    const conversationIds = conversations.map((item) => item.id);
    const latestInbound = await this.txtMessagesService.findLatestInboundMessage(conversationIds);

    if (!latestInbound) {
      return this.listConversationMessages(conversationId, limitRaw);
    }

    await this.txtMessagesService.markInboundMessagesRead(conversationIds);
    await this.txtConversationsService.resetUnreadCount(conversationIds);
    await this.txtMessagesService.markMessageUnread(latestInbound.id);
    await this.txtConversationsService.setUnreadCount(latestInbound.conversationId, 1);

    return this.listConversationMessages(conversationId, limitRaw);
  }

  async getUnreadSummary(): Promise<MessagingTxtUnreadSummaryResponse> {
    return {
      unreadCount: await this.txtConversationsService.getTotalUnreadCount(),
    };
  }

  async processTelnyxTxtWebhook(rawBody: Buffer, signature: string | null, timestamp: string | null) {
    this.verifyTelnyxSignature(rawBody, signature, timestamp);

    const envelope = this.parseTelnyxPayload(rawBody);
    const eventPayload = this.asRecord(envelope.data?.payload);
    const eventType = this.asTrimmedString(envelope.data?.event_type)?.toLowerCase() ?? null;

    if (eventType && !eventType.includes("message")) {
      return {
        received: true,
        ignored: true,
        reason: "unsupported_event_type",
        eventType,
      };
    }

    const providerMessageId = this.readFirstString(eventPayload, [
      ["id"],
      ["record_id"],
      ["message_id"],
      ["data", "id"],
      ["payload", "id"],
    ]) ?? this.asTrimmedString(envelope.data?.id);

    if (!providerMessageId) {
      return {
        received: true,
        ignored: true,
        reason: "provider_message_id_missing",
      };
    }

    const existingInbound = await this.findTxtMessageByProviderMessageId(providerMessageId);

    if (existingInbound) {
      return {
        received: true,
        duplicate: true,
        reason: "provider_message_id_duplicate",
        txtMessageId: existingInbound.id,
        conversationId: existingInbound.conversationId,
      };
    }

    const fromNumber = this.readFirstString(eventPayload, [
      ["from", "phone_number"],
      ["from", "e164"],
      ["from", "number"],
      ["from"],
    ]);
    const toNumber = this.readFirstString(eventPayload, [
      ["to", "0", "phone_number"],
      ["to", "0", "e164"],
      ["to", "phone_number"],
      ["to", "e164"],
      ["to"],
    ]);
    const messageBody = this.readFirstString(eventPayload, [
      ["text"],
      ["body"],
      ["message"],
      ["content", "text"],
    ]);

    if (!fromNumber || !toNumber || !messageBody) {
      return {
        received: true,
        ignored: true,
        reason: "message_payload_incomplete",
        providerMessageId,
      };
    }

    const fromNumberNormalized = this.ownedPhoneNumbersService.normalizePhone(fromNumber);
    const toNumberNormalized = this.ownedPhoneNumbersService.normalizePhone(toNumber);

    if (!fromNumberNormalized || !toNumberNormalized) {
      return {
        received: true,
        ignored: true,
        reason: "message_phone_invalid",
        providerMessageId,
      };
    }

    const ownedPhoneNumber = await this.ownedPhoneNumbersService.findActiveSmsOwnedNumberByNormalized(toNumberNormalized);

    if (!ownedPhoneNumber) {
      return {
        received: true,
        ignored: true,
        reason: "owned_number_not_found",
        providerMessageId,
        toNumber: toNumberNormalized,
      };
    }

    const matchedCustomer = await this.matchCustomerByPhoneNormalized(fromNumberNormalized);
    const conversation = await this.txtConversationsService.findOrCreateConversation({
      customerId: matchedCustomer?.id ?? null,
      customerPhoneNumber: fromNumber,
      ownedPhoneNumberId: ownedPhoneNumber.id,
      ownedPhoneNumber: ownedPhoneNumber.phoneNumber,
      title: matchedCustomer?.full_name ?? matchedCustomer?.company_name ?? null,
      displayName: matchedCustomer?.full_name ?? matchedCustomer?.company_name ?? null,
    });

    const occurredAt = this.asDate(envelope.data?.occurred_at) ?? new Date();

    const savedMessage = await this.txtMessagesService.persistMessage({
      conversationId: conversation.id,
      direction: "inbound",
      provider: "telnyx",
      providerMessageId,
      providerStatus: "received",
      fromNumber,
      fromNumberNormalized,
      toNumber,
      toNumberNormalized,
      body: messageBody,
      status: "received",
      receivedAt: occurredAt,
      rawPayload: envelope,
    });

    await this.txtConversationsService.applyConversationActivity({
      conversationId: conversation.id,
      body: messageBody,
      direction: "inbound",
      occurredAt,
    });

    return {
      received: true,
      duplicate: false,
      providerMessageId,
      txtMessageId: savedMessage.id,
      conversationId: conversation.id,
      customerId: matchedCustomer?.id ?? null,
    };
  }

  private parseConversationId(value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
      apiError(400, "messaging_txt_conversation_required", "A TXT conversation id is required.");
    }

    if (trimmed.startsWith("customer:")) {
      const customerId = trimmed.slice("customer:".length).trim();

      if (!customerId) {
        apiError(400, "messaging_txt_customer_required", "A valid customer conversation id is required.");
      }

      return {
        kind: "customer" as const,
        value: customerId,
      };
    }

    if (trimmed.startsWith("phone:")) {
      const phoneKey = trimmed.slice("phone:".length).trim();

      if (!phoneKey) {
        apiError(400, "messaging_txt_phone_required", "A valid unknown-number conversation id is required.");
      }

      return {
        kind: "unknown" as const,
        value: phoneKey,
      };
    }

    apiError(400, "messaging_txt_conversation_invalid", "Conversation id must start with customer: or phone:.");
  }

  private async resolveConversationTarget(
    parsed: { kind: "customer" | "unknown"; value: string },
    organizationIdForCustomerScope?: string | null,
  ) {
    if (parsed.kind === "customer") {
      const orgScope = organizationIdForCustomerScope?.trim();

      if (!orgScope) {
        apiError(400, "messaging_txt_organization_scope_missing", "An active organization is required for customer TXT send.");
      }

      const customer = await this.customersRepository.findOne({
        where: {
          id: parsed.value,
          organization_id: orgScope,
        },
      });

      if (!customer) {
        apiError(404, "messaging_txt_customer_not_found", "Customer conversation target was not found.");
      }

      const phoneNumber = (customer.phone ?? "").trim();
      const phoneNumberNormalized = this.ownedPhoneNumbersService.normalizePhone(phoneNumber);

      if (!phoneNumber || !phoneNumberNormalized) {
        apiError(400, "messaging_txt_customer_phone_invalid", "Customer must have a valid phone number for TXT.");
      }

      return {
        customerId: customer.id,
        phoneNumber,
        phoneNumberNormalized,
        displayName: customer.full_name?.trim() || customer.company_name?.trim() || null,
      };
    }

    const phoneNumber = parsed.value.trim();
    const phoneNumberNormalized = this.ownedPhoneNumbersService.normalizePhone(phoneNumber);

    if (!phoneNumber || !phoneNumberNormalized) {
      apiError(400, "messaging_txt_unknown_phone_invalid", "Unknown-number conversation target is invalid.");
    }

    return {
      customerId: null,
      phoneNumber,
      phoneNumberNormalized,
      displayName: null,
    };
  }

  private async resolveConversationTargets(parsed: { kind: "customer" | "unknown"; value: string }) {
    if (parsed.kind === "customer") {
      return this.txtConversationsService.listActiveByCustomerId(parsed.value);
    }

    const normalized = this.ownedPhoneNumbersService.normalizePhone(parsed.value) ?? parsed.value.trim();
    return this.txtConversationsService.listActiveUnknownByPhoneNormalized(normalized);
  }

  private async resolveShortLinkConversation(payload: MessagingConversationShortLinkPayload) {
    if (payload.lane === "customers") {
      if (!payload.customerId?.trim()) {
        apiError(400, "messaging_short_link_customer_required", "A customer conversation target is required.");
      }

      const conversations = await this.txtConversationsService.listActiveByCustomerId(payload.customerId);

      if (!conversations[0]) {
        apiError(404, "messaging_short_link_not_found", "No active TXT conversation was found for this customer.");
      }

      return conversations[0];
    }

    if (!payload.phoneKey?.trim()) {
      apiError(400, "messaging_short_link_phone_required", "A phone conversation target is required.");
    }

    const normalizedPhone = this.ownedPhoneNumbersService.normalizePhone(payload.phoneKey) ?? payload.phoneKey.trim();
    const conversations = await this.txtConversationsService.listActiveUnknownByPhoneNormalized(normalizedPhone);

    if (!conversations[0]) {
      apiError(404, "messaging_short_link_not_found", "No active TXT conversation was found for this phone number.");
    }

    return conversations[0];
  }

  private toConversationShortLink(conversation: Awaited<ReturnType<TxtConversationsService["getConversationByIdOrCode"]>>): MessagingConversationShortLinkResponse {
    const phoneKey = conversation.customerId
      ? null
      : conversation.customerPhoneNumberNormalized || conversation.customerPhoneNumber;

    return {
      publicConversationCode: conversation.publicConversationCode,
      shortId: conversation.publicConversationCode,
      conversationId: conversation.id,
      lane: conversation.customerId ? "customers" : "unknown",
      customerId: conversation.customerId,
      phoneKey,
    };
  }

  private clampLimit(limitRaw: number | undefined, fallback: number, max: number) {
    const parsed = Number(limitRaw);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.min(Math.floor(parsed), max);
  }

  private asTrimmedString(value: unknown) {
    return typeof value === "string" ? value.trim() : null;
  }

  private asDate(value: unknown) {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value !== "string") {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private asRecord(value: unknown) {
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  }

  private parseTelnyxPayload(rawBody: Buffer) {
    try {
      return JSON.parse(rawBody.toString("utf8")) as TelnyxTxtWebhookEnvelope;
    } catch {
      apiError(400, "telnyx_payload_invalid", "The Telnyx payload must be valid JSON.");
    }
  }

  private verifyTelnyxSignature(rawBody: Buffer, signature: string | null, timestamp: string | null) {
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

  private readFirstString(source: Record<string, unknown>, paths: string[][]) {
    for (const path of paths) {
      const value = this.readPath(source, path);

      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private readPath(source: Record<string, unknown>, path: string[]) {
    let current: unknown = source;

    for (const segment of path) {
      if (Array.isArray(current)) {
        const index = Number(segment);

        if (!Number.isInteger(index) || index < 0 || index >= current.length) {
          return undefined;
        }

        current = current[index];
        continue;
      }

      if (typeof current !== "object" || current === null) {
        return undefined;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private async findTxtMessageByProviderMessageId(providerMessageId: string) {
    const rows = await this.txtMessagesService.findByProviderMessageId(providerMessageId);
    return rows;
  }

  private async matchCustomerByPhoneNormalized(phoneNormalized: string) {
    const customers = await this.customersRepository.find({
      select: {
        id: true,
        full_name: true,
        company_name: true,
        phone: true,
        updated_at: true,
      },
      take: 5000,
      order: {
        updated_at: "DESC",
      },
    });

    const target = this.lastTenDigits(phoneNormalized);

    return customers.find((customer) => {
      const candidate = this.lastTenDigits(this.ownedPhoneNumbersService.normalizePhone(customer.phone));
      return Boolean(candidate) && candidate === target;
    }) ?? null;
  }

  private lastTenDigits(value: string | null) {
    if (!value) {
      return null;
    }

    const digits = value.replace(/\D/g, "");
    return digits.length >= 10 ? digits.slice(-10) : null;
  }

  private serializeUnknown(value: unknown) {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    if (typeof value === "string") {
      return value;
    }

    return null;
  }

  private async sendSmsOnly(input: { to: string; message: string }) {
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
    const payloadData = typeof payload?.data === "object" && payload.data !== null
      ? payload.data as Record<string, unknown>
      : null;
    const payloadErrors = payload?.errors;
    const firstError = Array.isArray(payloadErrors)
      ? payloadErrors.find((item) => typeof item === "object" && item !== null) as Record<string, unknown> | undefined
      : undefined;
    const errorDetail = typeof firstError?.detail === "string"
      ? firstError.detail
      : typeof payload?.message === "string"
        ? payload.message
        : "Telnyx SMS delivery failed.";

    if (!response.ok) {
      return {
        ok: false,
        messageId: null,
        errorCode: "sms_delivery_failed",
        errorMessage: errorDetail,
      };
    }

    return {
      ok: true,
      messageId: typeof payloadData?.id === "string" ? payloadData.id : null,
      errorCode: null,
      errorMessage: null,
    };
  }
}
