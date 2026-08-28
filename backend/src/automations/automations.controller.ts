import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";

import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { requirePermission } from "../auth/permissions";
import { SessionGuard } from "../auth/session.guard";
import { EntitlementService } from "../billing/entitlement.service";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { AutomationsService } from "./automations.service";

@Controller("api/automations")
@UseGuards(SessionGuard, OperationalAccessGuard)
export class AutomationsController {
  constructor(
    private readonly automationsService: AutomationsService,
    private readonly entitlementService: EntitlementService,
  ) {}

  @Get()
  async getFoundationOverview(@Req() request: RequestWithActor) {
    const actor = this.requireAutomationAccess(request);
    await this.entitlementService.requireAutomationsEntitled(this.requireOrganizationId(actor));
    return apiSuccess(this.automationsService.getFoundationOverview());
  }

  @Get("registry")
  async getRegistry(@Req() request: RequestWithActor) {
    const actor = this.requireAutomationAccess(request);
    await this.entitlementService.requireAutomationsEntitled(this.requireOrganizationId(actor));
    return apiSuccess(this.automationsService.getRegistry());
  }

  @Get("builder-options")
  async getBuilderOptions(@Req() request: RequestWithActor) {
    const actor = this.requireAutomationAccess(request);
    await this.entitlementService.requireAutomationsEntitled(this.requireOrganizationId(actor));
    return apiSuccess(this.automationsService.getBuilderOptions());
  }

  @Get("templates")
  async listTemplates(@Req() request: RequestWithActor) {
    const actor = this.requireAutomationAccess(request);
    await this.entitlementService.requireAutomationsEntitled(this.requireOrganizationId(actor));
    return apiSuccess(await this.automationsService.listTemplates());
  }

  @Get("rules")
  async listRules(@Req() request: RequestWithActor) {
    const actor = this.requireAutomationAccess(request);
    const organizationId = this.requireOrganizationId(actor);
    await this.entitlementService.requireAutomationsEntitled(organizationId);
    return apiSuccess(await this.automationsService.listRules(organizationId));
  }

  @Post("rules/validate")
  async validateRule(
    @Req() request: RequestWithActor,
    @Body() payload: Record<string, unknown> | null | undefined,
  ) {
    const actor = this.requireAutomationManage(request);
    await this.entitlementService.requireAutomationsEntitled(this.requireOrganizationId(actor));
    return apiSuccess(this.automationsService.validateRulePayload(payload ?? {}));
  }

  @Post("rules")
  async createRule(
    @Req() request: RequestWithActor,
    @Body() payload: Record<string, unknown> | null | undefined,
  ) {
    const actor = this.requireAutomationManage(request);
    const organizationId = this.requireOrganizationId(actor);
    await this.entitlementService.requireAutomationsEntitled(organizationId);
    return apiSuccess(
      await this.automationsService.createRule(
        organizationId,
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
    const organizationId = this.requireOrganizationId(actor);
    await this.entitlementService.requireAutomationsEntitled(organizationId);
    return apiSuccess(await this.automationsService.updateRule(organizationId, ruleId, payload ?? {}));
  }

  @Post("rules/:ruleId/disable")
  async disableRule(
    @Req() request: RequestWithActor,
    @Param("ruleId") ruleId: string,
  ) {
    const actor = this.requireAutomationManage(request);
    const organizationId = this.requireOrganizationId(actor);
    await this.entitlementService.requireAutomationsEntitled(organizationId);
    return apiSuccess(await this.automationsService.disableRule(organizationId, ruleId));
  }

  @Delete("rules/:ruleId")
  async deleteRule(
    @Req() request: RequestWithActor,
    @Param("ruleId") ruleId: string,
  ) {
    const actor = this.requireAutomationManage(request);
    const organizationId = this.requireOrganizationId(actor);
    await this.entitlementService.requireAutomationsEntitled(organizationId);
    return apiSuccess(await this.automationsService.deleteRule(organizationId, ruleId));
  }

  @Get("event-contract")
  async getEventContract(@Req() request: RequestWithActor) {
    const actor = this.requireAutomationAccess(request);
    await this.entitlementService.requireAutomationsEntitled(this.requireOrganizationId(actor));
    return apiSuccess(this.automationsService.getEventContract());
  }

  @Get("safety-model")
  async getSafetyModel(@Req() request: RequestWithActor) {
    const actor = this.requireAutomationAccess(request);
    await this.entitlementService.requireAutomationsEntitled(this.requireOrganizationId(actor));
    return apiSuccess(this.automationsService.getSafetyModel());
  }

  @Get("settings")
  async getSettings(@Req() request: RequestWithActor) {
    const actor = this.requireAutomationAccess(request);
    const organizationId = this.requireOrganizationId(actor);
    await this.entitlementService.requireAutomationsEntitled(organizationId);
    return apiSuccess(await this.automationsService.getAutomationSettings(organizationId));
  }

  @Put("settings")
  async updateSettings(
    @Req() request: RequestWithActor,
    @Body() payload: Record<string, unknown> | null | undefined,
  ) {
    const actor = this.requireAutomationSettingsManage(request);
    const organizationId = this.requireOrganizationId(actor);
    await this.entitlementService.requireAutomationsEntitled(organizationId);
    return apiSuccess(await this.automationsService.updateAutomationSettings(organizationId, payload ?? {}));
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
