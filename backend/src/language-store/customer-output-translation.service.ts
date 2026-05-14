import { Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { OrganizationBillingService } from "../billing/organization-billing.service";
import { apiError } from "../common/api-response";
import {
  CustomerOutputTranslationRecordEntity,
  customerOutputTranslationDocumentKinds,
  customerOutputTranslationFieldKeys,
  type CustomerOutputTranslationDocumentKind,
  type CustomerOutputTranslationFieldKey,
  type CustomerOutputTranslationStatus,
} from "../database/entities/customer-output-translation-record.entity";
import { TranslationUsageLedgerEntity } from "../database/entities/translation-usage-ledger.entity";
import { getLanguageCatalogEntry, isLanguageStoreCatalogCode, translationUnitCharacterLimit } from "./language-store.constants";
import { LanguageStoreService } from "./language-store.service";
import {
  CustomerOutputTranslationProviderConfigurationError,
  CustomerOutputTranslationProviderExecutionError,
  customerOutputTranslationProviderToken,
  type CustomerOutputTranslationProvider,
} from "./customer-output-translation.provider";

export const customerOutputTranslationSurfaceKeys = [
  "estimate_line_item_name",
  "estimate_line_item_description",
  "invoice_line_item_name",
  "invoice_line_item_description",
  "manual_line_text",
] as const;

export type CustomerOutputTranslationSurfaceKey = (typeof customerOutputTranslationSurfaceKeys)[number];

export type CustomerOutputTranslationRecordSnapshot = {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  finalized_by_user_id: string | null;
  surface_key: CustomerOutputTranslationSurfaceKey;
  source_language_code: string;
  target_language_code: string;
  document_kind: CustomerOutputTranslationDocumentKind | null;
  document_id: string | null;
  document_line_key: string | null;
  field_key: CustomerOutputTranslationFieldKey | null;
  source_text: string;
  translated_text: string;
  final_text: string | null;
  source_character_count: number;
  units_consumed: number;
  provider_key: string;
  provider_model: string | null;
  provider_request_id: string | null;
  status: CustomerOutputTranslationStatus;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerOutputTranslationUsageSummary = {
  organization_id: string;
  total_translation_units: number;
  consumed_translation_units: number;
  remaining_translation_units: number;
  billing_period_start: string | null;
  billing_period_end: string | null;
};

export type CustomerOutputTranslationResult = {
  record: CustomerOutputTranslationRecordSnapshot;
  usage: CustomerOutputTranslationUsageSummary;
};

export type ListFinalizedDocumentTranslationsInput = {
  organizationId: string;
  documentKind: CustomerOutputTranslationDocumentKind;
  documentId: string;
};

export type RequireFinalizedDocumentTranslationInput = {
  organizationId: string;
  documentKind: CustomerOutputTranslationDocumentKind;
  documentId: string;
  documentLineKey: string;
  fieldKey: CustomerOutputTranslationFieldKey;
  recordId: string;
};

type GenerateCustomerOutputTranslationInput = {
  organizationId: string;
  actorUserId: string;
  surfaceKey: CustomerOutputTranslationSurfaceKey;
  sourceLanguageCode: string;
  sourceText: string;
  attachment: CustomerOutputTranslationAttachment | null;
};

type FinalizeCustomerOutputTranslationInput = {
  organizationId: string;
  actorUserId: string;
  recordId: string;
  finalText: string | null;
};

type TranslationUsageWindow = {
  start: Date;
  end: Date;
};

export type CustomerOutputTranslationAttachment = {
  documentKind: CustomerOutputTranslationDocumentKind;
  documentId: string;
  documentLineKey: string;
  fieldKey: CustomerOutputTranslationFieldKey;
};

@Injectable()
export class CustomerOutputTranslationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly languageStoreService: LanguageStoreService,
    private readonly organizationBillingService: OrganizationBillingService,
    @Inject(customerOutputTranslationProviderToken)
    private readonly translationProvider: CustomerOutputTranslationProvider,
    @InjectRepository(CustomerOutputTranslationRecordEntity)
    private readonly translationRecordsRepository: Repository<CustomerOutputTranslationRecordEntity>,
    @InjectRepository(TranslationUsageLedgerEntity)
    private readonly translationUsageLedgerRepository: Repository<TranslationUsageLedgerEntity>,
  ) {}

  async generateDraft(
    input: GenerateCustomerOutputTranslationInput,
  ): Promise<CustomerOutputTranslationResult> {
    const normalizedSourceText = normalizeSourceText(input.sourceText);
    const sourceLanguageCode = input.sourceLanguageCode.trim().toLowerCase();
    if (!normalizedSourceText.trim()) {
      apiError(400, "translation_source_text_required", "source_text is required.");
    }

    if (!isLanguageStoreCatalogCode(sourceLanguageCode) || sourceLanguageCode === "en") {
      apiError(
        400,
        "translation_source_language_invalid",
        "source_language_code must be a supported non-English Language Store language.",
      );
    }

    const foundation = await this.languageStoreService.getOrganizationLanguageFoundationSnapshot(input.organizationId);
    assertTranslationGenerationAllowed(foundation);

    const enabledLanguageCodes = new Set(foundation.enabled_languages.map((language) => language.code));
    if (!enabledLanguageCodes.has(sourceLanguageCode)) {
      apiError(
        403,
        "translation_source_language_not_enabled",
        "The source language is not enabled for the active organization.",
      );
    }

    const usageWindow = await this.resolveUsageWindow(input.organizationId);
    const sourceCharacterCount = normalizedSourceText.length;
    const requestedUnits = calculateTranslationUnits(sourceCharacterCount);
    const consumedBefore = await this.sumConsumedUnits(input.organizationId, usageWindow);
    if (consumedBefore + requestedUnits > foundation.total_translation_units) {
      apiError(
        403,
        "translation_usage_exhausted",
        "This organization has no remaining translation units for the current billing period.",
      );
    }

    const sourceLanguage = getLanguageCatalogEntry(sourceLanguageCode);
    if (!sourceLanguage) {
      apiError(
        400,
        "translation_source_language_invalid",
        "source_language_code must be a supported non-English Language Store language.",
      );
    }

    let translatedText: string;
    let providerKey: string;
    let providerModel: string | null;
    let providerRequestId: string | null;

    try {
      const providerResult = await this.translationProvider.translateToEnglish({
        sourceLanguageCode,
        sourceLanguageLabel: sourceLanguage.label,
        targetLanguageCode: "en",
        sourceText: normalizedSourceText,
      });
      translatedText = providerResult.translatedText;
      providerKey = providerResult.providerKey;
      providerModel = providerResult.providerModel;
      providerRequestId = providerResult.providerRequestId;
    } catch (error) {
      if (error instanceof CustomerOutputTranslationProviderConfigurationError) {
        apiError(503, "translation_provider_not_configured", error.message);
      }

      if (error instanceof CustomerOutputTranslationProviderExecutionError) {
        apiError(502, "translation_provider_failed", error.message);
      }

      throw error;
    }

    const record = await this.dataSource.transaction(async (manager) => {
      const recordsRepository = manager.getRepository(CustomerOutputTranslationRecordEntity);
      const ledgerRepository = manager.getRepository(TranslationUsageLedgerEntity);
      const consumedInsideTransaction = await this.sumConsumedUnits(
        input.organizationId,
        usageWindow,
        ledgerRepository,
      );

      if (consumedInsideTransaction + requestedUnits > foundation.total_translation_units) {
        apiError(
          403,
          "translation_usage_exhausted",
          "This organization has no remaining translation units for the current billing period.",
        );
      }

      const created = await recordsRepository.save(
        recordsRepository.create({
          organization_id: input.organizationId,
          created_by_user_id: input.actorUserId,
          finalized_by_user_id: null,
          surface_key: input.surfaceKey,
          source_language_code: sourceLanguageCode,
          target_language_code: "en",
          document_kind: input.attachment?.documentKind ?? null,
          document_id: input.attachment?.documentId ?? null,
          document_line_key: input.attachment?.documentLineKey ?? null,
          field_key: input.attachment?.fieldKey ?? null,
          source_text: normalizedSourceText,
          translated_text: translatedText,
          final_text: null,
          source_character_count: sourceCharacterCount,
          units_consumed: requestedUnits,
          provider_key: providerKey,
          provider_model: providerModel,
          provider_request_id: providerRequestId,
          status: "draft",
          finalized_at: null,
        }),
      );

      await ledgerRepository.save(
        ledgerRepository.create({
          organization_id: input.organizationId,
          translation_record_id: created.id,
          created_by_user_id: input.actorUserId,
          usage_kind: "generation",
          source_character_count: sourceCharacterCount,
          units_consumed: requestedUnits,
          billing_period_start: usageWindow.start,
          billing_period_end: usageWindow.end,
        }),
      );

      return created;
    });

    return {
      record: serializeTranslationRecord(record),
      usage: await this.getUsageSummary(input.organizationId),
    };
  }

  async finalizeDraft(
    input: FinalizeCustomerOutputTranslationInput,
  ): Promise<CustomerOutputTranslationResult> {
    const record = await this.translationRecordsRepository.findOne({
      where: {
        id: input.recordId,
        organization_id: input.organizationId,
      },
    });

    if (!record) {
      apiError(404, "translation_record_not_found", "The requested translation record could not be found.");
    }

    const normalizedFinalText = normalizeOptionalFinalText(input.finalText);
    if (record.status === "final") {
      const resolvedExistingFinalText = record.final_text ?? record.translated_text;
      if (normalizedFinalText && normalizedFinalText !== resolvedExistingFinalText) {
        apiError(
          409,
          "translation_record_already_finalized",
          "The translation record is already finalized and cannot be changed.",
        );
      }

      if (record.final_text == null) {
        record.final_text = resolvedExistingFinalText;
        await this.translationRecordsRepository.save(record);
      }
    } else {
      record.status = "final";
      record.finalized_by_user_id = input.actorUserId;
      record.finalized_at = new Date();
      record.final_text = normalizedFinalText ?? record.translated_text;
      await this.translationRecordsRepository.save(record);
    }

    return {
      record: serializeTranslationRecord(record),
      usage: await this.getUsageSummary(input.organizationId),
    };
  }

  async getUsageSummary(organizationId: string): Promise<CustomerOutputTranslationUsageSummary> {
    const foundation = await this.languageStoreService.getOrganizationLanguageFoundationSnapshot(organizationId);
    const usageWindow = await this.resolveUsageWindow(organizationId);
    const consumed = await this.sumConsumedUnits(organizationId, usageWindow);

    return {
      organization_id: organizationId,
      total_translation_units: foundation.total_translation_units,
      consumed_translation_units: consumed,
      remaining_translation_units: Math.max(foundation.total_translation_units - consumed, 0),
      billing_period_start: usageWindow.start.toISOString(),
      billing_period_end: usageWindow.end.toISOString(),
    };
  }

  async listFinalizedDocumentTranslations(
    input: ListFinalizedDocumentTranslationsInput,
  ): Promise<CustomerOutputTranslationRecordSnapshot[]> {
    const records = await this.translationRecordsRepository.find({
      where: {
        organization_id: input.organizationId,
        document_kind: input.documentKind,
        document_id: input.documentId,
        status: "final",
      },
      order: {
        created_at: "ASC",
      },
    });

    return records.map((record) => serializeTranslationRecord(record));
  }

  async requireFinalizedDocumentTranslation(
    input: RequireFinalizedDocumentTranslationInput,
  ): Promise<CustomerOutputTranslationRecordSnapshot> {
    const record = await this.translationRecordsRepository.findOne({
      where: {
        id: input.recordId,
        organization_id: input.organizationId,
        document_kind: input.documentKind,
        document_id: input.documentId,
        document_line_key: input.documentLineKey,
        field_key: input.fieldKey,
        status: "final",
      },
    });

    if (!record) {
      apiError(
        404,
        "translation_record_not_found",
        "The requested finalized translation record could not be found for this document field.",
      );
    }

    return serializeTranslationRecord(record);
  }

  private async resolveUsageWindow(organizationId: string): Promise<TranslationUsageWindow> {
    const context = await this.organizationBillingService.getOrCreateContextForOrganization(organizationId);
    const start = context.coverage.current_period_start
      ?? context.account.current_period_start
      ?? context.coverage.trial_starts_at
      ?? context.account.trial_starts_at
      ?? startOfCurrentUtcMonth(new Date());
    const end = context.coverage.current_period_end
      ?? context.account.current_period_end
      ?? context.coverage.trial_ends_at
      ?? context.account.trial_ends_at
      ?? endOfCurrentUtcMonth(new Date());

    return { start, end };
  }

  private async sumConsumedUnits(
    organizationId: string,
    usageWindow: TranslationUsageWindow,
    repository = this.translationUsageLedgerRepository,
  ) {
    const raw = await repository
      .createQueryBuilder("ledger")
      .select("COALESCE(SUM(ledger.units_consumed), 0)", "total")
      .where("ledger.organization_id = :organizationId", { organizationId })
      .andWhere("ledger.billing_period_start = :billingPeriodStart", { billingPeriodStart: usageWindow.start })
      .andWhere("ledger.billing_period_end = :billingPeriodEnd", { billingPeriodEnd: usageWindow.end })
      .getRawOne<{ total: string | number | null }>();

    return Number(raw?.total ?? 0);
  }
}

