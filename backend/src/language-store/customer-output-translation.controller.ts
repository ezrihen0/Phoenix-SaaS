import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";

import { requireActorProfile } from "../auth/permissions";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import type {
  CustomerOutputTranslationDocumentKind,
  CustomerOutputTranslationFieldKey,
} from "../database/entities/customer-output-translation-record.entity";
import {
  type CustomerOutputTranslationAttachment,
  CustomerOutputTranslationService,
  isCustomerOutputTranslationDocumentKind,
  isCustomerOutputTranslationFieldKey,
  type CustomerOutputTranslationSurfaceKey,
  isCustomerOutputTranslationSurfaceKey,
} from "./customer-output-translation.service";
import { isLanguageStoreCatalogCode } from "./language-store.constants";

type GenerateTranslationPayload = {
  surface_key?: unknown;
  source_language_code?: unknown;
  source_text?: unknown;
  document_kind?: unknown;
  document_id?: unknown;
  document_line_key?: unknown;
  field_key?: unknown;
};

type FinalizeTranslationPayload = {
  final_text?: unknown;
};

@Controller("api/language-store/customer-output-translations")
@UseGuards(SessionGuard)
export class CustomerOutputTranslationController {
  constructor(
    private readonly customerOutputTranslationService: CustomerOutputTranslationService,
  ) {}

  @Get("usage")
  async usage(@Req() request: RequestWithActor) {
    const actor = requireActorProfile(request.actor);
    const organizationId = actor.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for customer English output.");
    }

    return apiSuccess(
      await this.customerOutputTranslationService.getUsageSummary(organizationId),
    );
  }

  @Get("document")
  async document(
    @Req() request: RequestWithActor,
    @Query("document_kind") documentKindRaw: string | undefined,
    @Query("document_id") documentIdRaw: string | undefined,
  ) {
    const actor = requireActorProfile(request.actor);
    const organizationId = actor.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for customer English output.");
    }

    const documentKind = readDocumentKind(documentKindRaw);
    const documentId = readRequiredTrimmedString(documentIdRaw, "document_id", 64);
    return apiSuccess(
      await this.customerOutputTranslationService.listFinalizedDocumentTranslations({
        organizationId,
        documentKind,
        documentId,
      }),
    );
  }

  @Post("generate")
  async generate(@Req() request: RequestWithActor, @Body() body: GenerateTranslationPayload) {
    const actor = requireActorProfile(request.actor);
    const organizationId = actor.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for customer English output.");
    }

    const payload = parseGeneratePayload(body);
    return apiSuccess(
      await this.customerOutputTranslationService.generateDraft({
        organizationId,
        actorUserId: actor.user.id,
        surfaceKey: payload.surface_key,
        sourceLanguageCode: payload.source_language_code,
        sourceText: payload.source_text,
        attachment: payload.attachment,
      }),
    );
  }

  @Post(":recordId/finalize")
  async finalize(
    @Req() request: RequestWithActor,
    @Param("recordId") recordId: string,
    @Body() body: FinalizeTranslationPayload,
  ) {
    const actor = requireActorProfile(request.actor);
    const organizationId = actor.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for customer English output.");
    }

    const normalizedRecordId = recordId?.trim();
    if (!normalizedRecordId) {
      apiError(400, "translation_record_id_required", "recordId is required.");
    }

    return apiSuccess(
      await this.customerOutputTranslationService.finalizeDraft({
        organizationId,
        actorUserId: actor.user.id,
        recordId: normalizedRecordId,
        finalText: readOptionalFinalText(body),
      }),
    );
  }
}

function parseGeneratePayload(payload: GenerateTranslationPayload) {
  if (typeof payload.surface_key !== "string" || !isCustomerOutputTranslationSurfaceKey(payload.surface_key.trim())) {
    apiError(
      400,
      "translation_surface_key_invalid",
      "surface_key must be one of the supported customer-output translation surfaces.",
    );
  }

  if (typeof payload.source_language_code !== "string") {
    apiError(
      400,
      "translation_source_language_invalid",
      "source_language_code must be a supported non-English Language Store language.",
    );
  }

  const sourceLanguageCode = payload.source_language_code.trim().toLowerCase();
  if (!isLanguageStoreCatalogCode(sourceLanguageCode)) {
    apiError(
      400,
      "translation_source_language_invalid",
      "source_language_code must be a supported non-English Language Store language.",
    );
  }

  if (typeof payload.source_text !== "string") {
    apiError(400, "translation_source_text_required", "source_text is required.");
  }

  return {
    surface_key: payload.surface_key.trim() as CustomerOutputTranslationSurfaceKey,
    source_language_code: sourceLanguageCode,
    source_text: payload.source_text,
    attachment: parseAttachmentPayload(payload),
  };
}

function parseAttachmentPayload(payload: GenerateTranslationPayload): CustomerOutputTranslationAttachment | null {
  const hasAnyAttachmentField =
    payload.document_kind !== undefined
    || payload.document_id !== undefined
    || payload.document_line_key !== undefined
    || payload.field_key !== undefined;

  if (!hasAnyAttachmentField) {
    return null;
  }

  const documentKind = readDocumentKind(payload.document_kind);
  const documentId = readRequiredTrimmedString(payload.document_id, "document_id", 64);
  const documentLineKey = readRequiredTrimmedString(payload.document_line_key, "document_line_key", 128);
  const fieldKey = readFieldKey(payload.field_key);

  return {
    documentKind,
    documentId,
    documentLineKey,
    fieldKey,
  };
}

function readDocumentKind(value: unknown): CustomerOutputTranslationDocumentKind {
  if (typeof value !== "string") {
    apiError(400, "translation_document_kind_invalid", "document_kind must be one of: quote, invoice.");
  }

  const normalized = value.trim().toLowerCase();
  if (!isCustomerOutputTranslationDocumentKind(normalized)) {
    apiError(400, "translation_document_kind_invalid", "document_kind must be one of: quote, invoice.");
  }

  return normalized;
}

function readFieldKey(value: unknown): CustomerOutputTranslationFieldKey {
  if (typeof value !== "string") {
    apiError(400, "translation_field_key_invalid", "field_key must be one of: name, description.");
  }

  const normalized = value.trim().toLowerCase();
  if (!isCustomerOutputTranslationFieldKey(normalized)) {
    apiError(400, "translation_field_key_invalid", "field_key must be one of: name, description.");
  }

  return normalized;
}

function readRequiredTrimmedString(value: unknown, fieldName: string, maxLength: number) {
  if (typeof value !== "string") {
    apiError(400, `${fieldName}_invalid`, `${fieldName} is required.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    apiError(400, `${fieldName}_invalid`, `${fieldName} is required.`);
  }

  if (normalized.length > maxLength) {
    apiError(400, `${fieldName}_invalid`, `${fieldName} must be ${maxLength} characters or less.`);
  }

  return normalized;
}

function readOptionalFinalText(payload: FinalizeTranslationPayload) {
  if (payload.final_text === undefined || payload.final_text === null) {
    return null;
  }

  if (typeof payload.final_text !== "string") {
    apiError(400, "translation_final_text_invalid", "final_text must be a string when provided.");
  }

  return payload.final_text;
}
