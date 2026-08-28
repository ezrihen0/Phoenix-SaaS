import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { DataSource } from "typeorm";

import { apiError } from "../../common/api-response";
import { assertTablesExist } from "../../database/schema-readiness";
import { OwnedPhoneNumbersService } from "../phone-numbers/owned-phone-numbers.service";

type FindOrCreateTxtConversationInput = {
  organizationId: string;
  customerId?: string | null;
  customerPhoneNumber: string;
  ownedPhoneNumberId: string;
  ownedPhoneNumber: string;
  title?: string | null;
  displayName?: string | null;
};

type TxtConversationRecord = {
  id: string;
  organizationId: string | null;
  publicConversationCode: string;
  customerId: string | null;
  customerPhoneNumber: string;
  customerPhoneNumberNormalized: string;
  ownedPhoneNumberId: string;
  ownedPhoneNumber: string;
  ownedPhoneNumberNormalized: string;
  title: string | null;
  displayName: string | null;
  lastMessagePreview: string | null;
  lastMessageDirection: "inbound" | "outbound" | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TxtConversationListRow = TxtConversationRecord;

@Injectable()
export class TxtConversationsService {
  private schemaEnsured = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly ownedPhoneNumbersService: OwnedPhoneNumbersService,
  ) {}

  async findOrCreateConversation(input: FindOrCreateTxtConversationInput): Promise<TxtConversationRecord> {
    await this.ensureSchema();

    const organizationId = input.organizationId.trim();
    if (!organizationId) {
      apiError(400, "txt_conversation_organization_required", "Organization scope is required for TXT conversations.");
    }

    const customerPhoneNumber = input.customerPhoneNumber.trim();
    const customerPhoneNumberNormalized = this.ownedPhoneNumbersService.normalizePhone(customerPhoneNumber);

    if (!customerPhoneNumberNormalized) {
      apiError(400, "txt_conversation_customer_phone_invalid", "Customer phone number is required for TXT conversation routing.");
    }

    const ownedPhoneNumberNormalized = this.ownedPhoneNumbersService.normalizePhone(input.ownedPhoneNumber);

    if (!ownedPhoneNumberNormalized) {
      apiError(400, "txt_conversation_owned_phone_invalid", "Owned phone number is required for TXT conversation routing.");
    }

    const existing = await this.dataSource.query(
      `
        SELECT id
        FROM txt_conversations
        WHERE organization_id = ?
          AND owned_phone_number_normalized = ?
          AND customer_phone_number_normalized = ?
          AND is_archived = 0
        LIMIT 1
      `,
      [organizationId, ownedPhoneNumberNormalized, customerPhoneNumberNormalized],
    ) as Array<{ id: string }>;

    if (existing[0]?.id) {
      return this.getConversationById(existing[0].id, organizationId);
    }

    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const id = randomUUID();
      const publicConversationCode = this.generatePublicConversationCode();

      try {
        await this.dataSource.query(
          `
            INSERT INTO txt_conversations (
              id,
              organization_id,
              public_conversation_code,
              customer_id,
              customer_phone_number,
              customer_phone_number_normalized,
              owned_phone_number_id,
              owned_phone_number,
              owned_phone_number_normalized,
              title,
              display_name,
              last_message_preview,
              last_message_direction,
              last_message_at,
              unread_count,
              is_archived,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, 0, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
          `,
          [
            id,
            organizationId,
            publicConversationCode,
            this.asTrimmedString(input.customerId),
            customerPhoneNumber,
            customerPhoneNumberNormalized,
            input.ownedPhoneNumberId,
            input.ownedPhoneNumber,
            ownedPhoneNumberNormalized,
            this.asTrimmedString(input.title),
            this.asTrimmedString(input.displayName),
          ],
        );

        return this.getConversationById(id, organizationId);
      } catch {
        // Retry when code collides or insertion races on unique keys.
      }
    }

    apiError(500, "txt_conversation_create_failed", "Unable to create TXT conversation right now.");
  }

  async listRecentConversations(organizationIdRaw: string, limit: number): Promise<TxtConversationListRow[]> {
    await this.ensureSchema();
    const organizationId = organizationIdRaw.trim();

    const rows = await this.dataSource.query(
      `
        SELECT
          c.id,
          c.organization_id,
          c.public_conversation_code,
          c.customer_id,
          c.customer_phone_number,
          c.customer_phone_number_normalized,
          c.owned_phone_number_id,
          c.owned_phone_number,
          c.owned_phone_number_normalized,
          c.title,
          c.display_name,
          c.last_message_preview,
          c.last_message_direction,
          c.last_message_at,
          c.unread_count,
          c.is_archived,
          c.created_at,
          c.updated_at,
          customer.full_name AS customer_full_name,
          customer.company_name AS customer_company_name
        FROM txt_conversations c
        LEFT JOIN customers customer
          ON BINARY customer.id = BINARY c.customer_id
          AND customer.organization_id = c.organization_id
        WHERE c.organization_id = ?
          AND c.is_archived = 0
        ORDER BY COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC
        LIMIT ?
      `,
      [organizationId, Math.max(1, Math.floor(limit))],
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const conversation = this.toConversation(row);
      const displayName = this.asTrimmedString(row.customer_full_name)
        || this.asTrimmedString(row.customer_company_name)
        || conversation.displayName;

      return {
        ...conversation,
        displayName,
      };
    });
  }

  async listActiveByCustomerId(organizationIdRaw: string, customerIdRaw: string) {
    await this.ensureSchema();

    const organizationId = organizationIdRaw.trim();
    const customerId = customerIdRaw.trim();

    if (!customerId) {
      return [] as TxtConversationRecord[];
    }

    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          organization_id,
          public_conversation_code,
          customer_id,
          customer_phone_number,
          customer_phone_number_normalized,
          owned_phone_number_id,
          owned_phone_number,
          owned_phone_number_normalized,
          title,
          display_name,
          last_message_preview,
          last_message_direction,
          last_message_at,
          unread_count,
          is_archived,
          created_at,
          updated_at
        FROM txt_conversations
        WHERE organization_id = ?
          AND customer_id = ?
          AND is_archived = 0
        ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC
      `,
      [organizationId, customerId],
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => this.toConversation(row));
  }

  async listActiveUnknownByPhoneNormalized(organizationIdRaw: string, phoneNormalizedRaw: string) {
    await this.ensureSchema();

    const organizationId = organizationIdRaw.trim();
    const phoneNormalized = phoneNormalizedRaw.trim();

    if (!phoneNormalized) {
      return [] as TxtConversationRecord[];
    }

    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          organization_id,
          public_conversation_code,
          customer_id,
          customer_phone_number,
          customer_phone_number_normalized,
          owned_phone_number_id,
          owned_phone_number,
          owned_phone_number_normalized,
          title,
          display_name,
          last_message_preview,
          last_message_direction,
          last_message_at,
          unread_count,
          is_archived,
          created_at,
          updated_at
        FROM txt_conversations
        WHERE organization_id = ?
          AND customer_id IS NULL
          AND customer_phone_number_normalized = ?
          AND is_archived = 0
        ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC
      `,
      [organizationId, phoneNormalized],
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => this.toConversation(row));
  }

  async resetUnreadCount(organizationIdRaw: string, conversationIds: string[]) {
    await this.ensureSchema();

    if (!conversationIds.length) {
      return;
    }

    const organizationId = organizationIdRaw.trim();
    const placeholders = conversationIds.map(() => "?").join(", ");

    await this.dataSource.query(
      `
        UPDATE txt_conversations
        SET
          unread_count = 0,
          updated_at = CURRENT_TIMESTAMP(6)
        WHERE id IN (${placeholders})
          AND organization_id = ?
      `,
      [...conversationIds, organizationId],
    );
  }

  async setUnreadCount(organizationIdRaw: string, conversationIdRaw: string, unreadCountRaw: number) {
    await this.ensureSchema();

    const organizationId = organizationIdRaw.trim();
    const conversationId = conversationIdRaw.trim();

    if (!conversationId) {
      return;
    }

    const unreadCount = Math.max(0, Math.floor(unreadCountRaw));

    await this.dataSource.query(
      `
        UPDATE txt_conversations
        SET
          unread_count = ?,
          updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ?
          AND organization_id = ?
      `,
      [unreadCount, conversationId, organizationId],
    );
  }

  async getTotalUnreadCount(organizationIdRaw: string) {
    await this.ensureSchema();
    const organizationId = organizationIdRaw.trim();

    const rows = await this.dataSource.query(
      `
        SELECT COALESCE(SUM(unread_count), 0) AS unread_count
        FROM txt_conversations
        WHERE organization_id = ?
          AND is_archived = 0
      `,
      [organizationId],
    ) as Array<Record<string, unknown>>;

    return Number(rows[0]?.unread_count ?? 0);
  }

  async getConversationByIdOrCode(organizationIdRaw: string, idOrCodeRaw: string): Promise<TxtConversationRecord> {
    await this.ensureSchema();

    const organizationId = organizationIdRaw.trim();
    const value = idOrCodeRaw.trim();

    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          organization_id,
          public_conversation_code,
          customer_id,
          customer_phone_number,
          customer_phone_number_normalized,
          owned_phone_number_id,
          owned_phone_number,
          owned_phone_number_normalized,
          title,
          display_name,
          last_message_preview,
          last_message_direction,
          last_message_at,
          unread_count,
          is_archived,
          created_at,
          updated_at
        FROM txt_conversations
        WHERE organization_id = ?
          AND (id = ? OR public_conversation_code = ?)
        LIMIT 1
      `,
      [organizationId, value, value.toUpperCase()],
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      apiError(404, "txt_conversation_not_found", "TXT conversation was not found.");
    }

    return this.toConversation(rows[0]);
  }

  async applyConversationActivity(input: {
    organizationId: string;
    conversationId: string;
    body: string;
    direction: "inbound" | "outbound";
    occurredAt?: Date | null;
    resetUnread?: boolean;
  }) {
    await this.ensureSchema();

    const organizationId = input.organizationId.trim();
    const preview = this.previewMessage(input.body);
    const occurredAt = input.occurredAt ?? new Date();

    if (input.resetUnread) {
      await this.dataSource.query(
        `
          UPDATE txt_conversations
          SET
            last_message_preview = ?,
            last_message_direction = ?,
            last_message_at = ?,
            unread_count = 0,
            updated_at = CURRENT_TIMESTAMP(6)
          WHERE id = ?
            AND organization_id = ?
        `,
        [preview, input.direction, occurredAt, input.conversationId, organizationId],
      );

      return;
    }

    if (input.direction === "inbound") {
      await this.dataSource.query(
        `
          UPDATE txt_conversations
          SET
            last_message_preview = ?,
            last_message_direction = ?,
            last_message_at = ?,
            unread_count = unread_count + 1,
            updated_at = CURRENT_TIMESTAMP(6)
          WHERE id = ?
            AND organization_id = ?
        `,
        [preview, input.direction, occurredAt, input.conversationId, organizationId],
      );

      return;
    }

    await this.dataSource.query(
      `
        UPDATE txt_conversations
        SET
          last_message_preview = ?,
          last_message_direction = ?,
          last_message_at = ?,
          updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ?
          AND organization_id = ?
      `,
      [preview, input.direction, occurredAt, input.conversationId, organizationId],
    );
  }

  private previewMessage(body: string) {
    const trimmed = body.trim();

    if (!trimmed) {
      return "(empty text message)";
    }

    return trimmed.length > 500 ? `${trimmed.slice(0, 497)}...` : trimmed;
  }

  private toConversation(row: Record<string, unknown>): TxtConversationRecord {
    return {
      id: String(row.id),
      organizationId: this.asTrimmedString(row.organization_id),
      publicConversationCode: String(row.public_conversation_code),
      customerId: this.asTrimmedString(row.customer_id),
      customerPhoneNumber: String(row.customer_phone_number ?? ""),
      customerPhoneNumberNormalized: String(row.customer_phone_number_normalized ?? ""),
      ownedPhoneNumberId: String(row.owned_phone_number_id ?? ""),
      ownedPhoneNumber: String(row.owned_phone_number ?? ""),
      ownedPhoneNumberNormalized: String(row.owned_phone_number_normalized ?? ""),
      title: this.asTrimmedString(row.title),
      displayName: this.asTrimmedString(row.display_name),
      lastMessagePreview: this.asTrimmedString(row.last_message_preview),
      lastMessageDirection: this.asDirection(row.last_message_direction),
      lastMessageAt: this.asDate(row.last_message_at),
      unreadCount: Number(row.unread_count ?? 0),
      isArchived: row.is_archived === true || row.is_archived === 1 || row.is_archived === "1",
      createdAt: this.asDate(row.created_at) ?? new Date(),
      updatedAt: this.asDate(row.updated_at) ?? new Date(),
    };
  }

  private asDirection(value: unknown): "inbound" | "outbound" | null {
    const raw = this.asTrimmedString(value)?.toLowerCase();

    if (raw === "inbound" || raw === "outbound") {
      return raw;
    }

    return null;
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

  private generatePublicConversationCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let output = "";

    for (let index = 0; index < 7; index += 1) {
      output += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    return output;
  }

  private async getConversationById(id: string, organizationId: string): Promise<TxtConversationRecord> {
    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          organization_id,
          public_conversation_code,
          customer_id,
          customer_phone_number,
          customer_phone_number_normalized,
          owned_phone_number_id,
          owned_phone_number,
          owned_phone_number_normalized,
          title,
          display_name,
          last_message_preview,
          last_message_direction,
          last_message_at,
          unread_count,
          is_archived,
          created_at,
          updated_at
        FROM txt_conversations
        WHERE id = ?
          AND organization_id = ?
        LIMIT 1
      `,
      [id, organizationId],
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      apiError(404, "txt_conversation_not_found", "TXT conversation was not found.");
    }

    return this.toConversation(rows[0]);
  }

  private async ensureSchema() {
    if (this.schemaEnsured) {
      return;
    }

    await assertTablesExist(this.dataSource, ["txt_conversations"]);

    this.schemaEnsured = true;
  }
}
