import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { assertMarketingPublisher, requireMarketingOfficeActor } from "./marketing-access";
import { MarketingContentService } from "./marketing-content.service";
import { MarketingOpportunityService } from "./marketing-opportunity.service";
import { MarketingProfileService } from "./marketing-profile.service";
import { MarketingService } from "./marketing.service";

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseMarketingCalendarRange(fromRaw?: string, toRaw?: string): { start: Date; end: Date } {
  const now = new Date();

  let start =
    typeof fromRaw === "string" && !Number.isNaN(Date.parse(fromRaw))
      ? new Date(fromRaw)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  let end =
    typeof toRaw === "string" && !Number.isNaN(Date.parse(toRaw))
      ? new Date(toRaw)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

  if (start.valueOf() > end.valueOf()) {
    const swap = start;
    start = end;
    end = swap;
  }

  return { start, end };
}

function readTransitionBody(payload: Record<string, unknown>) {
  if (!payload.action || typeof payload.action !== "string") {
    apiError(400, "marketing_transition_missing", "Field action must be supplied.");
  }

  return payload.action;
}

@UseGuards(SessionGuard)
@Controller("api/marketing")
export class MarketingController {
  constructor(
    private readonly marketingService: MarketingService,
    private readonly profileService: MarketingProfileService,
    private readonly contentService: MarketingContentService,
    private readonly opportunityService: MarketingOpportunityService,
  ) {}

  @Get("foundation")
  async getFoundation(@Req() request: RequestWithActor) {
    const actor = requireMarketingOfficeActor(request);

    return apiSuccess(
      await this.marketingService.buildFoundationResponse({
        organizationId: actor.organization_id,
        organizationName: actor.organization?.name ?? null,
        organizationSlug: actor.organization?.slug ?? null,
        role: actor.role,
      }),
    );
  }

