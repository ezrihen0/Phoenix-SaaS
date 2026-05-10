import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { isTelephonyOfficeRole } from "./telephony-role";
import { TelnyxWebhookService } from "./telnyx-webhook.service";

type SendCustomerTextPayload = {
  body?: unknown;
};

@UseGuards(SessionGuard)
@Controller("api/telephony/customers/:customerId/messages")
export class CustomerTextConversationsController {
  constructor(private readonly telnyxWebhookService: TelnyxWebhookService) {}

  @Get()
  async listConversation(
    @Req() request: RequestWithActor,
    @Param("customerId") customerId: string,
    @Query("limit") limitRaw: string | undefined,
  ) {
    this.requireOfficeActor(request);

    const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
    return apiSuccess(await this.telnyxWebhookService.listCustomerTextThread(
      customerId,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    ));
  }

  @Post("mark-read")
  async markConversationRead(
    @Req() request: RequestWithActor,
    @Param("customerId") customerId: string,
    @Query("limit") limitRaw: string | undefined,
  ) {
    this.requireOfficeActor(request);

    const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
    return apiSuccess(await this.telnyxWebhookService.markCustomerTextThreadRead(
      customerId,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    ));
  }

  @Post()
  async sendMessage(
    @Req() request: RequestWithActor,
    @Param("customerId") customerId: string,
    @Body() payload: SendCustomerTextPayload,
  ) {
    this.requireOfficeActor(request);

    if (typeof payload.body !== "string") {
      apiError(400, "customer_sms_body_required", "Text message body is required.");
    }

    return apiSuccess(await this.telnyxWebhookService.sendCustomerText(customerId, payload.body));
  }

  private requireOfficeActor(request: RequestWithActor) {
    const actor = request.actor;

    if (!actor || !isTelephonyOfficeRole(actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office roles can access customer text conversations.");
    }
  }
}
