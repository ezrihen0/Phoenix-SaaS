import { Body, Controller, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";

import { apiError, apiSuccess } from "../common/api-response";
import { PhoenixIntegrationGuard } from "../integrations/phoenix/phoenix-integration.guard";
import { CustomerPortalService } from "./customer-portal.service";
import { PortalEmailOtpService } from "./portal-email-otp.service";

type RedeemPayload = {
  token?: unknown;
};

type OtpSendPayload = {
  email?: unknown;
  organizationId?: unknown;
};

type OtpVerifyPayload = {
  email?: unknown;
  code?: unknown;
  organizationId?: unknown;
};

function parseRedeemPayload(payload: RedeemPayload) {
  if (typeof payload.token !== "string" || !payload.token.trim()) {
    apiError(400, "invalid_magic_link_payload", "token is required.");
  }

  return payload.token.trim();
}

function parseOrganizationId(payload: { organizationId?: unknown }, configService: ConfigService) {
  const fromBody = typeof payload.organizationId === "string" ? payload.organizationId.trim() : "";
  if (fromBody) {
    return fromBody;
  }

  const fromEnv =
    configService.get<string>("PHOENIX_INTEGRATION_ORGANIZATION_ID")?.trim()
    || configService.get<string>("WIZFIELD_ORGANIZATION_ID")?.trim()
    || configService.get<string>("PHOENIX_WIZFIELD_ORGANIZATION_ID")?.trim()
    || "";

  if (!fromEnv) {
    apiError(400, "invalid_portal_auth_payload", "organizationId is required.");
  }

  return fromEnv;
}

@Controller("api/portal/auth")
@UseGuards(PhoenixIntegrationGuard)
export class CustomerPortalPhoenixAuthController {
  constructor(
    private readonly customerPortalService: CustomerPortalService,
    private readonly portalEmailOtpService: PortalEmailOtpService,
    private readonly configService: ConfigService,
  ) {}

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
      redirect_path: redeemed.redirect_path,
      portal_identity_id: redeemed.portal_identity_id,
    });
  }

  @Post("otp/send")
  async sendOtp(@Body() payload: OtpSendPayload, @Req() request: Request) {
    const organizationId = parseOrganizationId(payload, this.configService);
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    if (!email) {
      apiError(400, "invalid_portal_otp_payload", "email is required.");
    }

    const result = await this.portalEmailOtpService.sendOtp({ organizationId, email, request });
    return apiSuccess(result);
  }

  @Post("otp/verify")
  async verifyOtp(
    @Body() payload: OtpVerifyPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const organizationId = parseOrganizationId(payload, this.configService);
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    if (!email || !code) {
      apiError(400, "invalid_portal_otp_payload", "email and code are required.");
    }

    const verified = await this.portalEmailOtpService.verifyOtp({
      organizationId,
      email,
      code,
      request,
      response,
      setSessionCookie: false,
    });

    return apiSuccess({
      session_token: verified.session_token,
      customer_id: verified.customer_id,
      organization_id: verified.organization_id,
      session_expires_at: verified.session_expires_at,
      redirect_path: verified.redirect_path,
      portal_identity_id: verified.portal_identity_id,
    });
  }
}
