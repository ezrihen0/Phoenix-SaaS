import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { MessagingAccessService } from "./messaging-access.service";
import { TxtService } from "./txt/txt.service";

type CreateMessagingShortLinkPayload = {
  lane?: unknown;
  customerId?: unknown;
  phoneKey?: unknown;
};

function parseShortLinkPayload(payload: CreateMessagingShortLinkPayload) {
  const lane = typeof payload.lane === "string" ? payload.lane.trim().toLowerCase() : "";
  const customerId = typeof payload.customerId === "string" ? payload.customerId.trim() : "";
  const phoneKey = typeof payload.phoneKey === "string" ? payload.phoneKey.trim() : "";

  if (lane === "customers") {
    if (!customerId) {
      apiError(400, "messaging_short_link_customer_required", "A customer conversation target is required.");
    }

    return {
      lane: "customers" as const,
      customerId,
      phoneKey: null,
    };
  }

  if (lane === "unknown") {
    if (!phoneKey) {
      apiError(400, "messaging_short_link_phone_required", "A phone conversation target is required.");
    }

    return {
      lane: "unknown" as const,
      customerId: null,
      phoneKey,
    };
  }

  apiError(400, "messaging_short_link_lane_invalid", "Messaging short links only support TXT customer and unknown-number lanes.");
}

@UseGuards(SessionGuard)
@Controller("api/messaging/conversations")
export class MessagingShortLinkController {
  constructor(
    private readonly messagingAccessService: MessagingAccessService,
    private readonly txtService: TxtService,
  ) {}

  @Post("short-link")
  async createShortLink(
    @Req() request: RequestWithActor,
    @Body() payload: CreateMessagingShortLinkPayload,
  ) {
    this.messagingAccessService.requireSendAccess(request);
    return apiSuccess(await this.txtService.createConversationShortLink(parseShortLinkPayload(payload)));
  }

  @Get("short-link/:shortId")
  async resolveShortLink(
    @Req() request: RequestWithActor,
    @Param("shortId") shortId: string,
  ) {
    this.messagingAccessService.requireGlobalInboxAccess(request);
    return apiSuccess(await this.txtService.resolveConversationShortLink(shortId));
  }
}