import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { DataSource } from "typeorm";

import { apiError } from "../../common/api-response";
import { assertTablesExist } from "../../database/schema-readiness";

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
  /** Preferred caller-facing name for the telephony owner id. */
  organizationId?: string | null;
  /** Legacy alias for `organizationId`. */
  tenantId?: string | null;
  companyId?: string | null;
  /** When set (registry API), `tenant_id` is forced to this organization and client `tenantId` is ignored. */
  actingOrganizationId?: string | null;
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
  organizationId: string | null;
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
        SELECT id, tenant_id
        FROM owned_phone_numbers
        WHERE phone_number_normalized = ?
        LIMIT 1
      `,
      [phoneNumberNormalized],
    ) as Array<{ id: string; tenant_id: string | null }>;

    const actingOrg = input.actingOrganizationId?.trim() ?? null;
    if (actingOrg && existing[0]?.tenant_id?.trim() && existing[0].tenant_id.trim() !== actingOrg) {
      apiError(404, "owned_phone_number_not_found", "The phone number could not be found in your organization registry.");
    }
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
    const organizationId = this.resolveOwnedNumberOrganizationId(input);
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
          organizationId,
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
        organizationId,
        companyId,
      ],
    );

    return this.getOwnedPhoneNumberById(id);
  }

  async listDialableVoiceNumbersForOrganization(organizationId: string) {
    const numbers = await this.listOwnedPhoneNumbers(organizationId);
    return numbers.filter((number) => number.isActive && number.voiceEnabled);
  }

  async findActiveVoiceOwnedNumberForOrganization(organizationId: string, phoneNumberRaw: string) {
    await this.ensureSchema();

    const scopedOrganizationId = organizationId.trim();
    if (!scopedOrganizationId) {
      return null;
    }

    const phoneNumberNormalized = this.normalizePhone(phoneNumberRaw);
    if (!phoneNumberNormalized) {
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
        WHERE tenant_id = ?
          AND phone_number_normalized = ?
          AND is_active = 1
          AND voice_enabled = 1
        LIMIT 1
      `,
      [scopedOrganizationId, phoneNumberNormalized],
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      return null;
    }

    return this.toOwnedPhoneNumber(rows[0]);
  }

  async listOwnedPhoneNumbers(organizationId: string) {
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
        WHERE tenant_id = ?
        ORDER BY is_active DESC, voice_enabled DESC, sms_enabled DESC, market_label ASC, label ASC, phone_number ASC
      `,
      [organizationId.trim()],
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
      organizationId: this.asTrimmedString(row.tenant_id),
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

  private resolveOwnedNumberOrganizationId(input: UpsertOwnedPhoneNumberInput) {
    return input.actingOrganizationId?.trim()
      ?? this.asTrimmedString(input.organizationId)
      ?? this.asTrimmedString(input.tenantId);
  }

  private async ensureSchema() {
    if (this.schemaEnsured) {
      return;
    }

    await assertTablesExist(this.dataSource, ["owned_phone_numbers"]);

    this.schemaEnsured = true;
  }
}
