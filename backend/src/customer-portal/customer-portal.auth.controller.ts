import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";

import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithPortalSession } from "../common/request-types";
import { CustomerPortalService } from "./customer-portal.service";
import { PortalSessionGuard } from "./portal-session.guard";

type RedeemPayload = {
  token?: unknown;
};

function parseRedeemPayload(payload: RedeemPayload) {
  if (typeof payload.token !== "string" || !payload.token.trim()) {
    apiError(400, "invalid_magic_link_payload", "token is required.");
  }

  return payload.token.trim();
}

@Controller("api/portal")
export class CustomerPortalAuthController {
  constructor(private readonly customerPortalService: CustomerPortalService) {}

  @Post("magic-links/redeem")
  async redeem(
    @Body() payload: RedeemPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = parseRedeemPayload(payload);
    const redeemed = await this.customerPortalService.redeemMagicLinkToken(token, request, response);

    if (!redeemed.ok) {
      apiError(401, redeemed.code, "The portal link is invalid or no longer available.");
    }

    return apiSuccess({
      customer_id: redeemed.customer_id,
      session_expires_at: redeemed.session_expires_at,
    });
  }

  @Get("session")
  @UseGuards(PortalSessionGuard)
  async session(@Req() request: RequestWithPortalSession) {
    return apiSuccess({
      customer_id: request.portalSession?.customer_id ?? null,
      session_expires_at: request.portalSession?.session.expires_at.toISOString() ?? null,
      is_preview: request.portalSession?.is_preview ?? false,
      is_read_only: request.portalSession?.is_read_only ?? false,
    });
  }

  @Post("logout")
  @UseGuards(PortalSessionGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.customerPortalService.logoutPortalSession(request, response);
    return apiSuccess({ cleared: true });
  }
}
