import { Controller, Get, Req, UseGuards } from "@nestjs/common";

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
    const payload = await this.customerPortalService.getPortalHome(customerId);
    return apiSuccess(payload);
  }
}
