import { Body, Controller, Headers, HttpCode, NotFoundException, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";

import { TelnyxWebhookService } from "./telnyx-webhook.service";

@Controller("telephony/twilio/messages")
export class TwilioMessagesWebhookController {
  constructor(
    private readonly configService: ConfigService,
    private readonly telnyxWebhookService: TelnyxWebhookService,
  ) {}

  @Post("webhook")
  @HttpCode(200)
  async handleWebhook(
    @Req() request: Request,
    @Body() payload: Record<string, unknown> | undefined,
    @Headers("x-twilio-signature") signature: string | undefined,
    @Res() response: Response,
  ) {
    if (this.configService.get<string>("TWILIO_MESSAGES_WEBHOOK_ENABLED")?.trim().toLowerCase() !== "true") {
      throw new NotFoundException("Twilio message webhook compatibility is disabled.");
    }

    this.verifyTwilioSignature(request, payload ?? {}, signature);

    await this.telnyxWebhookService.processTwilioMessageWebhook(payload ?? {});
    return response.type("text/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
  }

  private verifyTwilioSignature(
    request: Request,
    payload: Record<string, unknown>,
    signature: string | undefined,
  ) {
    const authToken = this.configService.get<string>("TWILIO_AUTH_TOKEN")?.trim() ?? "";
    const configuredUrl = this.configService.get<string>("TWILIO_MESSAGES_WEBHOOK_URL")?.trim()
      ?? this.configService.get<string>("PUBLIC_BASE_URL")?.trim();

    if (!authToken || !configuredUrl) {
      throw new UnauthorizedException("Twilio message webhook signature verification is not configured.");
    }

    const canonicalUrl = configuredUrl.includes("/telephony/twilio/messages/webhook")
      ? configuredUrl
      : `${configuredUrl.replace(/\/$/, "")}${request.originalUrl}`;
    const signedPayload = Object.keys(payload)
      .sort()
      .reduce((value, key) => `${value}${key}${this.stringifyTwilioValue(payload[key])}`, canonicalUrl);
    const expected = createHmac("sha1", authToken).update(signedPayload).digest("base64");

    if (!this.constantTimeEquals(expected, signature?.trim() ?? "")) {
      throw new UnauthorizedException("Twilio message webhook signature verification failed.");
    }
  }

  private stringifyTwilioValue(value: unknown) {
    if (value === null || value === undefined) {
      return "";
    }

    if (Array.isArray(value)) {
      return value.map((item) => String(item ?? "")).join(",");
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  private constantTimeEquals(expected: string, actual: string) {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);

    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  }
}
