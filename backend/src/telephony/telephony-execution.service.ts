import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { apiError } from "../common/api-response";
import type { CallFlowSettings, CallFlowIvrOption } from "./call-flow-settings.service";

type CommandResult = {
  ok: boolean;
  status: "executed" | "simulated" | "skipped" | "failed";
  commandId: string | null;
  detail: string | null;
};

type RecentCallExecutionContext = {
  providerCallId: string | null;
  source: string;
  businessHoursStatus: string | null;
  callFlowAction: string | null;
  callFlowRouteTarget: string | null;
  selectedServiceType: string | null;
  selectedIvrDigit: string | null;
  callerNumber: string | null;
};

export type InitialExecutionPatch = {
  ivrStatus: string | null;
  routeExecutionStatus: string | null;
  routeExecutionDetail: string | null;
  routeCommandId: string | null;
  whisperText: string | null;
  whisperStatus: string | null;
  whisperCommandId: string | null;
  voicemailStatus: string | null;
};

export type IvrSelectionPatch = {
  selectedIvrDigit: string | null;
  selectedServiceType: string | null;
  ivrStatus: string | null;
  routeExecutionStatus: string | null;
  routeExecutionDetail: string | null;
  routeCommandId: string | null;
  whisperText: string | null;
  whisperStatus: string | null;
  whisperCommandId: string | null;
  callFlowRouteTarget: string | null;
  voicemailStatus: string | null;
};

export type OutboundDialResult = {
  status: "requested" | "simulated";
  provider: "telnyx";
  to: string;
  from: string;
  connectionId: string;
  callControlId: string | null;
  callLegId: string | null;
  callSessionId: string | null;
  detail: string;
};

export type OutboundDialerOptions = {
  fromNumbers: string[];
  defaultFrom: string | null;
};

export type WebrtcClientConfig = {
  enabled: boolean;
  login: string | null;
  password: string | null;
  callerNumber: string | null;
  sipHost: string;
  detail: string;
};

@Injectable()
export class TelephonyExecutionService {
  constructor(private readonly configService: ConfigService) {}

  getWebrtcClientConfig(): WebrtcClientConfig {
    const login = (this.configService.get<string>("TELNYX_WEBRTC_SIP_USERNAME") ?? "").trim() || null;
    const password = (this.configService.get<string>("TELNYX_WEBRTC_SIP_PASSWORD") ?? "").trim() || null;
    const callerNumber = this.normalizeDialNumber(this.configService.get<string>("TELNYX_WEBRTC_CALLER_NUMBER") ?? null)
      ?? this.normalizeDialNumber(this.configService.get<string>("TELNYX_OUTBOUND_FROM_NUMBER") ?? null)
      ?? this.normalizeDialNumber(this.configService.get<string>("TWILIO_FROM_NUMBER") ?? null);
    const sipHost = (this.configService.get<string>("TELNYX_WEBRTC_SIP_HOST") ?? "sip.telnyx.com").trim() || "sip.telnyx.com";

    if (!login || !password) {
      return {
        enabled: false,
        login: null,
        password: null,
        callerNumber,
        sipHost,
        detail: "Web dial audio is not configured yet. Set TELNYX_WEBRTC_SIP_USERNAME and TELNYX_WEBRTC_SIP_PASSWORD.",
      };
    }

    return {
      enabled: true,
      login,
      password,
      callerNumber,
      sipHost,
      detail: "Web dial audio is ready.",
    };
  }

  async getOutboundDialerOptions(): Promise<OutboundDialerOptions> {
    const configuredFrom = this.normalizeDialNumber(this.configService.get<string>("TELNYX_OUTBOUND_FROM_NUMBER") ?? null)
      ?? this.normalizeDialNumber(this.configService.get<string>("TWILIO_FROM_NUMBER") ?? null);
    const apiKey = (this.configService.get<string>("TELNYX_API_KEY") ?? "").trim();

    if (!apiKey) {
      return {
        fromNumbers: configuredFrom ? [configuredFrom] : [],
        defaultFrom: configuredFrom,
      };
    }

    const response = await fetch("https://api.telnyx.com/v2/phone_numbers?page[size]=100", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }).catch(() => null);

    if (!response?.ok) {
      return {
        fromNumbers: configuredFrom ? [configuredFrom] : [],
        defaultFrom: configuredFrom,
      };
    }

    const responseBody = await response.json().catch(() => null) as Record<string, unknown> | null;
    const rows = Array.isArray(responseBody?.data) ? responseBody.data : [];

