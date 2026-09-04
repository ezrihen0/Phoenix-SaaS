import "dotenv/config";
import "reflect-metadata";

import { DataSource, IsNull, LessThanOrEqual, MoreThan } from "typeorm";
import type { Request, Response } from "express";

import { AuthService } from "../auth/auth.service";
import { platformCapabilities } from "../platform/platform-operator.policy";
import { BOOTSTRAP_ORGANIZATION_SLUG } from "../auth/organization-resolution.policy";
import { ControlledAccessGrantEntity } from "./entities/controlled-access-grant.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { PlatformOperatorGrantEntity } from "./entities/platform-operator-grant.entity";
import { UserEntity } from "./entities/user.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import {
  PHOENIX_OWNER_EMAIL,
  PHOENIX_OWNER_NAME,
  PHOENIX_OWNER_PASSWORD,
} from "./phoenix-owner-credentials";

const PHOENIX_BUSINESS_NAME = "Phoenix Fireplace";
const PHOENIX_FIREPLACE_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const PHOENIX_TARGET_SLUG = "phoenix";
const DEFAULT_OWNER_EMAIL = PHOENIX_OWNER_EMAIL;
const DEFAULT_OWNER_PASSWORD = PHOENIX_OWNER_PASSWORD;
const DEFAULT_OWNER_NAME = PHOENIX_OWNER_NAME;

type ActivationReport = {
  ok: boolean;
  phase: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
  user?: {
    id: string;
    email: string;
  };
  grant?: {
    id: string;
    grant_type: string;
    reason_code: string;
    expires_at: string;
  };
  platform_capabilities?: string[];
  bootstrap_membership_suspended?: boolean;
  destination?: string | null;
  slugDecision?: string;
  errors: string[];
};

function buildReport(partial: Partial<ActivationReport>): ActivationReport {
  return {
    ok: false,
    phase: "init",
    errors: [],
    ...partial,
  };
}

async function resolveSlugDecision(dataSource: DataSource) {
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const bootstrapOrg = await orgRepo.findOne({ where: { slug: PHOENIX_TARGET_SLUG } });
  const phoenixFireplaceOrg = await orgRepo.findOne({ where: { name: PHOENIX_BUSINESS_NAME } });

  if (phoenixFireplaceOrg) {
    return {
      note: `Existing Phoenix Fireplace organization found with slug ${phoenixFireplaceOrg.slug}.`,
      bootstrapOrg,
      existingOrg: phoenixFireplaceOrg,
    };
  }

  if (!bootstrapOrg) {
    return {
      note: "Slug phoenix is available. Signup with Business Name Phoenix Fireplace will create phoenix-fireplace by default; update slug later if phoenix is required for booking/import.",
      bootstrapOrg: null,
    };
  }

  return {
    note: `Bootstrap org (${bootstrapOrg.name}) owns slug phoenix. Signup will create phoenix-fireplace for the real operating workspace.`,
    bootstrapOrg,
  };
}

function mockRequest(): Request {
  return {
    ip: "127.0.0.1",
    get: (header: string) => (header.toLowerCase() === "user-agent" ? "phoenix-activation" : undefined),
    cookies: {},
  } as unknown as Request;
}

function mockResponse(): Response {
  return {
    cookie() {
      /* noop */
    },
    clearCookie() {
      /* noop */
    },
  } as unknown as Response;
}

function buildAuthRequestResponse() {
  return {
    request: mockRequest(),
    response: mockResponse(),
  };
}

async function registerPhoenixOwner(authService: AuthService) {
  const { request, response } = buildAuthRequestResponse();
  return authService.register(
    {
      email: DEFAULT_OWNER_EMAIL,
      password: DEFAULT_OWNER_PASSWORD,
      fullName: DEFAULT_OWNER_NAME,
      phone: null,
      organizationName: PHOENIX_BUSINESS_NAME,
    },
    request,
    response,
  );
}

async function loginPhoenixOwner(authService: AuthService) {
  const { request, response } = buildAuthRequestResponse();
  return authService.login(DEFAULT_OWNER_EMAIL, DEFAULT_OWNER_PASSWORD, request, response);
}

async function ensureControlledAccessGrant(
  dataSource: DataSource,
  organizationId: string,
  createdByUserId: string | null,
) {
  const grantRepo = dataSource.getRepository(ControlledAccessGrantEntity);
  const now = new Date();
  const existing = await grantRepo.findOne({
    where: {
      organization_id: organizationId,
      starts_at: LessThanOrEqual(now),
      expires_at: MoreThan(now),
      revoked_at: IsNull(),
    },
    order: { created_at: "DESC" },
  });

  if (existing) {
    return existing;
  }

  const startsAt = new Date(now.getTime() - 60_000);
  const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  return grantRepo.save(
    grantRepo.create({
      organization_id: organizationId,
      grant_type: "owner_internal",
      reason_code: "phoenix_first_operating_workspace",
      starts_at: startsAt,
      expires_at: expiresAt,
      revoked_at: null,
      notes: "Phoenix Fireplace — first real operating workspace; CRM access without Stripe checkout",
      created_by_user_id: createdByUserId,
    }),
  );
}

