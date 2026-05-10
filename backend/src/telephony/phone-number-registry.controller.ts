import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { OwnedPhoneNumbersService } from "../messaging/phone-numbers/owned-phone-numbers.service";
import { canManageTelephonySettings } from "./telephony-role";

type PhoneNumberRegistryPayload = {
  phoneNumber?: unknown;
  providerNumberId?: unknown;
  label?: unknown;
  marketKey?: unknown;
  marketLabel?: unknown;
  defaultSource?: unknown;
  sourceMappingId?: unknown;
  campaignName?: unknown;
  purpose?: unknown;
  smsEnabled?: unknown;
  voiceEnabled?: unknown;
  isActive?: unknown;
};

@UseGuards(SessionGuard)
@Controller("api/telephony")
export class PhoneNumberRegistryController {
  constructor(private readonly ownedPhoneNumbersService: OwnedPhoneNumbersService) {}

  @Get("phone-numbers")
  async listPhoneNumbers(@Req() request: RequestWithActor) {
    this.requireOfficeRole(request);
    return apiSuccess(await this.ownedPhoneNumbersService.listOwnedPhoneNumbers());
  }

  @Put("phone-numbers")
  async upsertPhoneNumber(@Req() request: RequestWithActor, @Body() payload: PhoneNumberRegistryPayload) {
    this.requireOfficeRole(request);

    if (typeof payload.phoneNumber !== "string") {
      apiError(400, "phone_registry_phone_invalid", "Phone number must be a string.");
    }

    const updated = await this.ownedPhoneNumbersService.upsertOwnedPhoneNumber({
      phoneNumber: payload.phoneNumber,
      provider: "telnyx",
      providerNumberId: this.readNullableString(payload.providerNumberId),
      label: this.readNullableString(payload.label),
      marketKey: this.readNullableString(payload.marketKey),
      marketLabel: this.readNullableString(payload.marketLabel),
      defaultSource: this.readNullableString(payload.defaultSource),
      sourceMappingId: this.readNullableString(payload.sourceMappingId),
      campaignName: this.readNullableString(payload.campaignName),
      purpose: this.readPurpose(payload.purpose),
      smsEnabled: this.readBoolean(payload.smsEnabled, true),
      voiceEnabled: this.readBoolean(payload.voiceEnabled, true),
      isActive: this.readBoolean(payload.isActive, true),
    });

    return apiSuccess(updated);
  }

  private requireOfficeRole(request: RequestWithActor) {
    const actor = request.actor;

    if (!actor || !canManageTelephonySettings(actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office roles can manage phone number registry settings.");
    }

    return actor;
  }

  private readNullableString(value: unknown) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    if (typeof value !== "string") {
      apiError(400, "phone_registry_payload_invalid", "Phone number registry fields must be strings, booleans, or null.");
    }

    return value;
  }

  private readBoolean(value: unknown, fallback: boolean) {
    if (value === undefined) {
      return fallback;
    }

    if (typeof value !== "boolean") {
      apiError(400, "phone_registry_boolean_invalid", "Phone number registry toggles must be true or false.");
    }

    return value;
  }

  private readPurpose(value: unknown) {
    if (value === undefined || value === null || value === "") {
      return "both" as const;
    }

    if (value === "txt" || value === "voice" || value === "both") {
      return value;
    }

    apiError(400, "phone_registry_purpose_invalid", "Phone number purpose must be txt, voice, or both.");
  }
}