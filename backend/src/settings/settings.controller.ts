import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";

import { requirePermission } from "../auth/permissions";
import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { normalizeCustomerFacingTechnicianLabel } from "../crm/customer-facing-technician";
import { SettingsService } from "./settings.service";

type TechnicianPublicIdentityPayload = {
  customerFacingName?: unknown;
  customerFacingTitle?: unknown;
  customerFacingPhotoUrl?: unknown;
};

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
  invoiceEmailSubject?: unknown;
  invoiceEmailBody?: unknown;
  invoiceSmsBody?: unknown;
  invoicePdfFooter?: unknown;
  logoUrl?: unknown;
  accentColor?: unknown;
  paymentInstructions?: unknown;
  businessLicense?: unknown;
  gstNumber?: unknown;
  warrantyMessage?: unknown;
  defaultDueDays?: unknown;
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

function readOptionalNullableInteger(
  value: unknown,
  fieldName: string,
  minimum: number,
  maximum: number,
) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    apiError(400, "organization_settings_invalid", `${fieldName} must be an integer or null.`);
  }

  if (value < minimum || value > maximum) {
    apiError(400, "organization_settings_invalid", `${fieldName} must be between ${minimum} and ${maximum}.`);
  }

  return value;
}

function readTechnicianPublicLabel(value: unknown, fieldName: string, maxLength: number) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    apiError(400, "technician_public_identity_invalid", `${fieldName} must be a string or null.`);
  }

  const normalized = normalizeCustomerFacingTechnicianLabel(value);
  if (normalized && normalized.length > maxLength) {
    apiError(400, "technician_public_identity_invalid", `${fieldName} is too long.`);
  }

  return normalized;
}

function readHttpsUrl(value: unknown, fieldName: string, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    apiError(400, "technician_public_identity_invalid", `${fieldName} must be a string or null.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    apiError(400, "technician_public_identity_invalid", `${fieldName} is too long.`);
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") {
      apiError(400, "technician_public_identity_invalid", `${fieldName} must be an https URL.`);
    }
    return parsed.toString();
  } catch {
    apiError(400, "technician_public_identity_invalid", `${fieldName} must be a valid URL.`);
  }
}

function parseTechnicianPublicIdentityPayload(payload: TechnicianPublicIdentityPayload) {
  const customerFacingName = readTechnicianPublicLabel(
    payload.customerFacingName,
    "Customer-facing technician name",
    80,
  );
  const customerFacingTitle = readTechnicianPublicLabel(
    payload.customerFacingTitle,
    "Customer-facing title",
    80,
  );

  if (payload.customerFacingPhotoUrl === undefined) {
    return {
      customerFacingName,
      customerFacingTitle,
    };
  }

  return {
    customerFacingName,
    customerFacingTitle,
    customerFacingPhotoUrl: readHttpsUrl(payload.customerFacingPhotoUrl, "Customer-facing photo", 1024),
  };
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
    invoiceEmailSubject: readOptionalNullableString(payload.invoiceEmailSubject, "Invoice email subject", 255),
    invoiceEmailBody: readOptionalNullableString(payload.invoiceEmailBody, "Invoice email body", 5000),
    invoiceSmsBody: readOptionalNullableString(payload.invoiceSmsBody, "Invoice SMS body", 480),
    invoicePdfFooter: readOptionalNullableString(payload.invoicePdfFooter, "Invoice PDF footer", 255),
    logoUrl: readOptionalNullableString(payload.logoUrl, "Logo URL", 1024),
    accentColor: readOptionalNullableString(payload.accentColor, "Accent color", 16),
    paymentInstructions: readOptionalNullableString(payload.paymentInstructions, "Payment instructions", 5000),
    businessLicense: readOptionalNullableString(payload.businessLicense, "Business license", 128),
    gstNumber: readOptionalNullableString(payload.gstNumber, "GST number", 128),
    warrantyMessage: readOptionalNullableString(payload.warrantyMessage, "Warranty message", 5000),
    defaultDueDays: readOptionalNullableInteger(payload.defaultDueDays, "Default due days", 0, 365),
  };
}

@Controller("api/settings")
@UseGuards(SessionGuard, OperationalAccessGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("organization")
  async getOrganizationSettings(@Req() request: RequestWithActor) {
    const actor = requirePermission(
      request.actor,
      "settings.view",
      "settings_view_forbidden",
      "This account cannot view organization settings.",
    );

    if (!actor.organization_id) {
      apiError(400, "organization_context_missing", "An active organization is required to load settings.");
    }

    return apiSuccess(await this.settingsService.getOrganizationSettings(actor.organization_id));
  }

  @Put("organization")
  async updateOrganizationSettings(
    @Req() request: RequestWithActor,
    @Body() payload: OrganizationSettingsPayload | null | undefined,
  ) {
    const actor = requirePermission(
      request.actor,
      "settings.manage",
      "settings_manage_forbidden",
      "This account cannot change organization settings.",
    );

    if (!actor.organization_id) {
      apiError(400, "organization_context_missing", "An active organization is required to update settings.");
    }

    return apiSuccess(
      await this.settingsService.updateOrganizationSettings(
        actor.organization_id,
        parseOrganizationSettingsPayload(payload ?? {}),
      ),
    );
  }

  @Get("technician-public-identity")
  async getTechnicianPublicIdentity(@Req() request: RequestWithActor) {
    const actor = request.actor;
    if (!actor?.user?.id) {
      apiError(401, "unauthenticated", "Sign in to manage your customer-facing technician name.");
    }
    if (!actor.organization_id) {
      apiError(400, "organization_context_missing", "An active organization is required.");
    }

    return apiSuccess(
      await this.settingsService.getTechnicianPublicIdentity(actor.organization_id, actor.user.id),
    );
  }

  @Put("technician-public-identity")
  async updateTechnicianPublicIdentity(
    @Req() request: RequestWithActor,
    @Body() payload: TechnicianPublicIdentityPayload | null | undefined,
  ) {
    const actor = request.actor;
    if (!actor?.user?.id) {
      apiError(401, "unauthenticated", "Sign in to manage your customer-facing technician name.");
    }
    if (!actor.organization_id) {
      apiError(400, "organization_context_missing", "An active organization is required.");
    }

    return apiSuccess(
      await this.settingsService.updateTechnicianPublicIdentity(
        actor.organization_id,
        actor.user.id,
        parseTechnicianPublicIdentityPayload(payload ?? {}),
        {
          displayName: actor.profile?.full_name?.trim() || actor.user.email,
          phone: actor.profile?.phone ?? null,
        },
      ),
    );
  }
}
