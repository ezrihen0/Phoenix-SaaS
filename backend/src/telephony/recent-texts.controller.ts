import { Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { isTelephonyOfficeRole } from "./telephony-role";
import { TelnyxWebhookService } from "./telnyx-webhook.service";

@UseGuards(SessionGuard)
@Controller("api/telephony/recent-texts")
export class RecentTextsController {
  constructor(private readonly telnyxWebhookService: TelnyxWebhookService) {}

  @Get()
  async listRecentTexts(
    @Req() request: RequestWithActor,
    @Query("limit") limitRaw: string | undefined,
  ) {
    this.requireOfficeActor(request);

    const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
    return apiSuccess(await this.telnyxWebhookService.listRecentTexts(
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    ));
  }

  @Get("dashboard")
  async listMessagingDashboard(
    @Req() request: RequestWithActor,
    @Query("limit") limitRaw: string | undefined,
  ) {
    this.requireOfficeActor(request);

    const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
    return apiSuccess(await this.telnyxWebhookService.listMessagingDashboard(
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    ));
  }

  @Get("unknown/:phoneKey/messages")
  async listUnknownConversation(
    @Req() request: RequestWithActor,
    @Param("phoneKey") phoneKey: string,
    @Query("limit") limitRaw: string | undefined,
  ) {
    this.requireOfficeActor(request);

    const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
    return apiSuccess(await this.telnyxWebhookService.listUnknownTextThread(
      phoneKey,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    ));
  }

  @Post("mark-read")
  async markAllRead(
    @Req() request: RequestWithActor,
    @Query("limit") limitRaw: string | undefined,
  ) {
    this.requireOfficeActor(request);

    const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
    return apiSuccess(await this.telnyxWebhookService.markAllRecentTextsRead(
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    ));
  }

  private requireOfficeActor(request: RequestWithActor) {
    const actor = request.actor;

    if (!actor || !isTelephonyOfficeRole(actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office roles can access recent texts.");
    }
  }
}
