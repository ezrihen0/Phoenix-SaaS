import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { requirePermission } from "../auth/permissions";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { BranchScopeService } from "./branch-scope.service";
import {
  describeBranchProvinceCode,
  normalizeServiceProvinceToBranchCode,
} from "./branch-province-resolution";

type BranchProfilePayload = {
  phone?: unknown;
  email?: unknown;
  website?: unknown;
  addressLine?: unknown;
  city?: unknown;
  province?: unknown;
  postalCode?: unknown;
  logoUrl?: unknown;
  taxNumber?: unknown;
};

function readOptionalString(value: unknown, fieldName: string, maxLength: number) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    apiError(400, "branch_settings_invalid", `${fieldName} must be a string or null.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > maxLength) {
    apiError(400, "branch_settings_invalid", `${fieldName} is too long.`);
  }

  return trimmed;
}

function parseBranchProfilePayload(payload: BranchProfilePayload) {
  return {
    phone: readOptionalString(payload.phone, "phone", 64),
    email: readOptionalString(payload.email, "email", 320),
    website: readOptionalString(payload.website, "website", 512),
    address_line: readOptionalString(payload.addressLine, "addressLine", 255),
    city: readOptionalString(payload.city, "city", 128),
    province: readOptionalString(payload.province, "province", 64),
    postal_code: readOptionalString(payload.postalCode, "postalCode", 32),
    logo_url: readOptionalString(payload.logoUrl, "logoUrl", 1024),
    tax_number: readOptionalString(payload.taxNumber, "taxNumber", 128),
  };
}

@Controller("api/branches")
@UseGuards(SessionGuard, OperationalAccessGuard)
export class BranchesController {
  constructor(private readonly branchScopeService: BranchScopeService) {}

  @Get()
  async listBranches(@Req() request: RequestWithActor) {
    const actor = requirePermission(
      request.actor,
      "settings.view",
      "settings_view_forbidden",
      "This account cannot view branch settings.",
    );

    if (!actor.organization_id) {
      apiError(400, "organization_context_missing", "An active organization is required.");
    }

    const branches = await this.branchScopeService.listBranchesForActor(actor, actor.organization_id);
    return apiSuccess(branches);
  }

  @Get("resolve")
  async resolveBranch(
    @Req() request: RequestWithActor,
    @Query("province") province?: string,
  ) {
    const actor = requirePermission(
      request.actor,
      "jobs.view",
      "job_view_forbidden",
      "This account cannot resolve job branches.",
    );

    if (!actor.organization_id) {
      apiError(400, "organization_context_missing", "An active organization is required.");
    }

    const code = normalizeServiceProvinceToBranchCode(province);
    if (!code) {
      apiError(400, "branch_province_unsupported", "Service address province must be AB or ON.");
    }

    const branch = await this.branchScopeService.findActiveBranchByCode(actor.organization_id, code);
    if (!branch) {
      apiError(400, "branch_not_found", `No active branch is configured for ${describeBranchProvinceCode(code)}.`);
    }

    return apiSuccess({
      branchId: branch.id,
      code: branch.code,
      name: branch.name,
      provinceCode: code,
    });
  }

  @Patch(":branchId")
  async updateBranch(
    @Req() request: RequestWithActor,
    @Param("branchId") branchId: string,
    @Body() payload: BranchProfilePayload,
  ) {
    const actor = requirePermission(
      request.actor,
      "settings.manage",
      "settings_manage_forbidden",
      "This account cannot change branch settings.",
    );

    if (!actor.organization_id) {
      apiError(400, "organization_context_missing", "An active organization is required.");
    }

    const branch = await this.branchScopeService.updateBranchProfile(
      actor,
      actor.organization_id,
      branchId,
      parseBranchProfilePayload(payload),
    );

    return apiSuccess(branch);
  }
}
