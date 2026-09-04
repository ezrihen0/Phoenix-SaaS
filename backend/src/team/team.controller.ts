import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import {
  normalizeRole,
  normalizePermissionKeys,
  requirePermission,
  type RoleModePermission,
} from "../auth/permissions";
import { SessionGuard } from "../auth/session.guard";
import { TeamService } from "./team.service";

type CreateMemberPayload = {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  phone?: unknown;
  systemRole?: unknown;
  customRoleId?: unknown;
  customPermissionKeys?: unknown;
};

type UpdateMemberPayload = CreateMemberPayload;

type CustomRolePayload = {
  name?: unknown;
  permissionKeys?: unknown;
};

function parseAccessPayload(payload: CreateMemberPayload) {
  const systemRole = payload.systemRole === undefined
    ? undefined
    : normalizeRole(payload.systemRole) ?? undefined;

  const customRoleId = typeof payload.customRoleId === "string" && payload.customRoleId.trim()
    ? payload.customRoleId.trim()
    : null;

  const customPermissionKeys = payload.customPermissionKeys === undefined
    ? undefined
    : normalizePermissionKeys(payload.customPermissionKeys);

  return {
    systemRole,
    customRoleId,
    customPermissionKeys,
  };
}

function parseCreateMemberPayload(payload: CreateMemberPayload) {
  if (typeof payload.email !== "string" || !payload.email.trim()) {
    apiError(400, "invalid_team_member_payload", "email is required.");
  }

  if (typeof payload.password !== "string" || payload.password.length < 8) {
    apiError(400, "invalid_team_member_payload", "Use at least 8 characters for the password.");
  }

  if (typeof payload.fullName !== "string" || !payload.fullName.trim()) {
    apiError(400, "invalid_team_member_payload", "fullName is required.");
  }

  const phone = typeof payload.phone === "string" && payload.phone.trim()
    ? payload.phone.trim()
    : null;

  return {
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
    fullName: payload.fullName.trim(),
    phone,
    access: parseAccessPayload(payload),
  };
}

function parseCustomRolePayload(payload: CustomRolePayload) {
  return {
    name: typeof payload.name === "string" ? payload.name : "",
    permissionKeys: normalizePermissionKeys(payload.permissionKeys) as RoleModePermission[],
  };
}

@Controller("api/team")
@UseGuards(SessionGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get("summary")
  async summary(@Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.view", "team_view_forbidden", "You cannot view team settings.");
    return apiSuccess(await this.teamService.getSummary(request.actor!));
  }

  @Get("members")
  async members(@Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.view", "team_view_forbidden", "You cannot view team members.");
    return apiSuccess(await this.teamService.listMembers(request.actor!));
  }

  @Post("members")
  async createMember(@Body() payload: CreateMemberPayload, @Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.invite", "team_invite_forbidden", "You cannot add team members.");
    return apiSuccess(await this.teamService.createMember(parseCreateMemberPayload(payload), request.actor!));
  }

  @Patch("members/:profileId")
  async updateMember(
    @Param("profileId") profileId: string,
    @Body() payload: UpdateMemberPayload,
    @Req() request: RequestWithActor,
  ) {
    requirePermission(request.actor, "team.manage", "team_manage_forbidden", "You cannot manage team access.");
    return apiSuccess(
      await this.teamService.updateMemberAccess(profileId, parseAccessPayload(payload), request.actor!),
    );
  }

  @Delete("members/:profileId")
  async removeMember(@Param("profileId") profileId: string, @Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.manage", "team_manage_forbidden", "You cannot manage team access.");
    return apiSuccess(await this.teamService.removeMember(profileId, request.actor!));
  }

  @Post("recommend-role")
  async recommendRole(@Body() payload: { responsibilities?: unknown }, @Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.invite", "team_invite_forbidden", "You cannot add team members.");
    return apiSuccess(await this.teamService.recommendRole(payload.responsibilities));
  }

  @Get("permissions/registry")
  registry(@Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.view", "team_view_forbidden", "You cannot view permissions.");
    return apiSuccess(this.teamService.getPermissionRegistry());
  }

  @Get("custom-roles")
  async customRoles(@Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.view", "team_view_forbidden", "You cannot view custom roles.");
    return apiSuccess(await this.teamService.listCustomRoles(request.actor!));
  }

  @Post("custom-roles")
  async createCustomRole(@Body() payload: CustomRolePayload, @Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.manage", "team_manage_forbidden", "You cannot manage custom roles.");
    const parsed = parseCustomRolePayload(payload);
    return apiSuccess(await this.teamService.createCustomRole(parsed, request.actor!));
  }

  @Patch("custom-roles/:roleId")
  async updateCustomRole(
    @Param("roleId") roleId: string,
    @Body() payload: CustomRolePayload,
    @Req() request: RequestWithActor,
  ) {
    requirePermission(request.actor, "team.manage", "team_manage_forbidden", "You cannot manage custom roles.");
    const parsed = parseCustomRolePayload(payload);
    return apiSuccess(await this.teamService.updateCustomRole(roleId, parsed, request.actor!));
  }

  @Post("custom-roles/:roleId/duplicate")
  async duplicateCustomRole(@Param("roleId") roleId: string, @Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.manage", "team_manage_forbidden", "You cannot manage custom roles.");
    return apiSuccess(await this.teamService.duplicateCustomRole(roleId, request.actor!));
  }

  @Delete("custom-roles/:roleId")
  async deleteCustomRole(@Param("roleId") roleId: string, @Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.manage", "team_manage_forbidden", "You cannot manage custom roles.");
    return apiSuccess(await this.teamService.deleteCustomRole(roleId, request.actor!));
  }
}
