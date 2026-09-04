import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { profileRoles, type ProfileRole } from "../crm/constants";
import { AuthService } from "./auth.service";
import { normalizeRole, requirePermission } from "./permissions";
import { requirePlatformCapability } from "../platform/platform-operator.policy";
import { SessionGuard } from "./session.guard";

type LoginPayload = {
  email?: unknown;
  password?: unknown;
};

type RegisterPayload = {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  phone?: unknown;
  organizationName?: unknown;
};

type PasswordUpdatePayload = {
  password?: unknown;
};

type CreateStaffPayload = {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  phone?: unknown;
  role?: unknown;
};

type RoleUpdatePayload = {
  role?: unknown;
};

type ActiveOrganizationPayload = {
  organizationId?: unknown;
};

type CreateOrganizationPayload = {
  organizationName?: unknown;
  mode?: unknown;
};

function parseLoginPayload(payload: LoginPayload) {
  if (typeof payload.email !== "string" || !payload.email.trim()) {
    apiError(400, "invalid_login_payload", "email is required.");
  }

  if (typeof payload.password !== "string" || payload.password.length < 1) {
    apiError(400, "invalid_login_payload", "password is required.");
  }

  return {
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
  };
}

function parseRegisterPayload(payload: RegisterPayload) {
  if (typeof payload.email !== "string" || !payload.email.trim()) {
    apiError(400, "invalid_signup_payload", "email is required.");
  }

  if (typeof payload.password !== "string" || payload.password.length < 8) {
    apiError(400, "invalid_signup_payload", "Use at least 8 characters for the password.");
  }

  if (typeof payload.fullName !== "string" || !payload.fullName.trim()) {
    apiError(400, "invalid_signup_payload", "fullName is required.");
  }

  if (typeof payload.organizationName !== "string" || !payload.organizationName.trim()) {
    apiError(400, "invalid_signup_payload", "organizationName is required.");
  }

  const phone = typeof payload.phone === "string" && payload.phone.trim()
    ? payload.phone.trim()
    : null;

  return {
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
    fullName: payload.fullName.trim(),
    phone,
    organizationName: payload.organizationName.trim(),
  };
}

function parsePasswordUpdatePayload(payload: PasswordUpdatePayload) {
  if (typeof payload.password !== "string" || payload.password.length < 8) {
    apiError(400, "invalid_password", "Use at least 8 characters for the new password.");
  }

  return {
    password: payload.password,
  };
}

function parseStaffRole(value: unknown): ProfileRole {
  const role = normalizeRole(value);

  if (!role) {
    apiError(400, "invalid_staff_role", `Role must be one of: ${profileRoles.join(", ")}.`);
  }

  return role;
}

function parseCreateStaffPayload(payload: CreateStaffPayload) {
  if (typeof payload.email !== "string" || !payload.email.trim()) {
    apiError(400, "invalid_staff_payload", "email is required.");
  }

  if (typeof payload.password !== "string" || payload.password.length < 8) {
    apiError(400, "invalid_staff_payload", "Use at least 8 characters for the staff password.");
  }

  if (typeof payload.fullName !== "string" || !payload.fullName.trim()) {
    apiError(400, "invalid_staff_payload", "fullName is required.");
  }

  const phone = typeof payload.phone === "string" && payload.phone.trim()
    ? payload.phone.trim()
    : null;

  return {
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
    fullName: payload.fullName.trim(),
    phone,
    role: parseStaffRole(payload.role),
  };
}

function parseActiveOrganizationPayload(payload: ActiveOrganizationPayload) {
  if (typeof payload.organizationId !== "string" || !payload.organizationId.trim()) {
    apiError(400, "organization_id_required", "organizationId is required.");
  }

  return {
    organizationId: payload.organizationId.trim(),
  };
}

function parseCreateOrganizationPayload(payload: CreateOrganizationPayload) {
  if (typeof payload.organizationName !== "string" || !payload.organizationName.trim()) {
    apiError(400, "organization_name_required", "organizationName is required.");
  }

  let mode: "standalone" | "shared" = "shared";
  if (typeof payload.mode === "string" && payload.mode.trim()) {
    const normalized = payload.mode.trim().toLowerCase();
    if (normalized === "standalone" || normalized === "shared") {
      mode = normalized;
    } else {
      apiError(400, "invalid_organization_mode", "mode must be standalone or shared.");
    }
  }

  return {
    organizationName: payload.organizationName.trim(),
    mode,
  };
}

