import { Controller, Param, Post, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { requirePermission } from "../auth/permissions";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { CustomerPortalService } from "./customer-portal.service";

@Controller("api/portal/staff")
@UseGuards(SessionGuard)
export class CustomerPortalStaffController {
  constructor(private readonly customerPortalService: CustomerPortalService) {}

  @Post("customers/:customerId/magic-links")
  async mintPortalMagicLink(@Req() request: RequestWithActor, @Param("customerId") customerId: string) {
    const actor = requirePermission(
      request.actor,
      "customers.manage",
      "customer_manage_forbidden",
      "This account cannot manage customer portal links.",
    );
    const organizationId = actor.organization_id?.trim();
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for this action.");
    }

    const payload = await this.customerPortalService.createMagicLinkForStaff({
      organizationId,
      customerId,
      actorProfileId: actor.profile.id,
      request,
    });

    return apiSuccess(payload);
  }
}
