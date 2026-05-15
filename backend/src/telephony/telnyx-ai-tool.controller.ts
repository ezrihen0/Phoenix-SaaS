import { Controller, Headers, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";

import { TelnyxAiAvailabilityToolService } from "./telnyx-ai-availability-tool.service";

type RawBodyRequest = Request & {
  rawBody?: Buffer | string;
  body: Buffer | string | Record<string, unknown>;
};

/**
 * Telnyx AI Assistant HTTP tools (unsigned JSON bodies — verify Ed25519 headers like voice webhooks).
 */
@Controller("telephony/telnyx")
export class TelnyxAiToolController {
  constructor(private readonly availabilityToolService: TelnyxAiAvailabilityToolService) {}

  /**
   * Phase 1.5B — read-only availability heuristic for the Amber intake assistant.
   * Telnyx correlates via `x-telnyx-call-control-id` header on tool HTTP requests.
   */
  @Post("tools/get-availability")
  @HttpCode(200)
  async getAvailability(
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

    const hdrs = request.headers as Record<string, string | string[] | undefined>;
    const cc =
      (typeof hdrs["x-telnyx-call-control-id"] === "string" ? hdrs["x-telnyx-call-control-id"] : null)
      ?? (Array.isArray(hdrs["x-telnyx-call-control-id"])
        ? hdrs["x-telnyx-call-control-id"][0]
        : null);

    return this.availabilityToolService.handleGetAvailability({
      rawBody,
      signature: signature ?? null,
      timestamp: timestamp ?? null,
      callControlIdHeader: cc?.trim() ?? null,
    });
  }
}
