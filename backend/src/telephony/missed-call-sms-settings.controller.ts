import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";

import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { canManageTelephonySettings } from "./telephony-role";
import { TelnyxWebhookService } from "./telnyx-webhook.service";

type MissedCallSmsSettingsPayload = {
  enabled?: unknown;
  template?: unknown;
  cooldownSeconds?: unknown;
};

@UseGuards(SessionGuard, OperationalAccessGuard)
@Controller("api/telephony")
export class MissedCallSmsSettingsController {
  constructor(private readonly telnyxWebhookService: TelnyxWebhookService) {}

  @Get("missed-call-sms-settings")
  async getSettings(@Req() request: RequestWithActor) {
    const actor = request.actor;

    if (!actor || !canManageTelephonySettings(actor.role ?? actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office roles can manage missed-call SMS settings.");
    }

    return apiSuccess(await this.telnyxWebhookService.getMissedCallSmsSettings(this.requireOrganizationId(actor.organization_id)));
  }

  @Put("missed-call-sms-settings")
  async updateSettings(
    @Req() request: RequestWithActor,
    @Body() payload: MissedCallSmsSettingsPayload,
  ) {
    const actor = request.actor;

    if (!actor || !canManageTelephonySettings(actor.role ?? actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office roles can manage missed-call SMS settings.");
    }

    if (typeof payload.enabled !== "boolean") {
      apiError(400, "missed_call_sms_enabled_invalid", "Missed-call SMS enabled must be true or false.");
    }

    if (typeof payload.template !== "string") {
      apiError(400, "missed_call_sms_template_invalid", "Missed-call SMS template must be a string.");
    }

    const cooldownSeconds = Number(payload.cooldownSeconds);

    if (!Number.isFinite(cooldownSeconds) || cooldownSeconds < 0) {
      apiError(400, "missed_call_sms_cooldown_invalid", "Missed-call SMS cooldown must be zero or greater.");
    }

    const updated = await this.telnyxWebhookService.updateMissedCallSmsSettings({
      organizationId: this.requireOrganizationId(actor.organization_id),
      enabled: payload.enabled,
      template: payload.template,
      cooldownSeconds,
      updatedByAuthUserId: actor.user.id,
    });

    return apiSuccess(updated);
  }

  private requireOrganizationId(value: string | null | undefined) {
    const organizationId = value?.trim();

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for telephony settings.");
    }

    return organizationId;
  }
}
