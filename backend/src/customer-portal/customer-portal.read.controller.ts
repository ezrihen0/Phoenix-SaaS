import { Controller, Get, Req, UnauthorizedException, UseGuards } from "@nestjs/common";

import { apiSuccess } from "../common/api-response";
import type { RequestWithPortalSession } from "../common/request-types";
import { CustomerPortalService } from "./customer-portal.service";
import { PortalSessionGuard } from "./portal-session.guard";

@Controller("api/portal")
@UseGuards(PortalSessionGuard)
export class CustomerPortalReadController {
  constructor(private readonly customerPortalService: CustomerPortalService) {}

  @Get("home")
  async home(@Req() request: RequestWithPortalSession) {
    const customerId = request.portalSession!.customer_id;
    const organizationId = request.portalSession!.session.organization_id?.trim() ?? "";
    if (!organizationId) {
      throw new UnauthorizedException({
        error: {
          code: "portal_organization_missing",
          message: "This portal session is missing organization context.",
        },
      });
    }

    const payload = await this.customerPortalService.getPortalHome(organizationId, customerId);
    return apiSuccess(payload);
  }
}
