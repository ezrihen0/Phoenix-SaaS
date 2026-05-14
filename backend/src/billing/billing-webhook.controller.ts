import { Controller, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";

import { apiSuccess } from "../common/api-response";
import { StripeWebhookService } from "./stripe/stripe-webhook.service";

type RequestWithRawBody = Request & {
  rawBody?: Buffer;
};

@Controller("api/billing/webhooks")
export class BillingWebhookController {
  constructor(private readonly stripeWebhookService: StripeWebhookService) {}

  @Post("stripe")
  @HttpCode(200)
  async handleStripe(@Req() request: RequestWithRawBody) {
    const signatureHeader = request.headers["stripe-signature"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    await this.stripeWebhookService.handleWebhook(request.rawBody, signature);
    return apiSuccess({ received: true });
  }
}
