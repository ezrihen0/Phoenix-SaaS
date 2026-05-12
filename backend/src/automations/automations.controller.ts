import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";

import { requirePermission } from "../auth/permissions";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { AutomationsService } from "./automations.service";

@Controller("api/automations")
@UseGuards(SessionGuard)
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get()
  getFoundationOverview(@Req() request: RequestWithActor) {
    this.requireAutomationAccess(request);
    return apiSuccess(this.automationsService.getFoundationOverview());
  }

  @Get("registry")
  getRegistry(@Req() request: RequestWithActor) {
    this.requireAutomationAccess(request);
    return apiSuccess(this.automationsService.getRegistry());
  }

  @Get("builder-options")
  getBuilderOptions(@Req() request: RequestWithActor) {
    this.requireAutomationAccess(request);
    return apiSuccess(this.automationsService.getBuilderOptions());
  }

  @Get("templates")
  async listTemplates(@Req() request: RequestWithActor) {
    this.requireAutomationAccess(request);
    return apiSuccess(await this.automationsService.listTemplates());
  }

  @Get("rules")
  async listRules(@Req() request: RequestWithActor) {
    const actor = this.requireAutomationAccess(request);
    return apiSuccess(await this.automationsService.listRules(this.requireOrganizationId(actor)));
  }

  @Post("rules/validate")
  validateRule(
    @Req() request: RequestWithActor,
    @Body() payload: Record<string, unknown> | null | undefined,
  ) {
    this.requireAutomationManage(request);
    return apiSuccess(this.automationsService.validateRulePayload(payload ?? {}));
  }

  @Post("rules")
  async createRule(
    @Req() request: RequestWithActor,
    @Body() payload: Record<string, unknown> | null | undefined,
  ) {
    const actor = this.requireAutomationManage(request);
    return apiSuccess(
      await this.automationsService.createRule(
        this.requireOrganizationId(actor),
        payload ?? {},
        actor.user.id,
      ),
    );
  }

  @Put("rules/:ruleId")
  async updateRule(
    @Req() request: RequestWithActor,
    @Param("ruleId") ruleId: string,
    @Body() payload: Record<string, unknown> | null | undefined,
  ) {
    const actor = this.requireAutomationManage(request);
    return apiSuccess(await this.automationsService.updateRule(this.requireOrganizationId(actor), ruleId, payload ?? {}));
  }

  @Post("rules/:ruleId/disable")
  async disableRule(
    @Req() request: RequestWithActor,
    @Param("ruleId") ruleId: string,
  ) {
    const actor = this.requireAutomationManage(request);
    return apiSuccess(await this.automationsService.disableRule(this.requireOrganizationId(actor), ruleId));
  }

  @Delete("rules/:ruleId")
  async deleteRule(
    @Req() request: RequestWithActor,
    @Param("ruleId") ruleId: string,
  ) {
    const actor = this.requireAutomationManage(request);
    return apiSuccess(await this.automationsService.deleteRule(this.requireOrganizationId(actor), ruleId));
  }

  @Get("event-contract")
  getEventContract(@Req() request: RequestWithActor) {
    this.requireAutomationAccess(request);
    return apiSuccess(this.automationsService.getEventContract());
  }

  @Get("safety-model")
  getSafetyModel(@Req() request: RequestWithActor) {
    this.requireAutomationAccess(request);
    return apiSuccess(this.automationsService.getSafetyModel());
  }

  @Get("settings")
  async getSettings(@Req() request: RequestWithActor) {
    const actor = this.requireAutomationAccess(request);
    return apiSuccess(await this.automationsService.getAutomationSettings(this.requireOrganizationId(actor)));
  }

  @Put("settings")
  async updateSettings(
    @Req() request: RequestWithActor,
    @Body() payload: Record<string, unknown> | null | undefined,
  ) {
    const actor = this.requireAutomationSettingsManage(request);
    return apiSuccess(await this.automationsService.updateAutomationSettings(this.requireOrganizationId(actor), payload ?? {}));
  }

  private requireAutomationAccess(request: RequestWithActor) {
    return requirePermission(
      request.actor,
      "automations.view",
      "automations_view_forbidden",
      "This account cannot view Automation Store.",
    );
  }

  private requireAutomationManage(request: RequestWithActor) {
    return requirePermission(
      request.actor,
      "automations.manage",
      "automations_manage_forbidden",
      "This account cannot manage Automation Store rules.",
    );
  }

  private requireAutomationSettingsManage(request: RequestWithActor) {
    return requirePermission(
      request.actor,
      "automations.settings.manage",
      "automations_settings_manage_forbidden",
      "This account cannot manage Automation Store safety settings.",
    );
  }

  private requireOrganizationId(actor: RequestWithActor["actor"]) {
    const organizationId = actor?.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for automations.");
    }

    return organizationId;
  }
}