    const fromNumbers = rows
      .map((row) => {
        if (typeof row !== "object" || row === null) {
          return null;
        }

        const record = row as Record<string, unknown>;
        const messagingRecord = typeof record.messaging === "object" && record.messaging !== null
          ? record.messaging as Record<string, unknown>
          : null;
        const candidate = typeof record.phone_number === "string"
          ? record.phone_number
          : typeof messagingRecord?.phone_number === "string"
            ? messagingRecord.phone_number
            : null;

        return this.normalizeDialNumber(candidate);
      })
      .filter((value): value is string => Boolean(value));

    const uniqueFromNumbers = [...new Set(fromNumbers)];
    if (configuredFrom && !uniqueFromNumbers.includes(configuredFrom)) {
      uniqueFromNumbers.unshift(configuredFrom);
    }

    return {
      fromNumbers: uniqueFromNumbers,
      defaultFrom: configuredFrom ?? uniqueFromNumbers[0] ?? null,
    };
  }

  async createOutboundDial(input: {
    to: string;
    from: string | null;
    connectionId: string | null;
    clientState: string | null;
  }): Promise<OutboundDialResult> {
    const to = this.normalizeDialNumber(input.to);

    if (!to) {
      apiError(400, "dial_to_invalid", "Destination phone number must be in E.164 format, for example +18259945336.");
    }

    const from = this.normalizeDialNumber(input.from)
      ?? this.normalizeDialNumber(this.configService.get<string>("TELNYX_OUTBOUND_FROM_NUMBER") ?? null)
      ?? this.normalizeDialNumber(this.configService.get<string>("TWILIO_FROM_NUMBER") ?? null);
    const connectionId = (
      input.connectionId
      ?? this.configService.get<string>("TELNYX_CALL_CONTROL_APP_ID")
      ?? this.configService.get<string>("TELNYX_CONNECTION_ID")
      ?? ""
    ).trim() || null;

    if (!from) {
      apiError(500, "dial_from_not_configured", "Dialer caller ID is not configured. Set TELNYX_OUTBOUND_FROM_NUMBER.");
    }

    if (!connectionId) {
      apiError(500, "dial_connection_not_configured", "Dialer Call Control App is not configured. Set TELNYX_CALL_CONTROL_APP_ID.");
    }

    const apiKey = (this.configService.get<string>("TELNYX_API_KEY") ?? "").trim();
    if (!apiKey) {
      return {
        status: "simulated",
        provider: "telnyx",
        to,
        from,
        connectionId,
        callControlId: `simulated-call-${randomUUID()}`,
        callLegId: null,
        callSessionId: null,
        detail: "Simulated outbound dial because TELNYX_API_KEY is not configured.",
      };
    }

    const requestBody: Record<string, unknown> = {
      connection_id: connectionId,
      to,
      from,
    };

    if (input.clientState?.trim()) {
      requestBody.client_state = input.clientState.trim();
    }

    const response = await fetch("https://api.telnyx.com/v2/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseBody = await response.json().catch(() => null) as Record<string, unknown> | null;
    const responseData = (typeof responseBody?.data === "object" && responseBody.data !== null)
      ? responseBody.data as Record<string, unknown>
      : null;
    const responseErrors = responseBody?.errors;

    const detailFromArray = Array.isArray(responseErrors)
      ? responseErrors.find((item) => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).detail === "string") as Record<string, unknown> | undefined
      : undefined;
    const detailFromObject = (typeof responseErrors === "object" && responseErrors !== null)
      ? responseErrors as Record<string, unknown>
      : null;
    const detail = typeof detailFromArray?.detail === "string"
      ? detailFromArray.detail
      : typeof detailFromObject?.detail === "string"
        ? detailFromObject.detail
        : typeof responseBody?.message === "string"
          ? responseBody.message
          : null;

    if (!response.ok) {
      apiError(
        response.status >= 400 && response.status < 500 ? response.status : 502,
        "dial_request_failed",
        detail ?? "Telnyx rejected outbound dial request.",
      );
    }

    return {
      status: "requested",
      provider: "telnyx",
      to,
      from,
      connectionId,
      callControlId: typeof responseData?.call_control_id === "string" ? responseData.call_control_id : null,
      callLegId: typeof responseData?.call_leg_id === "string" ? responseData.call_leg_id : null,
      callSessionId: typeof responseData?.call_session_id === "string" ? responseData.call_session_id : null,
      detail: detail ?? "Outbound dial requested.",
    };
  }

  async runInitialFlow(settings: CallFlowSettings, context: RecentCallExecutionContext): Promise<InitialExecutionPatch> {
    if (context.callFlowAction === "voicemail") {
      return this.startVoicemailFlow(settings, context);
    }

    if (settings.greetingMode === "ivr_menu" && settings.ivrOptions.length > 0) {
      return this.startIvrFlow(settings, context);
    }

    const routed = await this.executeRouting(settings, context, {
      selectedServiceType: context.selectedServiceType,
      selectedIvrDigit: context.selectedIvrDigit,
      routeTargetOverride: null,
      ivrStatus: null,
    });

    return {
      ivrStatus: routed.ivrStatus,
      routeExecutionStatus: routed.routeExecutionStatus,
      routeExecutionDetail: routed.routeExecutionDetail,
      routeCommandId: routed.routeCommandId,
      whisperText: routed.whisperText,
      whisperStatus: routed.whisperStatus,
      whisperCommandId: routed.whisperCommandId,
      voicemailStatus: routed.voicemailStatus,
    };
  }

  async handleIvrSelection(
    settings: CallFlowSettings,
    context: RecentCallExecutionContext,
    input: { digit: string | null },
  ): Promise<IvrSelectionPatch> {
    const digit = input.digit?.trim() ?? null;
    const option = digit
      ? settings.ivrOptions.find((candidate) => candidate.digit === digit)
      : null;

    if (!digit) {
      const fallback = await this.executeRouting(settings, context, {
        selectedServiceType: null,
        selectedIvrDigit: null,
        routeTargetOverride: null,
        ivrStatus: "no_input",
      });

      return {
        ...fallback,
        selectedIvrDigit: null,
        selectedServiceType: null,
      };
    }

    if (!option) {
      const fallback = await this.executeRouting(settings, context, {
        selectedServiceType: null,
        selectedIvrDigit: digit,
        routeTargetOverride: null,
        ivrStatus: "invalid_input",
      });

      return {
        ...fallback,
        selectedIvrDigit: digit,
        selectedServiceType: null,
      };
    }

    const routed = await this.executeRouting(settings, context, {
      selectedServiceType: option.serviceType,
      selectedIvrDigit: digit,
      routeTargetOverride: option.routeTarget,
      ivrStatus: "valid_input",
    });

    return {
      ...routed,
      selectedIvrDigit: digit,
      selectedServiceType: option.serviceType,
    };
  }

  private async startIvrFlow(settings: CallFlowSettings, context: RecentCallExecutionContext): Promise<InitialExecutionPatch> {
    if (!context.providerCallId) {
      return {
        ivrStatus: "gather_skipped_missing_call_id",
        routeExecutionStatus: "awaiting_ivr_input",
        routeExecutionDetail: "Provider call control id was missing; IVR execution was not started.",
        routeCommandId: null,
        whisperText: null,
        whisperStatus: null,
        whisperCommandId: null,
        voicemailStatus: null,
      };
    }

    const answerResult = await this.executeCallControlAction(context.providerCallId, "answer", null);
    const prompt = this.buildIvrPrompt(settings);
    const validDigits = settings.ivrOptions.map((item) => item.digit).join("");
    const gatherResult = await this.executeCallControlAction(context.providerCallId, "gather_using_speak", {
      payload: prompt,
      voice: "female",
      language: "en-US",
      maximum_digits: 1,
      timeout_millis: 5000,
      valid_digits: validDigits || undefined,
    });

    return {
      ivrStatus: gatherResult.ok ? (gatherResult.status === "simulated" ? "gather_simulated" : "gather_started") : "gather_failed",
      routeExecutionStatus: "awaiting_ivr_input",
      routeExecutionDetail: [answerResult.detail, gatherResult.detail].filter(Boolean).join(" | ") || "IVR gather requested.",
      routeCommandId: gatherResult.commandId,
      whisperText: null,
      whisperStatus: null,
      whisperCommandId: null,
      voicemailStatus: null,
    };
  }

  private async executeRouting(
    settings: CallFlowSettings,
    context: RecentCallExecutionContext,
    input: {
      selectedServiceType: string | null;
      selectedIvrDigit: string | null;
      routeTargetOverride: string | null;
      ivrStatus: string | null;
    },
  ): Promise<IvrSelectionPatch> {
    const effectiveRouteTarget = input.routeTargetOverride?.trim() || context.callFlowRouteTarget || null;
    const effectiveAction = context.callFlowAction;

    if (effectiveAction === "voicemail") {
      const voicemail = await this.startVoicemailFlow(settings, {
        ...context,
        selectedServiceType: input.selectedServiceType,
        selectedIvrDigit: input.selectedIvrDigit,
      });

      return {
        selectedIvrDigit: input.selectedIvrDigit,
        selectedServiceType: input.selectedServiceType,
        ivrStatus: input.ivrStatus,
        routeExecutionStatus: voicemail.routeExecutionStatus,
        routeExecutionDetail: voicemail.routeExecutionDetail,
        routeCommandId: voicemail.routeCommandId,
        whisperText: voicemail.whisperText,
        whisperStatus: voicemail.whisperStatus,
        whisperCommandId: voicemail.whisperCommandId,
        callFlowRouteTarget: effectiveRouteTarget,
        voicemailStatus: voicemail.voicemailStatus,
      };
    }

    if (effectiveAction === "after_hours_message") {
      const message = settings.greetingText?.trim() || "Thanks for calling Phoenix Fireplace. Our office is currently closed. Please leave a message or call back during business hours.";
      const speakResult = await this.executeCallControlAction(context.providerCallId, "speak", {
        payload: message,
        voice: "female",
        language: "en-US",
      });

      return {
        selectedIvrDigit: input.selectedIvrDigit,
        selectedServiceType: input.selectedServiceType,
        ivrStatus: input.ivrStatus,
        routeExecutionStatus: speakResult.ok ? (speakResult.status === "simulated" ? "message_simulated" : "message_played") : "message_failed",
        routeExecutionDetail: speakResult.detail ?? "After-hours message requested.",
        routeCommandId: speakResult.commandId,
        whisperText: null,
        whisperStatus: null,
        whisperCommandId: null,
        callFlowRouteTarget: effectiveRouteTarget,
        voicemailStatus: null,
      };
    }

    if (!effectiveRouteTarget) {
      return {
        selectedIvrDigit: input.selectedIvrDigit,
        selectedServiceType: input.selectedServiceType,
        ivrStatus: input.ivrStatus,
        routeExecutionStatus: "route_skipped_missing_target",
        routeExecutionDetail: "No route target was configured for this call path.",
        routeCommandId: null,
        whisperText: null,
        whisperStatus: null,
        whisperCommandId: null,
        callFlowRouteTarget: null,
        voicemailStatus: null,
      };
    }

    const whisperText = this.buildWhisperText(settings, context, input.selectedServiceType, input.selectedIvrDigit);
    const whisperResult = whisperText
      ? await this.executeCallControlAction(context.providerCallId, "speak", {
        payload: whisperText,
        voice: "female",
        language: "en-US",
      })
      : {
        ok: true,
        status: "skipped",
        commandId: null,
        detail: "Whisper playback not configured.",
      } satisfies CommandResult;
    const resolvedDestination = this.resolveRouteTargetValue(effectiveRouteTarget);
    const transferResult = resolvedDestination
      ? await this.executeCallControlAction(context.providerCallId, "transfer", { to: resolvedDestination })
      : {
        ok: false,
        status: "failed",
        commandId: null,
        detail: `Route target ${effectiveRouteTarget} is missing environment wiring.`,
      } satisfies CommandResult;

    return {
      selectedIvrDigit: input.selectedIvrDigit,
      selectedServiceType: input.selectedServiceType,
      ivrStatus: input.ivrStatus,
      routeExecutionStatus: transferResult.ok ? (transferResult.status === "simulated" ? "transfer_simulated" : "transfer_requested") : "transfer_failed",
      routeExecutionDetail: [whisperResult.detail, transferResult.detail].filter(Boolean).join(" | ") || "Transfer requested.",
      routeCommandId: transferResult.commandId,
      whisperText,
      whisperStatus: whisperText
        ? (whisperResult.ok ? (whisperResult.status === "simulated" ? "whisper_simulated" : "whisper_requested") : "whisper_failed")
        : null,
      whisperCommandId: whisperResult.commandId,
      callFlowRouteTarget: effectiveRouteTarget,
      voicemailStatus: null,
    };
  }

  private async startVoicemailFlow(settings: CallFlowSettings, context: RecentCallExecutionContext): Promise<InitialExecutionPatch> {
    const greeting = settings.greetingText?.trim()
      || "Thanks for calling Phoenix Fireplace. We are unavailable right now. Please leave your name, number, and a brief message after the tone.";

    const answerResult = await this.executeCallControlAction(context.providerCallId, "answer", null);
    const speakResult = await this.executeCallControlAction(context.providerCallId, "speak", {
      payload: greeting,
      voice: "female",
      language: "en-US",
    });
    const recordResult = await this.executeCallControlAction(context.providerCallId, "record_start", {
      format: "mp3",
      channels: "single",
      play_beep: true,
      timeout_secs: 120,
    });

    return {
      ivrStatus: null,
      routeExecutionStatus: recordResult.ok ? (recordResult.status === "simulated" ? "voicemail_simulated" : "voicemail_record_requested") : "voicemail_record_failed",
      routeExecutionDetail: [answerResult.detail, speakResult.detail, recordResult.detail].filter(Boolean).join(" | ") || "Voicemail flow requested.",
      routeCommandId: recordResult.commandId,
      whisperText: null,
      whisperStatus: null,
      whisperCommandId: null,
      voicemailStatus: recordResult.ok ? (recordResult.status === "simulated" ? "simulated" : "recording_requested") : "recording_failed",
    };
  }

  private buildIvrPrompt(settings: CallFlowSettings) {
    const baseGreeting = settings.greetingText?.trim() || "Thanks for calling Phoenix Fireplace.";
    const optionText = settings.ivrOptions
      .map((item) => `Press ${item.digit} for ${item.label}.`)
      .join(" ");

    return `${baseGreeting} ${optionText}`.trim();
  }

  private buildWhisperText(
    settings: CallFlowSettings,
    context: RecentCallExecutionContext,
    selectedServiceType: string | null,
    selectedIvrDigit: string | null,
  ) {
    const parts = [
      settings.whisperMessage?.trim() || null,
      selectedServiceType ? `Service ${selectedServiceType.replace(/_/g, " ")}` : null,
      context.source ? `Source ${context.source.replace(/_/g, " ")}` : null,
      context.businessHoursStatus === "after_hours" ? "After hours" : "Open hours",
      selectedIvrDigit ? `Option ${selectedIvrDigit}` : null,
      context.callerNumber ? `Caller ${context.callerNumber}` : null,
    ].filter(Boolean);

    return parts.length ? parts.join(". ") + "." : null;
  }

  private resolveRouteTargetValue(routeTarget: string) {
    const envKey = `CALL_ROUTE_TARGET_${routeTarget.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}`;
    const configured = (this.configService.get<string>(envKey) ?? "").trim();
    return configured || null;
  }

  private async executeCallControlAction(callControlId: string | null, action: string, payload: Record<string, unknown> | null): Promise<CommandResult> {
    if (!callControlId) {
      return {
        ok: false,
        status: "failed",
        commandId: null,
        detail: `Call control id was missing for ${action}.`,
      };
    }

    const apiKey = (this.configService.get<string>("TELNYX_API_KEY") ?? "").trim();
    if (!apiKey) {
      return {
        ok: true,
        status: "simulated",
        commandId: `simulated-${action}-${randomUUID()}`,
        detail: `Simulated ${action} because TELNYX_API_KEY is not configured.`,
      };
    }

    const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/${action}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload ?? {}),
    });

    let responseBody: Record<string, unknown> | null = null;
    try {
      responseBody = await response.json() as Record<string, unknown>;
    } catch {
      responseBody = null;
    }

    const errorList = Array.isArray(responseBody?.errors) ? responseBody.errors : [];
    const firstError = errorList.length > 0 && typeof errorList[0] === "object" && errorList[0] !== null
      ? errorList[0] as Record<string, unknown>
      : null;
    const dataRecord = typeof responseBody?.data === "object" && responseBody.data !== null
      ? responseBody.data as Record<string, unknown>
      : null;
    const detail = typeof firstError?.detail === "string"
      ? firstError.detail
      : typeof responseBody?.message === "string"
        ? responseBody.message
        : null;
    const commandId = typeof dataRecord?.id === "string"
      ? dataRecord.id
      : typeof dataRecord?.command_id === "string"
        ? dataRecord.command_id
        : null;

    if (!response.ok) {
      return {
        ok: false,
        status: "failed",
        commandId,
        detail: detail ?? `${action} failed with status ${response.status}.`,
      };
    }

    return {
      ok: true,
      status: "executed",
      commandId,
      detail: detail ?? `${action} requested successfully.`,
    };
  }

  private normalizeDialNumber(value: string | null | undefined) {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim().replace(/[\s\-().]/g, "");
    if (!normalized) {
      return null;
    }

    if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) {
      return null;
    }

    return normalized.startsWith("+") ? normalized : `+${normalized}`;
  }
}
