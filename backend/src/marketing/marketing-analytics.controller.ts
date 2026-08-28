import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";

import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { requireMarketingOfficeActor } from "./marketing-access";
import { MarketingAnalyticsService } from "./marketing-analytics.service";

@UseGuards(SessionGuard, OperationalAccessGuard)
@Controller("api/marketing")
export class MarketingAnalyticsController {
  constructor(private readonly analyticsService: MarketingAnalyticsService) {}

  @Get("analytics/summary")
  async getSummary(
    @Req() request: RequestWithActor,
    @Query("preset") preset?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const actor = requireMarketingOfficeActor(request);

    return apiSuccess(
      await this.analyticsService.buildSummaryPayload(actor.organization_id!, {
        preset,
        from,
        to,
      }),
    );
  }
}
