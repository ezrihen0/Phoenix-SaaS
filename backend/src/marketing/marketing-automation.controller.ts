import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { assertMarketingPublisher, requireMarketingOfficeActor } from "./marketing-access";
import { MarketingAutomationService } from "./marketing-automation.service";

function readObjectBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    apiError(400, "marketing_body_invalid", "Request body must be a JSON object.");
  }

  return body as Record<string, unknown>;
}

@UseGuards(SessionGuard, OperationalAccessGuard)
@Controller("api/marketing")
export class MarketingAutomationController {
  constructor(private readonly automationService: MarketingAutomationService) {}

  @Get("automation-rules")
  async listRules(@Req() request: RequestWithActor) {
    const actor = requireMarketingOfficeActor(request);
    return apiSuccess(await this.automationService.listRules(actor.organization_id!));
  }

  @Post("automation-rules")
  async createRule(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);
    const payload = readObjectBody(body);

    return apiSuccess(
      await this.automationService.createRule(actor.organization_id!, actor.user.id, payload),
    );
  }

  @Get("automation-rules/:ruleId")
  async getRule(@Req() request: RequestWithActor, @Param("ruleId") ruleId: string) {
    const actor = requireMarketingOfficeActor(request);
    return apiSuccess(await this.automationService.getRule(actor.organization_id!, ruleId.trim()));
  }

  @Patch("automation-rules/:ruleId")
  async patchRule(
    @Req() request: RequestWithActor,
    @Param("ruleId") ruleId: string,
    @Body() body: unknown,
  ) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);
    const payload = readObjectBody(body);

    return apiSuccess(
      await this.automationService.updateRule(actor.organization_id!, ruleId.trim(), actor.user.id, payload),
    );
  }

  @Delete("automation-rules/:ruleId")
  async deleteRule(@Req() request: RequestWithActor, @Param("ruleId") ruleId: string) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);
    return apiSuccess(await this.automationService.deleteRule(actor.organization_id!, ruleId.trim()));
  }

  @Post("automation-rules/:ruleId/preview")
  async previewRule(
    @Req() request: RequestWithActor,
    @Param("ruleId") ruleId: string,
    @Body() body: unknown,
  ) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);
    const payload = readObjectBody(body);
    const opportunityIdRaw = payload.opportunity_id;
    const opportunityId =
      typeof opportunityIdRaw === "string" ? opportunityIdRaw.trim()
      : typeof opportunityIdRaw === "number" ? `${opportunityIdRaw}`.trim()
      : "";

    if (!opportunityId.length) {
      apiError(400, "marketing_automation_preview_invalid", 'Field opportunity_id must be a non-empty string.');
    }

    return apiSuccess(
      await this.automationService.previewRule(actor.organization_id!, ruleId.trim(), opportunityId),
    );
  }

  @Get("automation-runs")
  async listRuns(
    @Req() request: RequestWithActor,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("rule_id") ruleId?: string,
  ) {
    const actor = requireMarketingOfficeActor(request);
    const q = this.automationService.buildListRunsQueryParts({ limit, offset, ruleId });

    return apiSuccess(
      await this.automationService.listRuns({
        organizationId: actor.organization_id!,
        ruleId: q.ruleId,
        limit: q.limit,
        offset: q.offset,
      }),
    );
  }

  @Get("automation-runs/:runId")
  async getRun(@Req() request: RequestWithActor, @Param("runId") runId: string) {
    const actor = requireMarketingOfficeActor(request);
    return apiSuccess(await this.automationService.getRun(actor.organization_id!, runId.trim()));
  }
}
