import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { DataSource } from "typeorm";

import { apiError } from "../../common/api-response";

type PersistTxtMessageInput = {
  conversationId: string;
  direction: "inbound" | "outbound";
  sentByUserId?: string | null;
  provider?: "telnyx";
  providerMessageId?: string | null;
  providerStatus?: string | null;
  fromNumber: string;
  fromNumberNormalized: string;
  toNumber: string;
  toNumberNormalized: string;
  body: string;
  status: "pending" | "sent" | "delivered" | "failed" | "received";
  errorCode?: string | null;
  errorMessage?: string | null;
  sentAt?: Date | null;
  receivedAt?: Date | null;
  deliveredAt?: Date | null;
  readAt?: Date | null;
  rawPayload?: unknown;
};

type TxtMessageRecord = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  sentByUserId: string | null;
  provider: "telnyx";
  providerMessageId: string | null;
  providerStatus: string | null;
  fromNumber: string;
  fromNumberNormalized: string;
  toNumber: string;
  toNumberNormalized: string;
  body: string;
  status: "pending" | "sent" | "delivered" | "failed" | "received";
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: Date | null;
  receivedAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  rawPayload: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type TxtMessageReadStateRecord = Pick<TxtMessageRecord, "id" | "conversationId" | "readAt" | "createdAt">;

@Injectable()
export class TxtMessagesService {
  private schemaEnsured = false;

  constructor(private readonly dataSource: DataSource) {}

