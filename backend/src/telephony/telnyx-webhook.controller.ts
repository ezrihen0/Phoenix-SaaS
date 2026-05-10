import { Controller, Headers, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";

import { apiSuccess } from "../common/api-response";
import { TelnyxWebhookService } from "./telnyx-webhook.service";

type RawBodyRequest = Request & {
  rawBody?: Buffer | string;
  body: Buffer | string;
};

@Controller("telephony/telnyx")
export class TelnyxWebhookController {
  constructor(private readonly telnyxWebhookService: TelnyxWebhookService) {}

  @Post("webhook")
  @HttpCode(200)
  async handleWebhook(
    @Req() request: RawBodyRequest,
    @Headers("telnyx-signature-ed25519") signature: string | undefined,
    @Headers("telnyx-timestamp") timestamp: string | undefined,
  ) {
    const rawSource = request.rawBody ?? request.body;
    const rawBody = Buffer.isBuffer(rawSource)
      ? rawSource
      : Buffer.from(
        typeof rawSource === "string"
          ? rawSource
          : JSON.stringify(rawSource ?? {}),
        "utf8",
      );

    const result = await this.telnyxWebhookService.processWebhook(rawBody, signature ?? null, timestamp ?? null);
    return apiSuccess(result);
  }
}
