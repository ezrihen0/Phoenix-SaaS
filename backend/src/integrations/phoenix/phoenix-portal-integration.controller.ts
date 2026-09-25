import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";

import { apiError, apiSuccess } from "../../common/api-response";
import { CustomerPortalService } from "../../customer-portal/customer-portal.service";
import { PhoenixIntegrationGuard } from "./phoenix-integration.guard";

type MintPayload = {
  organizationId?: unknown;
  customerId?: unknown;
  email?: unknown;
};

function parseMintPayload(payload: MintPayload) {
  const organizationId = typeof payload.organizationId === "string" ? payload.organizationId.trim() : "";
  if (!organizationId) {
    apiError(400, "invalid_phoenix_portal_mint_payload", "organizationId is required.");
  }

  const customerId = typeof payload.customerId === "string" ? payload.customerId.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim() : "";

  if (!customerId && !email) {
    apiError(400, "invalid_phoenix_portal_mint_payload", "customerId or email is required.");
  }

  if (customerId && email) {
    apiError(400, "invalid_phoenix_portal_mint_payload", "Provide customerId or email, not both.");
  }

  return { organizationId, customerId: customerId || null, email: email || null };
}

@Controller("api/integrations/phoenix/portal")
@UseGuards(PhoenixIntegrationGuard)
export class PhoenixPortalIntegrationController {
  constructor(private readonly customerPortalService: CustomerPortalService) {}

  @Post("magic-link")
  async mintMagicLink(@Body() payload: MintPayload, @Req() request: Request) {
    const parsed = parseMintPayload(payload);
    const minted = await this.customerPortalService.createMagicLinkForPhoenixIntegration({
      organizationId: parsed.organizationId,
      customerId: parsed.customerId,
      email: parsed.email,
      request,
    });

    return apiSuccess(minted);
  }
}