export function calculateTranslationUnits(sourceCharacterCount: number) {
  const normalizedCount = Math.max(0, Math.trunc(sourceCharacterCount));
  if (normalizedCount <= 0) {
    return 0;
  }

  return Math.ceil(normalizedCount / translationUnitCharacterLimit);
}

export function isCustomerOutputTranslationSurfaceKey(value: string): value is CustomerOutputTranslationSurfaceKey {
  return customerOutputTranslationSurfaceKeys.includes(value as CustomerOutputTranslationSurfaceKey);
}

export function isCustomerOutputTranslationDocumentKind(value: string): value is CustomerOutputTranslationDocumentKind {
  return customerOutputTranslationDocumentKinds.includes(value as CustomerOutputTranslationDocumentKind);
}

export function isCustomerOutputTranslationFieldKey(value: string): value is CustomerOutputTranslationFieldKey {
  return customerOutputTranslationFieldKeys.includes(value as CustomerOutputTranslationFieldKey);
}

function assertTranslationGenerationAllowed(foundation: {
  language_store_enabled: boolean;
  billing_status: string;
  total_translation_units: number;
}) {
  if (!foundation.language_store_enabled) {
    apiError(
      403,
      "translation_language_store_unavailable",
      "Language Store must be enabled for this organization before customer English output can be generated.",
    );
  }

  if (foundation.billing_status !== "active" && foundation.billing_status !== "trialing") {
    apiError(
      403,
      "translation_billing_unavailable",
      "Customer English output is unavailable until the organization billing state is active or trialing.",
    );
  }

  if (foundation.total_translation_units <= 0) {
    apiError(
      403,
      "translation_usage_unavailable",
      "This organization does not currently have any translation units available.",
    );
  }
}