  async findByProviderMessageId(providerMessageIdRaw: string) {
    await this.ensureSchema();

    const providerMessageId = providerMessageIdRaw.trim();

    if (!providerMessageId) {
      return null;
    }

    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          conversation_id,
          direction,
          sent_by_user_id,
          provider,
          provider_message_id,
          provider_status,
          from_number,
          from_number_normalized,
          to_number,
          to_number_normalized,
          body,
          status,
          error_code,
          error_message,
          sent_at,
          received_at,
          delivered_at,
          read_at,
          raw_payload,
          created_at,
          updated_at
        FROM txt_messages
        WHERE provider_message_id = ?
        LIMIT 1
      `,
      [providerMessageId],
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      return null;
    }

    return this.toMessage(rows[0]);
  }

  async listByConversationIds(conversationIds: string[], limitRaw: number) {
    await this.ensureSchema();

    if (!conversationIds.length) {
      return [] as TxtMessageRecord[];
    }

    const limit = Math.max(1, Math.floor(limitRaw));
    const placeholders = conversationIds.map(() => "?").join(", ");
    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          conversation_id,
          direction,
          sent_by_user_id,
          provider,
          provider_message_id,
          provider_status,
          from_number,
          from_number_normalized,
          to_number,
          to_number_normalized,
          body,
          status,
          error_code,
          error_message,
          sent_at,
          received_at,
          delivered_at,
          read_at,
          raw_payload,
          created_at,
          updated_at
        FROM txt_messages
        WHERE conversation_id IN (${placeholders})
        ORDER BY created_at DESC
        LIMIT ?
      `,
      [...conversationIds, limit],
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => this.toMessage(row));
  }

  async markInboundMessagesRead(conversationIds: string[]) {
    await this.ensureSchema();

    if (!conversationIds.length) {
      return;
    }

    const placeholders = conversationIds.map(() => "?").join(", ");

    await this.dataSource.query(
      `
        UPDATE txt_messages
        SET
          read_at = COALESCE(read_at, CURRENT_TIMESTAMP(6)),
          updated_at = CURRENT_TIMESTAMP(6)
        WHERE conversation_id IN (${placeholders})
          AND direction = 'inbound'
          AND read_at IS NULL
      `,
      conversationIds,
    );
  }

  async findLatestInboundMessage(conversationIds: string[]) {
    await this.ensureSchema();

    if (!conversationIds.length) {
      return null as TxtMessageReadStateRecord | null;
    }

    const placeholders = conversationIds.map(() => "?").join(", ");
    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          conversation_id,
          read_at,
          created_at
        FROM txt_messages
        WHERE conversation_id IN (${placeholders})
          AND direction = 'inbound'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      conversationIds,
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      return null;
    }

    return {
      id: String(rows[0].id),
      conversationId: String(rows[0].conversation_id),
      readAt: this.asDate(rows[0].read_at),
      createdAt: this.asDate(rows[0].created_at) ?? new Date(),
    };
  }

  async markMessageUnread(messageIdRaw: string) {
    await this.ensureSchema();

    const messageId = messageIdRaw.trim();

    if (!messageId) {
      return;
    }

    await this.dataSource.query(
      `
        UPDATE txt_messages
        SET
          read_at = NULL,
          updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ?
          AND direction = 'inbound'
      `,
      [messageId],
    );
  }

  async persistMessage(input: PersistTxtMessageInput): Promise<TxtMessageRecord> {
    await this.ensureSchema();

    const id = randomUUID();
    const provider = input.provider ?? "telnyx";
    const providerMessageId = this.asTrimmedString(input.providerMessageId);

    if (!input.conversationId.trim()) {
      apiError(400, "txt_message_conversation_required", "Conversation id is required for TXT message persistence.");
    }

    if (!input.body.trim()) {
      apiError(400, "txt_message_body_required", "TXT message body is required.");
    }

    await this.dataSource.query(
      `
        INSERT INTO txt_messages (
          id,
          conversation_id,
          direction,
          sent_by_user_id,
          provider,
          provider_message_id,
          provider_status,
          from_number,
          from_number_normalized,
          to_number,
          to_number_normalized,
          body,
          status,
          error_code,
          error_message,
          sent_at,
          received_at,
          delivered_at,
          read_at,
          raw_payload,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
      `,
      [
        id,
        input.conversationId,
        input.direction,
        this.asTrimmedString(input.sentByUserId),
        provider,
        providerMessageId,
        this.asTrimmedString(input.providerStatus),
        input.fromNumber,
        input.fromNumberNormalized,
        input.toNumber,
        input.toNumberNormalized,
        input.body,
        input.status,
        this.asTrimmedString(input.errorCode),
        this.asTrimmedString(input.errorMessage),
        input.sentAt ?? null,
        input.receivedAt ?? null,
        input.deliveredAt ?? null,
        input.readAt ?? null,
        this.stringifyPayload(input.rawPayload),
      ],
    );

    return this.getMessageById(id);
  }

  async updateMessageDelivery(input: {
    idOrProviderMessageId: string;
    providerMessageId?: string | null;
    providerStatus?: string | null;
    status?: "pending" | "sent" | "delivered" | "failed" | "received";
    errorCode?: string | null;
    errorMessage?: string | null;
    sentAt?: Date | null;
    receivedAt?: Date | null;
    deliveredAt?: Date | null;
    readAt?: Date | null;
    rawPayload?: unknown;
  }) {
    await this.ensureSchema();

    const key = input.idOrProviderMessageId.trim();

    if (!key) {
      apiError(400, "txt_message_update_key_required", "TXT message update key is required.");
    }

    await this.dataSource.query(
      `
        UPDATE txt_messages
        SET
          provider_message_id = COALESCE(?, provider_message_id),
          provider_status = COALESCE(?, provider_status),
          status = COALESCE(?, status),
          error_code = COALESCE(?, error_code),
          error_message = COALESCE(?, error_message),
          sent_at = COALESCE(?, sent_at),
          received_at = COALESCE(?, received_at),
          delivered_at = COALESCE(?, delivered_at),
          read_at = COALESCE(?, read_at),
          raw_payload = COALESCE(?, raw_payload),
          updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ? OR provider_message_id = ?
      `,
      [
        this.asTrimmedString(input.providerMessageId),
        this.asTrimmedString(input.providerStatus),
        input.status ?? null,
        this.asTrimmedString(input.errorCode),
        this.asTrimmedString(input.errorMessage),
        input.sentAt ?? null,
        input.receivedAt ?? null,
        input.deliveredAt ?? null,
        input.readAt ?? null,
        this.stringifyPayload(input.rawPayload),
        key,
        key,
      ],
    );
  }

  private async getMessageById(id: string): Promise<TxtMessageRecord> {
    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          conversation_id,
          direction,
          sent_by_user_id,
          provider,
          provider_message_id,
          provider_status,
          from_number,
          from_number_normalized,
          to_number,
          to_number_normalized,
          body,
          status,
          error_code,
          error_message,
          sent_at,
          received_at,
          delivered_at,
          read_at,
          raw_payload,
          created_at,
          updated_at
        FROM txt_messages
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      apiError(404, "txt_message_not_found", "TXT message was not found.");
    }

    return this.toMessage(rows[0]);
  }

  private toMessage(row: Record<string, unknown>): TxtMessageRecord {
    return {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      direction: this.asDirection(row.direction),
      sentByUserId: this.asTrimmedString(row.sent_by_user_id),
      provider: "telnyx",
      providerMessageId: this.asTrimmedString(row.provider_message_id),
      providerStatus: this.asTrimmedString(row.provider_status),
      fromNumber: String(row.from_number ?? ""),
      fromNumberNormalized: String(row.from_number_normalized ?? ""),
      toNumber: String(row.to_number ?? ""),
      toNumberNormalized: String(row.to_number_normalized ?? ""),
      body: String(row.body ?? ""),
      status: this.asStatus(row.status),
      errorCode: this.asTrimmedString(row.error_code),
      errorMessage: this.asTrimmedString(row.error_message),
      sentAt: this.asDate(row.sent_at),
      receivedAt: this.asDate(row.received_at),
      deliveredAt: this.asDate(row.delivered_at),
      readAt: this.asDate(row.read_at),
      rawPayload: this.asTrimmedString(row.raw_payload),
      createdAt: this.asDate(row.created_at) ?? new Date(),
      updatedAt: this.asDate(row.updated_at) ?? new Date(),
    };
  }

  private asDirection(value: unknown): "inbound" | "outbound" {
    const raw = this.asTrimmedString(value)?.toLowerCase();

    if (raw === "inbound" || raw === "outbound") {
      return raw;
    }

    return "outbound";
  }

  private asStatus(value: unknown): "pending" | "sent" | "delivered" | "failed" | "received" {
    const raw = this.asTrimmedString(value)?.toLowerCase();

    if (raw === "pending" || raw === "sent" || raw === "delivered" || raw === "failed" || raw === "received") {
      return raw;
    }

    return "pending";
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

  private asTrimmedString(value: unknown) {
    return typeof value === "string" ? value.trim() : null;
  }

  private stringifyPayload(value: unknown) {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  private async ensureSchema() {
    if (this.schemaEnsured) {
      return;
    }

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS txt_messages (
        id char(36) NOT NULL,
        conversation_id char(36) NOT NULL,
        direction varchar(16) NOT NULL,
        sent_by_user_id char(36) NULL,
        provider varchar(32) NOT NULL DEFAULT 'telnyx',
        provider_message_id varchar(255) NULL,
        provider_status varchar(64) NULL,
        from_number varchar(64) NOT NULL,
        from_number_normalized varchar(32) NOT NULL,
        to_number varchar(64) NOT NULL,
        to_number_normalized varchar(32) NOT NULL,
        body longtext NOT NULL,
        status varchar(16) NOT NULL,
        error_code varchar(128) NULL,
        error_message longtext NULL,
        sent_at datetime(6) NULL,
        received_at datetime(6) NULL,
        delivered_at datetime(6) NULL,
        read_at datetime(6) NULL,
        raw_payload longtext NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY ux_txt_messages_provider_message (provider_message_id),
        KEY ix_txt_messages_conversation (conversation_id),
        KEY ix_txt_messages_conversation_created_at (conversation_id, created_at),
        KEY ix_txt_messages_created_at (created_at),
        KEY ix_txt_messages_read_at (read_at),
        KEY ix_txt_messages_status (status),
        KEY ix_txt_messages_sent_by_user (sent_by_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await this.ensureColumn(
      "sent_by_user_id",
      "ALTER TABLE txt_messages ADD COLUMN sent_by_user_id char(36) NULL AFTER direction",
    );
    await this.ensureIndex(
      "ix_txt_messages_conversation_created_at",
      "ALTER TABLE txt_messages ADD KEY ix_txt_messages_conversation_created_at (conversation_id, created_at)",
    );
    await this.ensureIndex(
      "ix_txt_messages_sent_by_user",
      "ALTER TABLE txt_messages ADD KEY ix_txt_messages_sent_by_user (sent_by_user_id)",
    );

    this.schemaEnsured = true;
  }

  private async ensureColumn(columnName: string, ddl: string) {
    const rows = await this.dataSource.query(
      `
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'txt_messages'
          AND COLUMN_NAME = ?
        LIMIT 1
      `,
      [columnName],
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      await this.dataSource.query(ddl);
    }
  }

  private async ensureIndex(indexName: string, ddl: string) {
    const rows = await this.dataSource.query(
      `
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'txt_messages'
          AND INDEX_NAME = ?
        LIMIT 1
      `,
      [indexName],
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      await this.dataSource.query(ddl);
    }
  }
}
