import { Body, Controller, HttpCode, Post, Res } from "@nestjs/common";
import type { Response } from "express";

import { TelnyxWebhookService } from "./telnyx-webhook.service";

@Controller("telephony/twilio/messages")
export class TwilioMessagesWebhookController {
  constructor(private readonly telnyxWebhookService: TelnyxWebhookService) {}

  @Post("webhook")
  @HttpCode(200)
  async handleWebhook(
    @Body() payload: Record<string, unknown> | undefined,
    @Res() response: Response,
  ) {
    await this.telnyxWebhookService.processTwilioMessageWebhook(payload ?? {});
    response.type("text/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
  }
}
