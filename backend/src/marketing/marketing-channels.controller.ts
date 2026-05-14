import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";

import {
  assertMarketingChannelAdmin,
  requireMarketingOfficeActor,
} from "./marketing-access";
import { MarketingChannelsService } from "./marketing-channels.service";

@UseGuards(SessionGuard)
@Controller("api/marketing/channels")
export class MarketingChannelsController {
  constructor(private readonly channelsService: MarketingChannelsService) {}

  @Get()
  async list(@Req() request: RequestWithActor) {
    const actor = requireMarketingOfficeActor(request);

    return apiSuccess(await this.channelsService.listChannelsSummary(actor.organization_id));
  }

  @Post("google/start-oauth")
  async startGoogle(@Req() request: RequestWithActor) {
    const actor = requireMarketingOfficeActor(request);

    assertMarketingChannelAdmin(actor);
    await this.channelsService.ensureChannelRow(actor.organization_id, this.channelsService.googleChannelKey());

    return apiSuccess(await this.channelsService.buildGoogleAuthorizeUrl(actor.organization_id));
  }

  @Post("google/select-location")
  async selectGoogleLocation(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requireMarketingOfficeActor(request);

    assertMarketingChannelAdmin(actor);

    const payload = this.readObjectBody(body);
    const locationResource = payload.location_resource;

    if (typeof locationResource !== "string" || !locationResource.trim()) {
      apiError(400, "marketing_google_location_required", "Field location_resource must be supplied.");
    }

    await this.channelsService.selectGoogleLocation(actor.organization_id, locationResource.trim());

    return apiSuccess({ ok: true });
  }

  @Post("meta/start-oauth")
  async startMeta(@Req() request: RequestWithActor) {
    const actor = requireMarketingOfficeActor(request);

    assertMarketingChannelAdmin(actor);
    await this.channelsService.ensureChannelRow(actor.organization_id, this.channelsService.metaChannelKey());

    return apiSuccess(await this.channelsService.buildMetaAuthorizeUrl(actor.organization_id));
  }

  @Post("meta/select-page")
  async selectMetaPage(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requireMarketingOfficeActor(request);

    assertMarketingChannelAdmin(actor);

    const payload = this.readObjectBody(body);
    const pageId = payload.page_id;

    if (typeof pageId !== "string" || !pageId.trim()) {
      apiError(400, "marketing_meta_page_required", "Field page_id must be supplied.");
    }

    await this.channelsService.selectMetaPage(actor.organization_id, pageId.trim());

    return apiSuccess({ ok: true });
  }

  @Post(":channelId/disconnect")
  async disconnect(@Req() request: RequestWithActor, @Param("channelId") channelId: string) {
    const actor = requireMarketingOfficeActor(request);

    assertMarketingChannelAdmin(actor);
    await this.channelsService.disconnectChannel(actor.organization_id, channelId.trim());

    return apiSuccess({ ok: true });
  }

  @Post(":channelId/reconnect")
  async reconnect(@Req() request: RequestWithActor, @Param("channelId") channelId: string) {
    const actor = requireMarketingOfficeActor(request);

    assertMarketingChannelAdmin(actor);

    return apiSuccess(await this.channelsService.reconnectChannel(actor.organization_id, channelId.trim()));
  }

  private readObjectBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      apiError(400, "marketing_payload_expected", "Expected a JSON object body.");
    }

    return body as Record<string, unknown>;
  }
}