async function ensurePlatformOperatorGrants(dataSource: DataSource, userId: string) {
  const grantRepo = dataSource.getRepository(PlatformOperatorGrantEntity);
  const now = new Date();
  const granted: string[] = [];

  for (const capability of platformCapabilities) {
    const existing = await grantRepo.findOne({
      where: {
        user_id: userId,
        capability,
        revoked_at: IsNull(),
      },
    });

    if (existing) {
      granted.push(capability);
      continue;
    }

    await grantRepo.save(
      grantRepo.create({
        user_id: userId,
        capability,
        granted_at: now,
        granted_by_user_id: userId,
        revoked_at: null,
        notes: "Phoenix development platform operator",
      }),
    );
    granted.push(capability);
  }

  return granted;
}

async function ensureOwnerMembership(
  dataSource: DataSource,
  userId: string,
  organizationId: string,
) {
  const membershipRepo = dataSource.getRepository(MembershipEntity);
  const existing = await membershipRepo.findOne({
    where: {
      user_id: userId,
      organization_id: organizationId,
    },
  });

  if (existing) {
    if (existing.status !== "active" || existing.role !== "owner") {
      existing.status = "active";
      existing.role = "owner";
      await membershipRepo.save(existing);
    }
    return existing;
  }

  return membershipRepo.save(
    membershipRepo.create({
      user_id: userId,
      organization_id: organizationId,
      role: "owner",
      status: "active",
    }),
  );
}

async function suspendBootstrapMembershipIfPresent(dataSource: DataSource, userId: string) {
  const membershipRepo = dataSource.getRepository(MembershipEntity);
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const bootstrapOrg = await orgRepo.findOne({ where: { slug: BOOTSTRAP_ORGANIZATION_SLUG } });
  if (!bootstrapOrg) {
    return false;
  }

  const bootstrapMembership = await membershipRepo.findOne({
    where: {
      user_id: userId,
      organization_id: bootstrapOrg.id,
      status: "active",
    },
  });

  if (!bootstrapMembership) {
    return false;
  }

  bootstrapMembership.status = "suspended";
  await membershipRepo.save(bootstrapMembership);
  return true;
}

async function main() {
  const report = buildReport({ phase: "starting" });
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const slugDecision = await resolveSlugDecision(dataSource);
    report.slugDecision = slugDecision.note;

    const userRepo = dataSource.getRepository(UserEntity);
    const orgRepo = dataSource.getRepository(OrganizationEntity);
    const existingUser = await userRepo.findOne({ where: { email: DEFAULT_OWNER_EMAIL } });
    const existingPhoenixSignupOrg = await orgRepo.findOne({
      where: { name: PHOENIX_BUSINESS_NAME },
    }) ?? await orgRepo.findOne({ where: { id: PHOENIX_FIREPLACE_ORG_ID } });

    let organizationId: string | null = existingPhoenixSignupOrg?.id ?? null;
    let userId: string | null = existingUser?.id ?? null;

    const { NestFactory } = await import("@nestjs/core");
    const { AppModule } = await import("../app.module");
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

    try {
      const authService = app.get(AuthService);

      if (existingPhoenixSignupOrg && existingUser) {
        report.phase = "existing_signup_reused";
      } else if (existingUser && !existingPhoenixSignupOrg) {
        report.errors.push("Owner email already exists without Phoenix Fireplace organization.");
        report.phase = "failed";
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = 1;
        return;
      } else {
        const actor = await registerPhoenixOwner(authService);
        organizationId = actor.organization_id;
        userId = actor.user.id;
        report.phase = "signup_completed";
      }

      if (!organizationId || !userId) {
        throw new Error("Phoenix organization or owner user could not be resolved.");
      }

      const organization = await orgRepo.findOne({ where: { id: organizationId } });
      if (!organization) {
        throw new Error("Phoenix organization row missing after signup.");
      }

      report.organization = {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      };
      report.user = {
        id: userId,
        email: DEFAULT_OWNER_EMAIL,
      };

      const grant = await ensureControlledAccessGrant(dataSource, organization.id, userId);
      report.grant = {
        id: grant.id,
        grant_type: grant.grant_type,
        reason_code: grant.reason_code,
        expires_at: grant.expires_at.toISOString(),
      };
      report.phase = "grant_applied";

      await ensureOwnerMembership(dataSource, userId, organization.id);
      report.bootstrap_membership_suspended = await suspendBootstrapMembershipIfPresent(dataSource, userId);
      report.platform_capabilities = await ensurePlatformOperatorGrants(dataSource, userId);

      const eligible = await authService.isOrganizationOperationallyEligible(organization.id);
      if (!eligible) {
        throw new Error("Organization is still not operationally eligible after grant insert.");
      }

      const actor = await loginPhoenixOwner(authService);
      if (actor.organization_id !== organization.id) {
        throw new Error("Login resolved a different active organization than Phoenix Fireplace.");
      }

      report.destination = await authService.resolveClientDestination(actor);
      if (report.destination !== "/home") {
        throw new Error(`Expected destination /home but received ${report.destination ?? "null"}.`);
      }
    } finally {
      await app.close();
    }

    report.phase = "verified";
    report.ok = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    report.phase = "failed";
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    await dataSource.destroy();
  }
}

void main();
