import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";

import { requirePermission } from "../auth/permissions";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { SettingsService } from "./settings.service";

type OrganizationSettingsPayload = {
  businessName?: unknown;
  displayInitials?: unknown;
  phone?: unknown;
  companyEmail?: unknown;
  website?: unknown;
  timezone?: unknown;
  googleReviewUrl?: unknown;
  defaultSmsNumber?: unknown;
  businessHours?: unknown;
};

function readNullableString(value: unknown, fieldName: string, maxLength: number) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    apiError(400, "organization_settings_invalid", `${fieldName} must be a string or null.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    apiError(400, "organization_settings_invalid", `${fieldName} is too long.`);
  }

  return normalized;
}

function readOptionalNullableString(value: unknown, fieldName: string, maxLength: number) {
  if (value === undefined) {
    return undefined;
  }

  return readNullableString(value, fieldName, maxLength);
}

function parseOrganizationSettingsPayload(payload: OrganizationSettingsPayload) {
  return {
    businessName: readNullableString(payload.businessName, "Company name", 255),
    displayInitials: readNullableString(payload.displayInitials, "Display initials", 16),
    phone: readNullableString(payload.phone, "Phone", 64),
    companyEmail: readNullableString(payload.companyEmail, "Email", 320),
    website: readNullableString(payload.website, "Website", 255),
    timezone: readOptionalNullableString(payload.timezone, "Timezone", 128),
    googleReviewUrl: readOptionalNullableString(payload.googleReviewUrl, "Google review URL", 512),
    defaultSmsNumber: readOptionalNullableString(payload.defaultSmsNumber, "Default SMS number", 64),
    businessHours: readOptionalNullableString(payload.businessHours, "Business hours", 2000),
  };
}

@Controller("api/settings")
@UseGuards(SessionGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("organization")
  async getOrganizationSettings() {
    return apiSuccess(await this.settingsService.getOrganizationSettings());
  }

  @Put("organization")
  async updateOrganizationSettings(
    @Req() request: RequestWithActor,
    @Body() payload: OrganizationSettingsPayload | null | undefined,
  ) {
    requirePermission(
      request.actor,
      "settings.manage",
      "settings_manage_forbidden",
      "This account cannot change organization settings.",
    );

    return apiSuccess(
      await this.settingsService.updateOrganizationSettings(parseOrganizationSettingsPayload(payload ?? {})),
    );
  }
}