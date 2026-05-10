import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../../auth/session.guard";
import { apiError, apiSuccess } from "../../common/api-response";
import type { RequestWithActor } from "../../common/request-types";
import { MessagingAccessService } from "../messaging-access.service";
import { TxtTemplatesService } from "./txt-templates.service";

type TxtTemplateCreateDto = {
  name?: unknown;
  body?: unknown;
};

type TxtTemplateQuickPickDto = {
  quickPick?: unknown;
};

@UseGuards(SessionGuard)
@Controller("api/messaging/txt/templates")
export class TxtTemplatesController {
  constructor(
    private readonly txtTemplatesService: TxtTemplatesService,
    private readonly messagingAccessService: MessagingAccessService,
  ) {}

  @Get()
  async listTemplates(@Req() request: RequestWithActor) {
    this.messagingAccessService.requireGlobalInboxAccess(request);

    return apiSuccess(await this.txtTemplatesService.listActiveTemplates());
  }

  @Post()
  async createTemplate(
    @Req() request: RequestWithActor,
    @Body() payload: TxtTemplateCreateDto,
  ) {
    this.messagingAccessService.requireSendAccess(request);

    if (typeof payload.name !== "string") {
      apiError(400, "messaging_txt_template_name_required", "Template name is required.");
    }

    if (typeof payload.body !== "string") {
      apiError(400, "messaging_txt_template_body_required", "Template body is required.");
    }

    return apiSuccess(await this.txtTemplatesService.createTemplate({
      name: payload.name,
      body: payload.body,
      createdByUserId: request.actor?.user.id ?? null,
    }));
  }

  @Patch(":id")
  async updateTemplateQuickPick(
    @Req() request: RequestWithActor,
    @Param("id") templateId: string,
    @Body() payload: TxtTemplateQuickPickDto,
  ) {
    this.messagingAccessService.requireSendAccess(request);

    if (typeof payload.quickPick !== "boolean") {
      apiError(400, "messaging_txt_template_quick_pick_required", "A quick-pick selection value is required.");
    }

    return apiSuccess(await this.txtTemplatesService.setQuickPick(templateId, payload.quickPick));
  }

  @Delete(":id")
  async deactivateTemplate(
    @Req() request: RequestWithActor,
    @Param("id") templateId: string,
  ) {
    this.messagingAccessService.requireSendAccess(request);

    return apiSuccess(await this.txtTemplatesService.deactivateTemplate(templateId));
  }
}