import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";

import { readActorRole, requireActorProfile } from "../auth/permissions";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { LanguageStoreService } from "./language-store.service";
import { isLanguageStoreCatalogCode } from "./language-store.constants";

@Controller("api/language-store")
@UseGuards(SessionGuard)
export class LanguageStoreController {
  constructor(private readonly languageStoreService: LanguageStoreService) {}

  @Get()
  async summary(@Req() request: RequestWithActor) {
    const actor = requireActorProfile(request.actor);
    const organizationId = actor.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for Language Store.");
    }

    return apiSuccess(
      await this.languageStoreService.getProductSurfaceSnapshot({
        organizationId,
        canManageLanguages: canManageOrganizationLanguages(actor),
      }),
    );
  }

  @Get("preference")
  async preference(@Req() request: RequestWithActor) {
    const actor = requireActorProfile(request.actor);
    const organizationId = actor.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for Language Store.");
    }

    return apiSuccess(
      await this.languageStoreService.getUserOrganizationLanguagePreference(
        organizationId,
        actor.user.id,
      ),
    );
  }

  @Post("preference")
  async savePreference(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requireActorProfile(request.actor);
    const organizationId = actor.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for Language Store.");
    }

    return apiSuccess(
      await this.languageStoreService.saveUserOrganizationLanguagePreference({
        organizationId,
        userId: actor.user.id,
        languageCode: readLanguageCodeFromBody(body),
      }),
    );
  }

  @Post("languages/activate")
  async activateLanguage(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requireActorProfile(request.actor);
    const organizationId = actor.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for Language Store.");
    }

    requireLanguageStoreManager(actor);

    return apiSuccess(
      await this.languageStoreService.activateOrganizationLanguage({
        organizationId,
        actorUserId: actor.user.id,
        languageCode: readLanguageCodeFromBody(body),
        canManageLanguages: true,
      }),
    );
  }

  @Post("languages/deactivate")
  async deactivateLanguage(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requireActorProfile(request.actor);
    const organizationId = actor.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for Language Store.");
    }

    requireLanguageStoreManager(actor);

    return apiSuccess(
      await this.languageStoreService.deactivateOrganizationLanguage({
        organizationId,
        languageCode: readLanguageCodeFromBody(body),
        canManageLanguages: true,
      }),
    );
  }
}

function requireLanguageStoreManager(actor: NonNullable<RequestWithActor["actor"]>) {
  if (!canManageOrganizationLanguages(actor)) {
    apiError(
      403,
      "language_store_manage_forbidden",
      "Only owners and admins can activate or deactivate organization languages.",
    );
  }

  return actor;
}

function canManageOrganizationLanguages(actor: NonNullable<RequestWithActor["actor"]>) {
  const role = readActorRole(actor);
  return role === "owner" || role === "admin";
}

function readLanguageCodeFromBody(body: unknown) {
  if (!body || typeof body !== "object") {
    apiError(400, "language_store_payload_invalid", "Expected a JSON object.");
  }

  const candidate = (body as Record<string, unknown>).language_code;
  if (typeof candidate !== "string") {
    apiError(400, "language_store_language_code_invalid", "Field language_code must be a supported language code.");
  }

  const languageCode = candidate.trim().toLowerCase();
  if (!languageCode || !isLanguageStoreCatalogCode(languageCode)) {
    apiError(400, "language_store_language_code_invalid", "Field language_code must be a supported language code.");
  }

  return languageCode;
}
