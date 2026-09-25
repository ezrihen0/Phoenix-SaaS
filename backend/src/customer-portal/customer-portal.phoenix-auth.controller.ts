import { Body, Controller, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";

import { apiError, apiSuccess } from "../common/api-response";
import { PhoenixIntegrationGuard } from "../integrations/phoenix/phoenix-integration.guard";
import { CustomerPortalService } from "./customer-portal.service";

type RedeemPayload = {
  token?: unknown;
};

function parseRedeemPayload(payload: RedeemPayload) {
  if (typeof payload.token !== "string" || !payload.token.trim()) {
    apiError(400, "invalid_magic_link_payload", "token is required.");
  }

  return payload.token.trim();
}

@Controller("api/portal/auth")
@UseGuards(PhoenixIntegrationGuard)
export class CustomerPortalPhoenixAuthController {
  constructor(private readonly customerPortalService: CustomerPortalService) {}

  @Post("redeem")
  async redeem(
    @Body() payload: RedeemPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = parseRedeemPayload(payload);
    const redeemed = await this.customerPortalService.redeemMagicLinkToken(token, request, response, {
      setSessionCookie: false,
    });

    if (!redeemed.ok) {
      apiError(401, redeemed.code, "The portal link is invalid or no longer available.");
    }

    return apiSuccess({
      session_token: redeemed.session_token,
      customer_id: redeemed.customer_id,
      organization_id: redeemed.organization_id,
      session_expires_at: redeemed.session_expires_at,
    });
  }
}
