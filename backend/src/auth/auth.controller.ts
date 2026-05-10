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
import { SessionGuard } from "./session.guard";

type LoginPayload = {
  email?: unknown;
  password?: unknown;
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

    return apiSuccess({
      user: {
        id: actor.user.id,
        email: actor.user.email,
      },
      profile: actor.profile,
      technician: actor.technician,
    });
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

    return apiSuccess({
      user: {
        id: actor.user.id,
        email: actor.user.email,
      },
      profile: actor.profile,
      technician: actor.technician,
    });
  }

  @Get("destination")
  @UseGuards(SessionGuard)
  async destination(@Req() request: RequestWithActor) {
    const role = request.actor?.profile?.role;

    return apiSuccess({
      destination: role === "technician" ? "/technician" : "/jobs",
    });
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
    requirePermission(
      request.actor,
      "system.roles.manage",
      "role_management_forbidden",
      "Only owners can manage staff roles.",
    );

    return apiSuccess(await this.authService.listStaffProfiles());
  }

  @Post("staff")
  @UseGuards(SessionGuard)
  async createStaff(
    @Body() payload: CreateStaffPayload,
    @Req() request: RequestWithActor,
  ) {
    requirePermission(
      request.actor,
      "system.roles.manage",
      "role_management_forbidden",
      "Only owners can manage staff roles.",
    );

    return apiSuccess(await this.authService.createStaffProfile(parseCreateStaffPayload(payload)));
  }

  @Patch("staff/:profileId/role")
  @UseGuards(SessionGuard)
  async updateStaffRole(
    @Param("profileId") profileId: string,
    @Body() payload: RoleUpdatePayload,
    @Req() request: RequestWithActor,
  ) {
    const actor = requirePermission(
      request.actor,
      "system.roles.manage",
      "role_management_forbidden",
      "Only owners can manage staff roles.",
    );

    if (actor.profile.id === profileId) {
      apiError(400, "cannot_change_own_role", "Owners cannot change their own role from this panel.");
    }

    return apiSuccess(await this.authService.updateStaffRole(profileId, parseStaffRole(payload.role)));
  }
}
