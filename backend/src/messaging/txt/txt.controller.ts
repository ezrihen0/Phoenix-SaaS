import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../../auth/session.guard";
import { apiError, apiSuccess } from "../../common/api-response";
import type { RequestWithActor } from "../../common/request-types";
import { MessagingAccessService } from "../messaging-access.service";
import type { TxtListConversationsQueryDto } from "./dto/txt-list-conversations-query.dto";
import type { TxtSendDto } from "./dto/txt-send.dto";
import { TxtService } from "./txt.service";

@UseGuards(SessionGuard)
@Controller("api/messaging/txt")
export class TxtController {
  constructor(
    private readonly txtService: TxtService,
    private readonly messagingAccessService: MessagingAccessService,
  ) {}

  @Get("conversations")
  async listConversations(
    @Req() request: RequestWithActor,
    @Query() query: TxtListConversationsQueryDto,
  ) {
    this.messagingAccessService.requireGlobalInboxAccess(request);

    const parsedLimit = query.limit ? Number(query.limit) : undefined;
    return apiSuccess(await this.txtService.listConversations(
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    ));
  }

  @Get("conversations/:id/messages")
  async listConversationMessages(
    @Req() request: RequestWithActor,
    @Param("id") conversationId: string,
    @Query("limit") limitRaw: string | undefined,
  ) {
    this.messagingAccessService.requireConversationAccess(request);

    const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
    return apiSuccess(await this.txtService.listConversationMessages(
      conversationId,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    ));
  }

  @Post("conversations/:id/messages/mark-read")
  async markConversationMessagesRead(
    @Req() request: RequestWithActor,
    @Param("id") conversationId: string,
    @Query("limit") limitRaw: string | undefined,
  ) {
    this.messagingAccessService.requireMarkReadAccess(request);

    const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
    return apiSuccess(await this.txtService.markConversationRead(
      conversationId,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    ));
  }

  @Post("conversations/:id/messages/mark-unread")
  async markConversationMessagesUnread(
    @Req() request: RequestWithActor,
    @Param("id") conversationId: string,
    @Query("limit") limitRaw: string | undefined,
  ) {
    this.messagingAccessService.requireMarkReadAccess(request);

    const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
    return apiSuccess(await this.txtService.markConversationUnread(
      conversationId,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    ));
  }

  @Get("unread-summary")
  async getUnreadSummary(@Req() request: RequestWithActor) {
    this.messagingAccessService.requireGlobalInboxAccess(request);

    return apiSuccess(await this.txtService.getUnreadSummary());
  }

  @Post("send")
  async sendMessage(
    @Req() request: RequestWithActor,
    @Body() payload: TxtSendDto,
  ) {
    this.messagingAccessService.requireSendAccess(request);

    if (typeof payload.conversationId !== "string") {
      apiError(400, "messaging_txt_conversation_required", "A TXT conversation id is required.");
    }

    if (typeof payload.body !== "string") {
      apiError(400, "messaging_txt_body_required", "TXT message body is required.");
    }

    const organizationId = request.actor?.organization_id?.trim();

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required to send TXT messages.");
    }

    const { thread } = await this.txtService.sendMessage({
      conversationId: payload.conversationId,
      body: payload.body,
      sentByUserId: request.actor?.user.id ?? null,
      organizationIdForCustomerScope: organizationId,
    });

    return apiSuccess(thread);
  }
}
