import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { DataSource } from "typeorm";

import { apiError } from "../../common/api-response";

type UpsertOwnedPhoneNumberInput = {
  phoneNumber: string;
  provider?: "telnyx";
  providerNumberId?: string | null;
  label?: string | null;
  marketKey?: string | null;
  marketLabel?: string | null;
  defaultSource?: string | null;
  sourceMappingId?: string | null;
  campaignName?: string | null;
  purpose?: "txt" | "voice" | "both";
  smsEnabled?: boolean;
  voiceEnabled?: boolean;
  isActive?: boolean;
  tenantId?: string | null;
  companyId?: string | null;
};

type OwnedPhoneNumberRecord = {
  id: string;
  provider: "telnyx";
  providerNumberId: string | null;
  phoneNumber: string;
  phoneNumberNormalized: string;
  label: string | null;
  marketKey: string | null;
  marketLabel: string | null;
  defaultSource: string | null;
  sourceMappingId: string | null;
  campaignName: string | null;
  purpose: "txt" | "voice" | "both";
  smsEnabled: boolean;
  voiceEnabled: boolean;
  isActive: boolean;
  tenantId: string | null;
  companyId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class OwnedPhoneNumbersService implements OnModuleInit {
  private readonly logger = new Logger(OwnedPhoneNumbersService.name);
  private schemaEnsured = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureSchema();
    await this.seedOwnedNumbersFromEnv();
  }

  normalizePhone(value: string | null | undefined) {
    const trimmed = (value ?? "").trim();

    if (!trimmed) {
      return null;
    }

    const digits = trimmed.replace(/\D/g, "");

    if (digits.length === 10) {
      return `+1${digits}`;
    }

    if (digits.length === 11 && digits.startsWith("1")) {
      return `+${digits}`;
    }

    if (digits.length >= 8 && digits.length <= 15) {
      return `+${digits}`;
    }

    return null;
  }

  async upsertOwnedPhoneNumber(input: UpsertOwnedPhoneNumberInput): Promise<OwnedPhoneNumberRecord> {
    await this.ensureSchema();

    const phoneNumber = input.phoneNumber.trim();
    const phoneNumberNormalized = this.normalizePhone(phoneNumber);

    if (!phoneNumberNormalized) {
      apiError(400, "owned_phone_number_invalid", "Owned phone number must be a valid E.164-compatible value.");
    }

    const existing = await this.dataSource.query(
      `
        SELECT id
        FROM owned_phone_numbers
        WHERE phone_number_normalized = ?
        LIMIT 1
      `,
      [phoneNumberNormalized],
    ) as Array<{ id: string }>;

    const provider = input.provider ?? "telnyx";
    const providerNumberId = this.asTrimmedString(input.providerNumberId);
    const label = this.asTrimmedString(input.label);
    const marketKey = this.normalizeRegistryKey(input.marketKey);
    const marketLabel = this.asTrimmedString(input.marketLabel);
    const defaultSource = this.normalizeRegistryKey(input.defaultSource);
    const sourceMappingId = this.asTrimmedString(input.sourceMappingId);
    const campaignName = this.asTrimmedString(input.campaignName);
    const purpose = input.purpose ?? "both";
    const smsEnabled = input.smsEnabled ?? true;
    const voiceEnabled = input.voiceEnabled ?? true;
    const isActive = input.isActive ?? true;
    const tenantId = this.asTrimmedString(input.tenantId);
    const companyId = this.asTrimmedString(input.companyId);

    if (existing[0]?.id) {
      await this.dataSource.query(
        `
          UPDATE owned_phone_numbers
          SET
            provider = ?,
            provider_number_id = ?,
            phone_number = ?,
            label = ?,
            market_key = ?,
            market_label = ?,
            default_source = ?,
            source_mapping_id = ?,
            campaign_name = ?,
            purpose = ?,
            sms_enabled = ?,
            voice_enabled = ?,
            is_active = ?,
            tenant_id = ?,
            company_id = ?,
            updated_at = CURRENT_TIMESTAMP(6)
          WHERE id = ?
        `,
        [
          provider,
          providerNumberId,
          phoneNumber,
          label,
          marketKey,
          marketLabel,
          defaultSource,
          sourceMappingId,
          campaignName,
          purpose,
          smsEnabled ? 1 : 0,
          voiceEnabled ? 1 : 0,
          isActive ? 1 : 0,
          tenantId,
          companyId,
          existing[0].id,
        ],
      );

      return this.getOwnedPhoneNumberById(existing[0].id);
    }

    const id = randomUUID();

    await this.dataSource.query(
      `
        INSERT INTO owned_phone_numbers (
          id,
          provider,
          provider_number_id,
          phone_number,
          phone_number_normalized,
          label,
          market_key,
          market_label,
          default_source,
          source_mapping_id,
          campaign_name,
          purpose,
          sms_enabled,
          voice_enabled,
          is_active,
          tenant_id,
          company_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
      `,
      [
        id,
        provider,
        providerNumberId,
        phoneNumber,
        phoneNumberNormalized,
        label,
        marketKey,
        marketLabel,
        defaultSource,
        sourceMappingId,
        campaignName,
        purpose,
        smsEnabled ? 1 : 0,
        voiceEnabled ? 1 : 0,
        isActive ? 1 : 0,
        tenantId,
        companyId,
      ],
    );

    return this.getOwnedPhoneNumberById(id);
  }

  async listOwnedPhoneNumbers() {
    await this.ensureSchema();

    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          provider,
          provider_number_id,
          phone_number,
          phone_number_normalized,
          label,
          market_key,
          market_label,
          default_source,
          source_mapping_id,
          campaign_name,
          purpose,
          sms_enabled,
          voice_enabled,
          is_active,
          tenant_id,
          company_id,
          created_at,
          updated_at
        FROM owned_phone_numbers
        ORDER BY is_active DESC, voice_enabled DESC, sms_enabled DESC, market_label ASC, label ASC, phone_number ASC
      `,
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => this.toOwnedPhoneNumber(row));
  }

  async findPreferredVoiceOwnedNumber(preferredSource: string | null = "website") {
    await this.ensureSchema();

    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          provider,
          provider_number_id,
          phone_number,
          phone_number_normalized,
          label,
          market_key,
          market_label,
          default_source,
          source_mapping_id,
          campaign_name,
          purpose,
          sms_enabled,
          voice_enabled,
          is_active,
          tenant_id,
          company_id,
          created_at,
          updated_at
        FROM owned_phone_numbers
        WHERE is_active = 1
          AND voice_enabled = 1
        ORDER BY
          CASE
            WHEN default_source = ? THEN 0
            WHEN default_source = 'website' THEN 1
            ELSE 2
          END,
          market_label ASC,
          label ASC,
          phone_number ASC
        LIMIT 1
      `,
      [preferredSource],
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      return null;
    }

    return this.toOwnedPhoneNumber(rows[0]);
  }

  async findActiveSmsOwnedNumberByNormalized(phoneNumberRaw: string) {
    await this.ensureSchema();

    const normalized = this.normalizePhone(phoneNumberRaw);

    if (!normalized) {
      return null;
    }

    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          provider,
          provider_number_id,
          phone_number,
          phone_number_normalized,
          label,
          market_key,
          market_label,
          default_source,
          source_mapping_id,
          campaign_name,
          purpose,
          sms_enabled,
          voice_enabled,
          is_active,
          tenant_id,
          company_id,
          created_at,
          updated_at
        FROM owned_phone_numbers
        WHERE phone_number_normalized = ?
          AND is_active = 1
          AND sms_enabled = 1
        LIMIT 1
      `,
      [normalized],
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      return null;
    }

    return this.toOwnedPhoneNumber(rows[0]);
  }

  async findActiveVoiceOwnedNumberByNormalized(phoneNumberRaw: string) {
    await this.ensureSchema();

    const normalized = this.normalizePhone(phoneNumberRaw);

    if (!normalized) {
      return null;
    }

    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          provider,
          provider_number_id,
          phone_number,
          phone_number_normalized,
          label,
          market_key,
          market_label,
          default_source,
          source_mapping_id,
          campaign_name,
          purpose,
          sms_enabled,
          voice_enabled,
          is_active,
          tenant_id,
          company_id,
          created_at,
          updated_at
        FROM owned_phone_numbers
        WHERE phone_number_normalized = ?
          AND is_active = 1
          AND voice_enabled = 1
        LIMIT 1
      `,
      [normalized],
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      return null;
    }

    return this.toOwnedPhoneNumber(rows[0]);
  }

  async seedOwnedNumbersFromEnv() {
    await this.ensureSchema();

    const candidates = [
      {
        value: this.configService.get<string>("TELNYX_SMS_FROM_NUMBER") ?? "",
        label: "Primary TXT Number",
      },
      {
        value: this.configService.get<string>("TELNYX_OUTBOUND_FROM_NUMBER") ?? "",
        label: "Default Outbound Number",
      },
    ];

    for (const candidate of candidates) {
      const raw = candidate.value.trim();

      if (!raw) {
        continue;
      }

      const normalized = this.normalizePhone(raw);

      if (!normalized) {
        this.logger.warn(`Skipping env-owned number with invalid format: ${raw}`);
        continue;
      }

      await this.upsertOwnedPhoneNumber({
        phoneNumber: raw,
        provider: "telnyx",
        label: candidate.label,
        purpose: "both",
        smsEnabled: true,
        voiceEnabled: true,
        isActive: true,
      });
    }
  }

  private async getOwnedPhoneNumberById(id: string): Promise<OwnedPhoneNumberRecord> {
    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          provider,
          provider_number_id,
          phone_number,
          phone_number_normalized,
          label,
          market_key,
          market_label,
          default_source,
          source_mapping_id,
          campaign_name,
          purpose,
          sms_enabled,
          voice_enabled,
          is_active,
          tenant_id,
          company_id,
          created_at,
          updated_at
        FROM owned_phone_numbers
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      apiError(404, "owned_phone_number_not_found", "Owned phone number could not be found.");
    }

    return this.toOwnedPhoneNumber(rows[0]);
  }

  private toOwnedPhoneNumber(row: Record<string, unknown>): OwnedPhoneNumberRecord {
    return {
      id: String(row.id),
      provider: "telnyx",
      providerNumberId: this.asTrimmedString(row.provider_number_id),
      phoneNumber: String(row.phone_number ?? ""),
      phoneNumberNormalized: String(row.phone_number_normalized ?? ""),
      label: this.asTrimmedString(row.label),
      marketKey: this.asTrimmedString(row.market_key),
      marketLabel: this.asTrimmedString(row.market_label),
      defaultSource: this.asTrimmedString(row.default_source),
      sourceMappingId: this.asTrimmedString(row.source_mapping_id),
      campaignName: this.asTrimmedString(row.campaign_name),
      purpose: this.asPurpose(row.purpose),
      smsEnabled: this.asBoolean(row.sms_enabled),
      voiceEnabled: this.asBoolean(row.voice_enabled),
      isActive: this.asBoolean(row.is_active),
      tenantId: this.asTrimmedString(row.tenant_id),
      companyId: this.asTrimmedString(row.company_id),
      createdAt: this.asDate(row.created_at) ?? new Date(),
      updatedAt: this.asDate(row.updated_at) ?? new Date(),
    };
  }

  private asPurpose(value: unknown): "txt" | "voice" | "both" {
    const raw = this.asTrimmedString(value)?.toLowerCase();

    if (raw === "txt" || raw === "voice" || raw === "both") {
      return raw;
    }

    return "both";
  }

  private asBoolean(value: unknown) {
    return value === true || value === 1 || value === "1";
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

  private normalizeRegistryKey(value: string | null | undefined) {
    const trimmed = (value ?? "").trim().toLowerCase();

    if (!trimmed) {
      return null;
    }

    const normalized = trimmed
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return normalized || null;
  }

  private async ensureSchema() {
    if (this.schemaEnsured) {
      return;
    }

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS owned_phone_numbers (
        id char(36) NOT NULL,
        provider varchar(32) NOT NULL DEFAULT 'telnyx',
        provider_number_id varchar(255) NULL,
        phone_number varchar(64) NOT NULL,
        phone_number_normalized varchar(32) NOT NULL,
        label varchar(255) NULL,
        market_key varchar(64) NULL,
        market_label varchar(128) NULL,
        default_source varchar(64) NULL,
        source_mapping_id varchar(128) NULL,
        campaign_name varchar(255) NULL,
        purpose varchar(16) NOT NULL DEFAULT 'both',
        sms_enabled tinyint(1) NOT NULL DEFAULT 1,
        voice_enabled tinyint(1) NOT NULL DEFAULT 1,
        is_active tinyint(1) NOT NULL DEFAULT 1,
        tenant_id char(36) NULL,
        company_id char(36) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY ux_owned_phone_numbers_normalized (phone_number_normalized),
        KEY ix_owned_phone_numbers_active_sms (is_active, sms_enabled),
        KEY ix_owned_phone_numbers_active_voice (is_active, voice_enabled),
        KEY ix_owned_phone_numbers_market_key (market_key),
        KEY ix_owned_phone_numbers_provider_id (provider, provider_number_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await this.ensureColumn("market_key", "ALTER TABLE owned_phone_numbers ADD COLUMN market_key varchar(64) NULL AFTER label");
    await this.ensureColumn("market_label", "ALTER TABLE owned_phone_numbers ADD COLUMN market_label varchar(128) NULL AFTER market_key");
    await this.ensureColumn("default_source", "ALTER TABLE owned_phone_numbers ADD COLUMN default_source varchar(64) NULL AFTER market_label");
    await this.ensureColumn("source_mapping_id", "ALTER TABLE owned_phone_numbers ADD COLUMN source_mapping_id varchar(128) NULL AFTER default_source");
    await this.ensureColumn("campaign_name", "ALTER TABLE owned_phone_numbers ADD COLUMN campaign_name varchar(255) NULL AFTER source_mapping_id");
    await this.ensureIndex(
      "ix_owned_phone_numbers_active_voice",
      "CREATE INDEX ix_owned_phone_numbers_active_voice ON owned_phone_numbers (is_active, voice_enabled)",
    );
    await this.ensureIndex(
      "ix_owned_phone_numbers_market_key",
      "CREATE INDEX ix_owned_phone_numbers_market_key ON owned_phone_numbers (market_key)",
    );

    this.schemaEnsured = true;
  }

  private async ensureColumn(columnName: string, alterSql: string) {
    const rows = await this.dataSource.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'owned_phone_numbers'
          AND COLUMN_NAME = ?
        LIMIT 1
      `,
      [columnName],
    ) as Array<{ COLUMN_NAME?: string }>;

    if (rows.length === 0) {
      await this.dataSource.query(alterSql);
    }
  }

  private async ensureIndex(indexName: string, createSql: string) {
    const rows = await this.dataSource.query(
      `
        SELECT INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'owned_phone_numbers'
          AND INDEX_NAME = ?
        LIMIT 1
      `,
      [indexName],
    ) as Array<{ INDEX_NAME?: string }>;

    if (rows.length === 0) {
      await this.dataSource.query(createSql);
    }
  }
}
