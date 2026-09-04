import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";

import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import type { HomeAiListConversationsQuery, HomeAiListMessagesQuery, HomeAiPostMessageBody } from "./home-ai.service";
import { HomeAiService } from "./home-ai.service";

@Controller("api/ai/home")
@UseGuards(SessionGuard, OperationalAccessGuard)
export class HomeAiController {
  constructor(private readonly homeAiService: HomeAiService) {}

  @Get("profile")
  async profile(@Req() request: RequestWithActor) {
    return apiSuccess(await this.homeAiService.getProfile(request));
  }

  @Get("conversations")
  async listConversations(
    @Req() request: RequestWithActor,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    const query: HomeAiListConversationsQuery = { limit, cursor };
    return apiSuccess(await this.homeAiService.listConversations(request, query));
  }

  @Post("conversations")
  async createConversation(@Req() request: RequestWithActor) {
    return apiSuccess(await this.homeAiService.createConversation(request));
  }

  @Get("conversations/:conversationId")
  async getConversationById(
    @Req() request: RequestWithActor,
    @Param("conversationId") conversationId: string,
  ) {
    return apiSuccess(await this.homeAiService.getConversationById(request, conversationId));
  }

  @Get("conversations/:conversationId/messages")
  async listMessages(
    @Req() request: RequestWithActor,
    @Param("conversationId") conversationId: string,
    @Query("limit") limit?: string,
    @Query("before") before?: string,
  ) {
    const query: HomeAiListMessagesQuery = { limit, before };
    return apiSuccess(await this.homeAiService.listMessages(request, conversationId, query));
  }

  @Get("conversation")
  async conversation(@Req() request: RequestWithActor) {
    return apiSuccess(await this.homeAiService.getConversation(request));
  }

  @Post("conversation/messages")
  async postMessage(@Req() request: RequestWithActor, @Body() body: HomeAiPostMessageBody) {
    return apiSuccess(await this.homeAiService.postMessage(request, body ?? {}));
  }

  @Get("summary-widgets")
  async summaryWidgets(@Req() request: RequestWithActor) {
    return apiSuccess(await this.homeAiService.getSummaryWidgets(request));
  }
}
