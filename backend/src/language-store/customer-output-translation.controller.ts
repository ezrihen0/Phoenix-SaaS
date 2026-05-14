import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";

import { requireActorProfile } from "../auth/permissions";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import {
  CustomerOutputTranslationService,
  type CustomerOutputTranslationSurfaceKey,
  isCustomerOutputTranslationSurfaceKey,
} from "./customer-output-translation.service";
import { isLanguageStoreCatalogCode } from "./language-store.constants";

type GenerateTranslationPayload = {
  surface_key?: unknown;
  source_language_code?: unknown;
  source_text?: unknown;
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
      }),
    );
  }

  @Post(":recordId/finalize")
  async finalize(@Req() request: RequestWithActor, @Param("recordId") recordId: string) {
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
  };
}