function serializeTranslationRecord(
  record: CustomerOutputTranslationRecordEntity,
): CustomerOutputTranslationRecordSnapshot {
  return {
    id: record.id,
    organization_id: record.organization_id,
    created_by_user_id: record.created_by_user_id,
    finalized_by_user_id: record.finalized_by_user_id,
    surface_key: record.surface_key as CustomerOutputTranslationSurfaceKey,
    source_language_code: record.source_language_code,
    target_language_code: record.target_language_code,
    document_kind: record.document_kind,
    document_id: record.document_id,
    document_line_key: record.document_line_key,
    field_key: record.field_key,
    source_text: record.source_text,
    translated_text: record.translated_text,
    final_text: record.final_text ?? (record.status === "final" ? record.translated_text : null),
    source_character_count: record.source_character_count,
    units_consumed: record.units_consumed,
    provider_key: record.provider_key,
    provider_model: record.provider_model,
    provider_request_id: record.provider_request_id,
    status: record.status,
    finalized_at: record.finalized_at?.toISOString() ?? null,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

function normalizeSourceText(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function normalizeOptionalFinalText(value: string | null) {
  if (value == null) {
    return null;
  }

  const normalized = normalizeSourceText(value).trim();
  if (!normalized) {
    apiError(400, "translation_final_text_invalid", "final_text must not be empty when provided.");
  }

  return normalized;
}

function startOfCurrentUtcMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfCurrentUtcMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
