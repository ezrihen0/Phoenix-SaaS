import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import type { GlobalSearchApiResponse } from "./search.contract";
import { OfficeSearchAccessGuard } from "./guards/office-search-access.guard";
import { SearchService } from "./search.service";

@Controller("api/search")
@UseGuards(SessionGuard, OfficeSearchAccessGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Req() _request: RequestWithActor,
    @Query("q") query: string | undefined,
  ): Promise<GlobalSearchApiResponse> {
    return apiSuccess(await this.searchService.search(query));
  }
}
