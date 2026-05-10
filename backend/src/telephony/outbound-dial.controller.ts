import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { canDialFromTelephony } from "./telephony-role";
import { TelephonyExecutionService } from "./telephony-execution.service";

type DialBody = {
  to?: string;
  from?: string | null;
  connectionId?: string | null;
  clientState?: string | null;
};

@Controller("api/telephony")
@UseGuards(SessionGuard)
export class OutboundDialController {
  constructor(private readonly telephonyExecutionService: TelephonyExecutionService) {}

  @Get("dial")
  dialMethodNotAllowed() {
    apiError(405, "method_not_allowed", "Use POST /api/telephony/dial to place outbound calls.");
  }

  @Get("dialer-options")
  async dialerOptions(@Req() request: RequestWithActor) {
    const actor = request.actor;
    if (!actor || !canDialFromTelephony(actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office users can access dialer options.");
    }

    return apiSuccess(await this.telephonyExecutionService.getOutboundDialerOptions());
  }

  @Get("webrtc-config")
  webrtcConfig(@Req() request: RequestWithActor) {
    const actor = request.actor;
    if (!actor || !canDialFromTelephony(actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office users can access web dial configuration.");
    }

    return apiSuccess(this.telephonyExecutionService.getWebrtcClientConfig());
  }

  @Post("dial")
  async dial(
    @Req() request: RequestWithActor,
    @Body() body: DialBody,
  ) {
    const actor = request.actor;
    if (!actor || !canDialFromTelephony(actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office users can place outbound calls.");
    }

    const to = typeof body.to === "string" ? body.to.trim() : "";
    if (!to) {
      apiError(400, "dial_to_required", "Destination phone number is required.");
    }

    const result = await this.telephonyExecutionService.createOutboundDial({
      to,
      from: typeof body.from === "string" ? body.from : null,
      connectionId: typeof body.connectionId === "string" ? body.connectionId : null,
      clientState: typeof body.clientState === "string" ? body.clientState : null,
    });

    return apiSuccess(result);
  }
}
