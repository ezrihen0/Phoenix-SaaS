import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
import { BranchScopeService } from "../crm/branch-scope.service";
import { TeamMemberEditService } from "./team-member-edit.service";
import { TeamService } from "./team.service";

type CreateMemberPayload = {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  phone?: unknown;
  systemRole?: unknown;
  customRoleId?: unknown;
  customPermissionKeys?: unknown;
  organizationIds?: unknown;
  assignableToJobs?: unknown;
};

type UpdateMemberPayload = {
  fullName?: unknown;
  phone?: unknown;
  systemRole?: unknown;
  customRoleId?: unknown;
  customPermissionKeys?: unknown;
  assignableToJobs?: unknown;
  reactivateRoster?: unknown;
};

type ResetPasswordPayload = {
  password?: unknown;
};

type CustomRolePayload = {
  name?: unknown;
  permissionKeys?: unknown;
};

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }

  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }

  apiError(400, "invalid_boolean_field", "Expected a boolean value.");
  return undefined as never;
}

function parseAccessPayload(payload: CreateMemberPayload | UpdateMemberPayload) {
  const systemRole = payload.systemRole === undefined
    ? undefined
    : normalizeRole(payload.systemRole) ?? undefined;

  const customRoleId = payload.customRoleId === undefined
    ? undefined
    : typeof payload.customRoleId === "string" && payload.customRoleId.trim()
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

function parseOrganizationIds(payload: CreateMemberPayload) {
  if (payload.organizationIds === undefined) {
    return undefined;
  }

  if (!Array.isArray(payload.organizationIds)) {
    apiError(400, "invalid_team_member_payload", "organizationIds must be an array.");
  }

  const organizationIds = payload.organizationIds
    .filter((organizationId): organizationId is string => typeof organizationId === "string")
    .map((organizationId) => organizationId.trim())
    .filter(Boolean);

  return [...new Set(organizationIds)];
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

  const organizationIds = parseOrganizationIds(payload);
  if (organizationIds && organizationIds.length === 0) {
    apiError(400, "organization_ids_required", "Select at least one organization.");
  }

  return {
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
    fullName: payload.fullName.trim(),
    phone,
    access: parseAccessPayload(payload),
    organizationIds,
    assignableToJobs: parseBoolean(payload.assignableToJobs),
  };
}

function parseMemberEditPayload(payload: UpdateMemberPayload) {
  const access = parseAccessPayload(payload);

  return {
    fullName: typeof payload.fullName === "string" ? payload.fullName.trim() : undefined,
    phone: payload.phone === undefined
      ? undefined
      : typeof payload.phone === "string" && payload.phone.trim()
        ? payload.phone.trim()
        : null,
    systemRole: access.systemRole,
    customRoleId: access.customRoleId,
    customPermissionKeys: access.customPermissionKeys,
    assignableToJobs: parseBoolean(payload.assignableToJobs),
    reactivateRoster: parseBoolean(payload.reactivateRoster),
  };
}

function parseResetPasswordPayload(payload: ResetPasswordPayload) {
  if (typeof payload.password !== "string" || payload.password.length < 8) {
    apiError(400, "invalid_password", "Use at least 8 characters for the new password.");
  }

  return { password: payload.password };
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
  constructor(
    private readonly teamService: TeamService,
    private readonly teamMemberEditService: TeamMemberEditService,
    private readonly branchScopeService: BranchScopeService,
  ) {}

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

  @Get("members/:profileId")
  async getMember(@Param("profileId") profileId: string, @Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.view", "team_view_forbidden", "You cannot view team members.");
    return apiSuccess(await this.teamMemberEditService.getMember(profileId, request.actor!));
  }

  @Get("organizations")
  async organizations(@Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.invite", "team_invite_forbidden", "You cannot add team members.");
    return apiSuccess(await this.teamService.listManageableOrganizations(request.actor!));
  }

  @Post("members")
  async createMember(@Body() payload: CreateMemberPayload, @Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.invite", "team_invite_forbidden", "You cannot add team members.");
    const parsed = parseCreateMemberPayload(payload);
    return apiSuccess(await this.teamService.createMember(parsed, request.actor!));
  }

  @Patch("members/:profileId")
  async updateMember(
    @Param("profileId") profileId: string,
    @Body() payload: UpdateMemberPayload,
    @Req() request: RequestWithActor,
  ) {
    requirePermission(request.actor, "team.manage", "team_manage_forbidden", "You cannot manage team access.");
    return apiSuccess(
      await this.teamMemberEditService.updateMember(profileId, parseMemberEditPayload(payload), request.actor!),
    );
  }

  @Post("members/:profileId/reset-password")
  async resetMemberPassword(
    @Param("profileId") profileId: string,
    @Body() payload: ResetPasswordPayload,
    @Req() request: RequestWithActor,
  ) {
    requirePermission(request.actor, "team.manage", "team_manage_forbidden", "You cannot manage team access.");
    const parsed = parseResetPasswordPayload(payload);
    return apiSuccess(
      await this.teamMemberEditService.resetMemberPassword(profileId, parsed.password, request.actor!),
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

  @Get("members/:profileId/branch-access")
  async getMemberBranchAccess(@Param("profileId") profileId: string, @Req() request: RequestWithActor) {
    requirePermission(request.actor, "team.manage", "team_manage_forbidden", "You cannot manage branch access.");
    const organizationId = request.actor?.organization_id;
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required.");
    }

    const membershipId = await this.teamService.resolveMembershipIdForProfile(profileId, organizationId);
    const branchIds = await this.branchScopeService.getMembershipBranchAccess(membershipId, organizationId);
    return apiSuccess({ membershipId, branchIds });
  }

  @Put("members/:profileId/branch-access")
  async replaceMemberBranchAccess(
    @Param("profileId") profileId: string,
    @Body() payload: { branchIds?: unknown },
    @Req() request: RequestWithActor,
  ) {
    requirePermission(request.actor, "team.manage", "team_manage_forbidden", "You cannot manage branch access.");
    const organizationId = request.actor?.organization_id;
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required.");
    }

    if (!Array.isArray(payload?.branchIds)) {
      apiError(400, "invalid_branch_access_payload", "branchIds must be an array.");
    }

    const branchIds = payload.branchIds
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);

    const membershipId = await this.teamService.resolveMembershipIdForProfile(profileId, organizationId);
    const saved = await this.branchScopeService.replaceMembershipBranchAccess(
      request.actor!,
      organizationId,
      membershipId,
      branchIds,
    );

    return apiSuccess({ membershipId, branchIds: saved });
  }
}