@Controller("api/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  async login(
    @Body() payload: LoginPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const loginPayload = parseLoginPayload(payload);

    const actor = await this.authService.login(
      loginPayload.email,
      loginPayload.password,
      request,
      response,
    );

    if (!actor || !actor.profile) {
      throw new UnauthorizedException({
        error: {
          code: "profile_missing",
          message: "The authenticated account does not have an assigned CRM profile.",
        },
      });
    }

    return apiSuccess(this.authService.buildSessionResponse(actor));
  }

  @Post("register")
  async register(
    @Body() payload: RegisterPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = await this.authService.register(
      parseRegisterPayload(payload),
      request,
      response,
    );

    if (!actor || !actor.profile) {
      throw new UnauthorizedException({
        error: {
          code: "profile_missing",
          message: "The authenticated account does not have an assigned CRM profile.",
        },
      });
    }

    return apiSuccess(this.authService.buildSessionResponse(actor));
  }

  @Post("logout")
  @UseGuards(SessionGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(request, response);
    return apiSuccess({ cleared: true });
  }

  @Get("session")
  @UseGuards(SessionGuard)
  async session(@Req() request: RequestWithActor) {
    const actor = request.actor;

    if (!actor) {
      throw new UnauthorizedException({
        error: {
          code: "unauthenticated",
          message: "Sign in to continue.",
        },
      });
    }

    return apiSuccess(this.authService.buildSessionResponse(actor));
  }

  @Get("destination")
  @UseGuards(SessionGuard)
  async destination(@Req() request: RequestWithActor) {
    const actor = request.actor;

    return apiSuccess({
      destination: actor ? await this.authService.resolveClientDestination(actor) : null,
    });
  }

  @Get("organizations")
  @UseGuards(SessionGuard)
  async organizations(@Req() request: RequestWithActor) {
    const actor = request.actor;

    if (!actor) {
      throw new UnauthorizedException({
        error: {
          code: "unauthenticated",
          message: "Sign in to continue.",
        },
      });
    }

    return apiSuccess(this.authService.buildSessionResponse(actor).memberships);
  }

  @Post("organizations")
  @UseGuards(SessionGuard)
  async createOrganization(
    @Body() payload: CreateOrganizationPayload,
    @Req() request: RequestWithActor,
  ) {
    const actor = request.actor;

    if (!actor) {
      throw new UnauthorizedException({
        error: {
          code: "unauthenticated",
          message: "Sign in to continue.",
        },
      });
    }

    const parsed = parseCreateOrganizationPayload(payload);

    if (parsed.mode === "standalone") {
      requirePlatformCapability(
        actor,
        "organizations.create_standalone",
        "platform_capability_required",
        "Standalone organization creation requires a platform operator grant.",
      );
    }

    requirePermission(
      actor,
      "organizations.manage",
      "organizations_manage_forbidden",
      "Only an organization owner can add another business.",
    );

    const nextActor = await this.authService.createOrganizationForActor(
      actor,
      parsed.organizationName,
      request,
      parsed.mode,
    );

    return apiSuccess(this.authService.buildSessionResponse(nextActor));
  }

  @Post("active-organization")
  @UseGuards(SessionGuard)
  async setActiveOrganization(
    @Body() payload: ActiveOrganizationPayload,
    @Req() request: RequestWithActor,
  ) {
    const actor = request.actor;

    if (!actor) {
      throw new UnauthorizedException({
        error: {
          code: "unauthenticated",
          message: "Sign in to continue.",
        },
      });
    }

    const nextActor = await this.authService.switchActiveOrganization(
      request,
      actor.user.id,
      parseActiveOrganizationPayload(payload).organizationId,
    );

    return apiSuccess(this.authService.buildSessionResponse(nextActor));
  }

  @Patch("password")
  @UseGuards(SessionGuard)
  async updatePassword(
    @Body() payload: PasswordUpdatePayload,
    @Req() request: RequestWithActor,
  ) {
    const parsed = parsePasswordUpdatePayload(payload);
    const actor = request.actor;

    if (!actor) {
      throw new UnauthorizedException({
        error: {
          code: "unauthenticated",
          message: "Sign in to continue.",
        },
      });
    }

    await this.authService.updatePassword(actor.user.id, parsed.password);

    return apiSuccess({ updated: true });
  }

  @Get("staff")
  @UseGuards(SessionGuard)
  async listStaff(@Req() request: RequestWithActor) {
    const actor = request.actor;
    if (
      !actor?.permissions?.includes("team.view")
      && !actor?.permissions?.includes("system.roles.manage")
    ) {
      requirePermission(actor, "team.view", "team_view_forbidden", "You cannot view team members.");
    }

    return apiSuccess(await this.authService.listStaffProfiles(actor!));
  }

  @Post("staff")
  @UseGuards(SessionGuard)
  async createStaff(
    @Body() payload: CreateStaffPayload,
    @Req() request: RequestWithActor,
  ) {
    const actor = request.actor;
    if (
      !actor?.permissions?.includes("team.invite")
      && !actor?.permissions?.includes("system.roles.manage")
    ) {
      requirePermission(actor, "team.invite", "team_invite_forbidden", "You cannot add team members.");
    }

    return apiSuccess(await this.authService.createStaffProfile(parseCreateStaffPayload(payload), actor!));
  }

  @Patch("staff/:profileId/role")
  @UseGuards(SessionGuard)
  async updateStaffRole(
    @Param("profileId") profileId: string,
    @Body() payload: RoleUpdatePayload,
    @Req() request: RequestWithActor,
  ) {
    const actor = request.actor;
    if (
      !actor?.permissions?.includes("team.manage")
      && !actor?.permissions?.includes("system.roles.manage")
    ) {
      requirePermission(actor, "team.manage", "team_manage_forbidden", "You cannot manage team access.");
    }

    if (!actor?.profile) {
      apiError(403, "actor_profile_missing", "The authenticated user does not have a workspace profile yet.");
    }

    if (actor.profile.id === profileId) {
      apiError(400, "cannot_change_own_role", "Owners cannot change their own role from this panel.");
    }

    return apiSuccess(await this.authService.updateStaffRole(profileId, parseStaffRole(payload.role), actor));
  }
}
