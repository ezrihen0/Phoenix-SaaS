import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";

import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import type { HomeAiPostMessageBody } from "./home-ai.service";
import { HomeAiService } from "./home-ai.service";

@Controller("api/ai/home")
@UseGuards(SessionGuard, OperationalAccessGuard)
export class HomeAiController {
  constructor(private readonly homeAiService: HomeAiService) {}

  @Get("profile")
  async profile(@Req() request: RequestWithActor) {
    return apiSuccess(await this.homeAiService.getProfile(request));
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