  @Post("opportunities/refresh")
  async refreshOpportunities(@Req() request: RequestWithActor) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);

    return apiSuccess(await this.opportunityService.refreshOpportunities(actor.organization_id!));
  }

  @Get("opportunities")
  async listOpportunities(
    @Req() request: RequestWithActor,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("status") status?: string,
    @Query("opportunity_type") opportunityType?: string,
    @Query("warm_up") warmUp?: string,
  ) {
    const actor = requireMarketingOfficeActor(request);

    return apiSuccess(
      await this.opportunityService.listOpportunities({
        organizationId: actor.organization_id!,
        role: actor.role,
        warmUp: warmUp === "true" || warmUp === "1",
        limit: Math.min(readPositiveInt(limit, 50), 100),
        offset: readPositiveInt(offset, 0),
        status: status ?? undefined,
        opportunity_type: opportunityType ?? undefined,
      }),
    );
  }

  @Get("opportunities/:opportunityId")
  async getOpportunity(@Req() request: RequestWithActor, @Param("opportunityId") opportunityId: string) {
    const actor = requireMarketingOfficeActor(request);

    return apiSuccess(await this.opportunityService.getOpportunity(actor.organization_id!, opportunityId.trim()));
  }

  @Patch("opportunities/:opportunityId")
  async patchOpportunity(
    @Req() request: RequestWithActor,
    @Param("opportunityId") opportunityId: string,
    @Body() body: unknown,
  ) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);
    const payload = this.readObjectBody(body);
    const actionRaw = payload.action;
    const action =
      typeof actionRaw === "string"
        ? actionRaw.trim().toLowerCase()
        : "";

    if (action !== "dismiss" && action !== "archive") {
      apiError(400, "marketing_opportunity_action_invalid", 'Provide action "dismiss" or "archive".');
    }

    return apiSuccess(
      await this.opportunityService.patchLifecycle({
        organizationId: actor.organization_id!,
        actorUserId: actor.user.id,
        opportunityId: opportunityId.trim(),
        action,
      }),
    );
  }

  @Post("opportunities/:opportunityId/convert-draft")
  async convertOpportunityToDraft(
    @Req() request: RequestWithActor,
    @Param("opportunityId") opportunityId: string,
    @Body() body: unknown,
  ) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);
    const payload = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

    const titleOverride = typeof payload.title === "string" ? payload.title : undefined;
    const notesOverride = typeof payload.notes === "string" ? payload.notes : undefined;

    return apiSuccess(
      await this.opportunityService.convertToDraft({
        organizationId: actor.organization_id!,
        actorUserId: actor.user.id,
        opportunityId: opportunityId.trim(),
        titleOverride,
        notesOverride,
      }),
    );
  }

  @Get("profile")
  async getProfile(@Req() request: RequestWithActor) {
    const actor = requireMarketingOfficeActor(request);

    return apiSuccess(await this.profileService.getProfileReadOnly(actor.organization_id!));
  }

  @Patch("profile")
  async patchProfile(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requireMarketingOfficeActor(request);
    const payload = this.readObjectBody(body);

    return apiSuccess(
      await this.profileService.patchProfile(actor.organization_id!, payload),
    );
  }

  @Get("drafts")
  async listDrafts(
    @Req() request: RequestWithActor,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("workflow_state") workflowState?: string,
  ) {
    const actor = requireMarketingOfficeActor(request);

    return apiSuccess(
      await this.contentService.listDrafts(actor.organization_id!, {
        workflow_state: workflowState ?? undefined,
        limit: readPositiveInt(limit, 50),
        offset: readPositiveInt(offset, 0),
      }),
    );
  }

  @Post("drafts")
  async createDraft(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requireMarketingOfficeActor(request);
    const payload = this.readObjectBody(body);

    return apiSuccess(
      await this.contentService.createDraft(actor.organization_id!, actor.user.id, payload),
    );
  }

  @Get("drafts/:draftId")
  async getDraft(@Req() request: RequestWithActor, @Param("draftId") draftId: string) {
    const actor = requireMarketingOfficeActor(request);

    return apiSuccess(await this.contentService.getDraftDetail(actor.organization_id!, draftId.trim()));
  }

  @Patch("drafts/:draftId")
  async patchDraft(
    @Req() request: RequestWithActor,
    @Param("draftId") draftId: string,
    @Body() body: unknown,
  ) {
    const actor = requireMarketingOfficeActor(request);
    const payload = this.readObjectBody(body);

    return apiSuccess(
      await this.contentService.patchDraft(actor.organization_id!, actor.user.id, draftId.trim(), payload),
    );
  }

  @Patch("drafts/:draftId/variants/:variantId")
  async patchVariant(
    @Req() request: RequestWithActor,
    @Param("draftId") draftId: string,
    @Param("variantId") variantId: string,
    @Body() body: unknown,
  ) {
    const actor = requireMarketingOfficeActor(request);
    const payload = this.readObjectBody(body);

    return apiSuccess(
      await this.contentService.patchVariant(
        actor.organization_id!,
        actor.user.id,
        draftId.trim(),
        variantId.trim(),
        payload,
      ),
    );
  }

  @Post("drafts/:draftId/transition")
  async draftTransition(
    @Req() request: RequestWithActor,
    @Param("draftId") draftId: string,
    @Body() body: unknown,
  ) {
    const actor = requireMarketingOfficeActor(request);
    const payload = this.readObjectBody(body);

    const action = readTransitionBody(payload);
    return apiSuccess(
      await this.contentService.transition(actor.organization_id!, actor.user.id, draftId.trim(), action),
    );
  }

  @Get("calendar")
  async calendar(@Req() request: RequestWithActor, @Query("from") from?: string, @Query("to") to?: string) {
    const actor = requireMarketingOfficeActor(request);
    const range = parseMarketingCalendarRange(from, to);

    return apiSuccess(await this.contentService.getCalendar(actor.organization_id!, range));
  }

  private readObjectBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      apiError(400, "marketing_payload_expected", "Expected a JSON object body.");
    }

    return body as Record<string, unknown>;
  }
}
