import { Controller, Get, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { MarketingService } from "./marketing.service";

function isMarketingOfficeRole(role: string | null | undefined) {
  return role === "owner" || role === "admin" || role === "office_admin" || role === "dispatcher";
}

@UseGuards(SessionGuard)
@Controller("api/marketing")
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Get("foundation")
  async getFoundation(@Req() request: RequestWithActor) {
    const actor = this.requireMarketingOfficeActor(request);

    return apiSuccess(this.marketingService.getFoundationResponse({
      organizationId: actor.organization_id!,
      organizationName: actor.organization?.name ?? null,
      organizationSlug: actor.organization?.slug ?? null,
    }));
  }

  private requireMarketingOfficeActor(request: RequestWithActor) {
    const actor = request.actor;

    if (!actor?.user) {
      apiError(401, "marketing_session_required", "A valid session is required to access the Growth Center.");
    }

    if (!isMarketingOfficeRole(actor.role)) {
      apiError(403, "marketing_access_forbidden", "This account cannot access the Growth Center.");
    }

    if (!actor.organization_id) {
      apiError(403, "marketing_organization_required", "An active organization is required to access the Growth Center.");
    }

    return actor;
  }
}
