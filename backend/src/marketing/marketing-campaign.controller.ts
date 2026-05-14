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

import { SessionGuard } from "../auth/session.guard";
import { apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { assertMarketingPublisher, requireMarketingOfficeActor } from "./marketing-access";
import { MarketingCampaignService } from "./marketing-campaign.service";

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

@UseGuards(SessionGuard)
@Controller("api/marketing")
export class MarketingCampaignController {
  constructor(private readonly campaignService: MarketingCampaignService) {}

  @Get("campaigns")
  async listCampaigns(
    @Req() request: RequestWithActor,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("status") status?: string,
    @Query("include_archived") includeArchived?: string,
  ) {
    const actor = requireMarketingOfficeActor(request);

    const excludeArchivedCancelled =
      includeArchived !== "true" && includeArchived !== "1";

    return apiSuccess(
      await this.campaignService.listCampaigns({
        organizationId: actor.organization_id!,
        status: status?.trim() || undefined,
        limit: Math.min(readPositiveInt(limit, 50), 100),
        offset: readPositiveInt(offset, 0),
        excludeArchivedCancelled,
      }),
    );
  }

  @Post("campaigns")
  async createCampaign(@Req() request: RequestWithActor, @Body() body: Record<string, unknown>) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);

    const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};

    return apiSuccess(
      await this.campaignService.createCampaign({
        organizationId: actor.organization_id!,
        actorUserId: actor.user.id,
        body: payload,
      }),
    );
  }

  @Get("campaigns/:campaignId/progress")
  async getCampaignProgress(@Req() request: RequestWithActor, @Param("campaignId") campaignId: string) {
    const actor = requireMarketingOfficeActor(request);

    return apiSuccess(
      await this.campaignService.getCampaignProgress(actor.organization_id!, campaignId.trim()),
    );
  }

  @Get("campaigns/:campaignId")
  async getCampaignDetail(@Req() request: RequestWithActor, @Param("campaignId") campaignId: string) {
    const actor = requireMarketingOfficeActor(request);

    return apiSuccess(await this.campaignService.getCampaignDetail(actor.organization_id!, campaignId.trim()));
  }

  @Patch("campaigns/:campaignId")
  async patchCampaign(
    @Req() request: RequestWithActor,
    @Param("campaignId") campaignId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);

    const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};

    return apiSuccess(
      await this.campaignService.patchCampaign({
        organizationId: actor.organization_id!,
        actorUserId: actor.user.id,
        campaignId: campaignId.trim(),
        body: payload,
      }),
    );
  }

  @Post("campaigns/:campaignId/items/create-drafts-for-empty-slots")
  async bulkCreateDraftsForEmptySlots(
    @Req() request: RequestWithActor,
    @Param("campaignId") campaignId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);

    const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};

    return apiSuccess(
      await this.campaignService.bulkCreateDraftsForEmptySlots({
        organizationId: actor.organization_id!,
        actorUserId: actor.user.id,
        campaignId: campaignId.trim(),
        body: payload,
      }),
    );
  }

  @Post("campaigns/:campaignId/items")
  async addCampaignItem(
    @Req() request: RequestWithActor,
    @Param("campaignId") campaignId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);

    const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};

    return apiSuccess(
      await this.campaignService.addCampaignItem({
        organizationId: actor.organization_id!,
        actorUserId: actor.user.id,
        campaignId: campaignId.trim(),
        body: payload,
      }),
    );
  }

  @Patch("campaigns/:campaignId/items/:itemId")
  async patchCampaignItem(
    @Req() request: RequestWithActor,
    @Param("campaignId") campaignId: string,
    @Param("itemId") itemId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);

    const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};

    return apiSuccess(
      await this.campaignService.patchCampaignItem({
        organizationId: actor.organization_id!,
        actorUserId: actor.user.id,
        campaignId: campaignId.trim(),
        itemId: itemId.trim(),
        body: payload,
      }),
    );
  }

  @Delete("campaigns/:campaignId/items/:itemId")
  async deleteCampaignItem(
    @Req() request: RequestWithActor,
    @Param("campaignId") campaignId: string,
    @Param("itemId") itemId: string,
  ) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);

    return apiSuccess(
      await this.campaignService.deleteCampaignItem({
        organizationId: actor.organization_id!,
        actorUserId: actor.user.id,
        campaignId: campaignId.trim(),
        itemId: itemId.trim(),
      }),
    );
  }

  @Post("campaigns/:campaignId/items/:itemId/create-draft")
  async createDraftForCampaignItem(
    @Req() request: RequestWithActor,
    @Param("campaignId") campaignId: string,
    @Param("itemId") itemId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);

    const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};

    return apiSuccess(
      await this.campaignService.createDraftForCampaignItem({
        organizationId: actor.organization_id!,
        actorUserId: actor.user.id,
        campaignId: campaignId.trim(),
        itemId: itemId.trim(),
        body: payload,
      }),
    );
  }

  @Post("campaigns/:campaignId/items/:itemId/attach-draft")
  async attachDraftToCampaignItem(
    @Req() request: RequestWithActor,
    @Param("campaignId") campaignId: string,
    @Param("itemId") itemId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);

    const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};

    return apiSuccess(
      await this.campaignService.attachDraftToCampaignItem({
        organizationId: actor.organization_id!,
        actorUserId: actor.user.id,
        campaignId: campaignId.trim(),
        itemId: itemId.trim(),
        body: payload,
      }),
    );
  }

  @Post("campaigns/:campaignId/items/:itemId/detach-draft")
  async detachDraftFromCampaignItem(
    @Req() request: RequestWithActor,
    @Param("campaignId") campaignId: string,
    @Param("itemId") itemId: string,
  ) {
    const actor = requireMarketingOfficeActor(request);
    assertMarketingPublisher(actor);

    return apiSuccess(
      await this.campaignService.detachDraftFromCampaignItem({
        organizationId: actor.organization_id!,
        actorUserId: actor.user.id,
        campaignId: campaignId.trim(),
        itemId: itemId.trim(),
      }),
    );
  }
}
