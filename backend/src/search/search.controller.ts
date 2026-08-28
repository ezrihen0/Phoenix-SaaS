import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";

import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import type { GlobalSearchApiResponse } from "./search.contract";
import { OfficeSearchAccessGuard } from "./guards/office-search-access.guard";
import { SearchService } from "./search.service";

@Controller("api/search")
@UseGuards(SessionGuard, OperationalAccessGuard, OfficeSearchAccessGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Req() request: RequestWithActor,
    @Query("q") query: string | undefined,
  ): Promise<GlobalSearchApiResponse> {
    const organizationId = request.actor?.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for search.");
    }

    return apiSuccess(await this.searchService.search(query, organizationId));
  }
}
