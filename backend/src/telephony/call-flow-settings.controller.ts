import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";

import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { canManageTelephonySettings } from "./telephony-role";
import {
  CallFlowAction,
  CallFlowDayKey,
  CallFlowGreetingMode,
  CallFlowSettingsService,
} from "./call-flow-settings.service";

type CallFlowBusinessHoursPayload = {
  dayKey?: unknown;
  enabled?: unknown;
  openTime?: unknown;
  closeTime?: unknown;
};

type CallFlowIvrOptionPayload = {
  digit?: unknown;
  label?: unknown;
  serviceType?: unknown;
  routeTarget?: unknown;
};

type CallFlowSettingsPayload = {
  configName?: unknown;
  timeZone?: unknown;
  greetingMode?: unknown;
  greetingText?: unknown;
  openHoursAction?: unknown;
  openHoursRouteTarget?: unknown;
  afterHoursAction?: unknown;
  afterHoursRouteTarget?: unknown;
  whisperMessage?: unknown;
  missedCallSmsTemplateKey?: unknown;
  businessHours?: unknown;
  ivrOptions?: unknown;
};

@UseGuards(SessionGuard, OperationalAccessGuard)
@Controller("api/telephony")
export class CallFlowSettingsController {
  constructor(private readonly callFlowSettingsService: CallFlowSettingsService) {}

  @Get("call-flow-settings")
  async getSettings(@Req() request: RequestWithActor) {
    const actor = this.requireOfficeRole(request);
    return apiSuccess(await this.callFlowSettingsService.getSettings(this.requireOrganizationId(actor.organization_id)));
  }

  @Put("call-flow-settings")
  async updateSettings(@Req() request: RequestWithActor, @Body() payload: CallFlowSettingsPayload) {
    const actor = this.requireOfficeRole(request);

    if (typeof payload.configName !== "string") {
      apiError(400, "call_flow_config_name_invalid", "Configuration name must be a string.");
    }

    if (typeof payload.timeZone !== "string") {
      apiError(400, "call_flow_time_zone_invalid", "Time zone must be a string.");
    }

    if (typeof payload.greetingMode !== "string") {
      apiError(400, "call_flow_greeting_mode_invalid", "Greeting mode must be a string.");
    }

    if (typeof payload.openHoursAction !== "string") {
      apiError(400, "call_flow_open_hours_action_invalid", "Open-hours action must be a string.");
    }

    if (typeof payload.afterHoursAction !== "string") {
      apiError(400, "call_flow_after_hours_action_invalid", "After-hours action must be a string.");
    }

    if (!Array.isArray(payload.businessHours)) {
      apiError(400, "call_flow_business_hours_invalid", "Business hours must be an array.");
    }

    if (!Array.isArray(payload.ivrOptions)) {
      apiError(400, "call_flow_ivr_options_invalid", "IVR options must be an array.");
    }

    const updated = await this.callFlowSettingsService.updateSettings({
      configName: payload.configName,
      timeZone: payload.timeZone,
      greetingMode: payload.greetingMode as CallFlowGreetingMode,
      greetingText: this.readNullableString(payload.greetingText),
      openHoursAction: payload.openHoursAction as CallFlowAction,
      openHoursRouteTarget: this.readNullableString(payload.openHoursRouteTarget),
      afterHoursAction: payload.afterHoursAction as CallFlowAction,
      afterHoursRouteTarget: this.readNullableString(payload.afterHoursRouteTarget),
      whisperMessage: this.readNullableString(payload.whisperMessage),
      missedCallSmsTemplateKey: this.readNullableString(payload.missedCallSmsTemplateKey),
      businessHours: payload.businessHours.map((item) => this.normalizeBusinessHoursItem(item)),
      ivrOptions: payload.ivrOptions.map((item) => this.normalizeIvrItem(item)),
      organizationId: this.requireOrganizationId(actor.organization_id),
      updatedByAuthUserId: actor.user.id,
    });

    return apiSuccess(updated);
  }

  private requireOfficeRole(request: RequestWithActor) {
    const actor = request.actor;

    if (!actor || !canManageTelephonySettings(actor.role ?? actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office roles can manage call flow settings.");
    }

    return actor;
  }

  private requireOrganizationId(value: string | null | undefined) {
    const organizationId = value?.trim();

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for call flow settings.");
    }

    return organizationId;
  }

  private readNullableString(value: unknown) {
    if (typeof value !== "string") {
      return null;
    }

    return value;
  }

  private normalizeBusinessHoursItem(value: unknown) {
    if (!this.isRecord(value)) {
      apiError(400, "call_flow_business_hours_invalid", "Each business-hours row must be an object.");
    }

    if (typeof value.dayKey !== "string") {
      apiError(400, "call_flow_business_hours_day_invalid", "Business-hours day value is invalid.");
    }

    if (typeof value.enabled !== "boolean") {
      apiError(400, "call_flow_business_hours_enabled_invalid", "Business-hours enabled must be true or false.");
    }

    if (typeof value.openTime !== "string" || typeof value.closeTime !== "string") {
      apiError(400, "call_flow_business_hours_time_invalid", "Business-hours open and close times must be strings.");
    }

    return {
      dayKey: value.dayKey as CallFlowDayKey,
      enabled: value.enabled,
      openTime: value.openTime,
      closeTime: value.closeTime,
    };
  }

  private normalizeIvrItem(value: unknown) {
    if (!this.isRecord(value)) {
      apiError(400, "call_flow_ivr_option_invalid", "Each IVR option must be an object.");
    }

    return {
      digit: typeof value.digit === "string" ? value.digit : "",
      label: typeof value.label === "string" ? value.label : "",
      serviceType: typeof value.serviceType === "string" ? value.serviceType : null,
      routeTarget: typeof value.routeTarget === "string" ? value.routeTarget : null,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
