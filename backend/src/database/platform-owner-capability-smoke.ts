/**
 * Platform owner capability smoke — run: npm run platform:owner:smoke
 */
import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { DataSource } from "typeorm";

import { AuthService } from "../auth/auth.service";
import {
  PHOENIX_OWNER_EMAIL,
  PHOENIX_OWNER_PASSWORD,
} from "./phoenix-owner-credentials";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { PlatformOperatorGrantEntity } from "./entities/platform-operator-grant.entity";
import { UserEntity } from "./entities/user.entity";
import { buildDataSourceOptions } from "./typeorm.config";

const PHOENIX_FIREPLACE_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const BOOTSTRAP_ORG_ID = "90137527-3fd0-435c-9032-358f7f670662";
const BACKEND = process.env.PHOENIX_VERIFY_BASE_URL ?? "http://localhost:4000";

type SmokeResult = { name: string; status: "PASS" | "FAIL"; detail?: string };
type SmokeReport = {
  ok: boolean;
  results: SmokeResult[];
  errors: string[];
  cleanup: { testOrganizationId: string | null; removed: boolean };
};

function mockRequest(cookie?: string): Request {
  return {
    ip: "127.0.0.1",
    get: (header: string) => (header.toLowerCase() === "user-agent" ? "platform-owner-smoke" : undefined),
    cookies: cookie ? { wizfield_session: cookie } : {},
  } as unknown as Request;
}

function mockResponse(): Response & { getSessionCookie(): string | null } {
  let sessionCookie: string | null = null;
  return {
    cookie(name: string, value: string) {
      if (name === "wizfield_session") {
        sessionCookie = value;
      }
    },
    clearCookie() {
      sessionCookie = null;
    },
    getSessionCookie() {
      return sessionCookie;
    },
  } as unknown as Response & { getSessionCookie(): string | null };
}

function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) {
    return null;
  }

  return setCookieHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("wizfield_session="))
    ?.split(";")[0]
    ?.replace("wizfield_session=", "") ?? null;
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function cleanupTestOrganization(dataSource: DataSource, organizationId: string) {
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const org = await orgRepo.findOne({ where: { id: organizationId } });
  if (!org) {
    return false;
  }

  await dataSource.query("DELETE FROM organization_billing WHERE organization_id = ?", [organizationId]);
  await dataSource.query("DELETE FROM memberships WHERE organization_id = ?", [organizationId]);
  await dataSource.query("DELETE FROM controlled_access_grants WHERE organization_id = ?", [organizationId]);
  await dataSource.query("DELETE FROM billing_accounts WHERE anchor_organization_id = ?", [organizationId]);
  await orgRepo.delete({ id: organizationId });
  return true;
}

async function main() {
  const report: SmokeReport = {
    ok: false,
    results: [],
    errors: [],
    cleanup: { testOrganizationId: null, removed: false },
  };

  function pass(name: string, detail?: string) {
    report.results.push({ name, status: "PASS", detail });
  }

  function fail(name: string, detail?: string) {
    report.results.push({ name, status: "FAIL", detail });
    report.errors.push(`${name}: ${detail ?? "failed"}`);
  }

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("../app.module");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  let testOrganizationId: string | null = null;

  try {
    const authService = app.get(AuthService);
    const userRepo = dataSource.getRepository(UserEntity);
    const grantRepo = dataSource.getRepository(PlatformOperatorGrantEntity);
    const membershipRepo = dataSource.getRepository(MembershipEntity);

    const ownerUser = await userRepo.findOne({ where: { email: PHOENIX_OWNER_EMAIL } });
    if (!ownerUser) {
      fail("phoenix_owner_exists", "Run phoenix:activate first.");
      throw new Error("Phoenix owner missing");
    }
    pass("phoenix_owner_exists");

    const grants = await grantRepo.find({
      where: { user_id: ownerUser.id },
    });
    if (grants.some((grant) => grant.capability === "organizations.create_standalone" && !grant.revoked_at)) {
      pass("platform_operator_grants_present");
    } else {
      fail("platform_operator_grants_present", "Missing organizations.create_standalone grant");
    }

    const phoenixMembership = await membershipRepo.findOne({
      where: {
        user_id: ownerUser.id,
        organization_id: PHOENIX_FIREPLACE_ORG_ID,
        status: "active",
        role: "owner",
      },
    });
    if (phoenixMembership) {
      pass("phoenix_owner_membership");
    } else {
      fail("phoenix_owner_membership", "Owner membership missing on Phoenix Fireplace");
    }

    const bootstrapMembership = await membershipRepo.findOne({
      where: {
        user_id: ownerUser.id,
        organization_id: BOOTSTRAP_ORG_ID,
        status: "active",
      },
    });
    if (!bootstrapMembership) {
      pass("bootstrap_membership_not_active");
    } else {
      fail("bootstrap_membership_not_active", "Bootstrap membership still active for Phoenix owner");
    }

    const loginResponse = mockResponse();
    const loginActor = await authService.login(
      PHOENIX_OWNER_EMAIL,
      PHOENIX_OWNER_PASSWORD,
      mockRequest(),
      loginResponse,
    );

    if (loginActor.organization_id === PHOENIX_FIREPLACE_ORG_ID) {
      pass("login_default_org_phoenix_fireplace");
    } else {
      fail("login_default_org_phoenix_fireplace", `Got ${loginActor.organization_id}`);
    }

    if (loginActor.platform_capabilities.includes("organizations.create_standalone")) {
      pass("session_exposes_platform_capabilities");
    } else {
      fail("session_exposes_platform_capabilities");
    }

    const sessionCookie = loginResponse.getSessionCookie();
    assert.ok(sessionCookie, "session cookie required");

    const customersPhoenix = await fetchJson(`${BACKEND}/api/customers?page=1&pageSize=1`, {
      headers: { cookie: `wizfield_session=${sessionCookie}` },
    });
    const phoenixCustomerTotal = customersPhoenix.body?.data?.pagination?.totalCount
      ?? customersPhoenix.body?.pagination?.totalCount
      ?? null;
    if (phoenixCustomerTotal === 591) {
      pass("phoenix_customer_total_591");
    } else {
      fail("phoenix_customer_total_591", `Got ${String(phoenixCustomerTotal)}`);
    }

    const testOrgName = `Platform Smoke ${randomUUID().slice(0, 8)}`;
    const createRequest = mockRequest(sessionCookie ?? undefined);
    const createdActor = await authService.createStandaloneOrganizationForPlatformOperator(
      loginActor,
      testOrgName,
      createRequest,
    );
    testOrganizationId = createdActor.organization_id;
    report.cleanup.testOrganizationId = testOrganizationId;

    if (createdActor.organization_id && createdActor.organization?.name === testOrgName) {
      pass("platform_operator_creates_standalone_org");
    } else {
      fail("platform_operator_creates_standalone_org");
    }

    const customersTestOrg = await fetchJson(`${BACKEND}/api/customers?page=1&pageSize=1`, {
      headers: { cookie: `wizfield_session=${sessionCookie}` },
    });
    const testOrgCustomerTotal = customersTestOrg.body?.data?.pagination?.totalCount
      ?? customersTestOrg.body?.pagination?.totalCount
      ?? null;
    if (testOrgCustomerTotal === 0) {
      pass("test_org_empty_customers");
    } else {
      fail("test_org_empty_customers", `Got ${String(testOrgCustomerTotal)}`);
    }

    const switchBackRequest = mockRequest(sessionCookie ?? undefined);
    await authService.switchActiveOrganization(
      switchBackRequest,
      ownerUser.id,
      PHOENIX_FIREPLACE_ORG_ID,
    );
    const customersAfterSwitch = await fetchJson(`${BACKEND}/api/customers?page=1&pageSize=1`, {
      headers: { cookie: `wizfield_session=${sessionCookie}` },
    });
    const restoredTotal = customersAfterSwitch.body?.data?.pagination?.totalCount
      ?? customersAfterSwitch.body?.pagination?.totalCount
      ?? null;
    if (restoredTotal === 591) {
      pass("switch_back_to_phoenix_restores_591");
    } else {
      fail("switch_back_to_phoenix_restores_591", `Got ${String(restoredTotal)}`);
    }

    let bootstrapSwitchBlocked = false;
    try {
      await authService.switchActiveOrganization(
        mockRequest(sessionCookie ?? undefined),
        ownerUser.id,
        BOOTSTRAP_ORG_ID,
      );
    } catch {
      bootstrapSwitchBlocked = true;
      pass("bootstrap_switch_blocked_server_side");
    }
    if (!bootstrapSwitchBlocked) {
      fail("bootstrap_switch_blocked_server_side", "Expected 403");
    }

    const httpLogin = await fetchJson(`${BACKEND}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: PHOENIX_OWNER_EMAIL, password: PHOENIX_OWNER_PASSWORD }),
    });
    const httpCookie = extractSessionCookie(httpLogin.response.headers.get("set-cookie"));
    if (httpCookie) {
      const teamCreate = await fetchJson(`${BACKEND}/api/team/members`, {
        method: "POST",
        headers: {
          cookie: `wizfield_session=${httpCookie}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: `platform-smoke-${randomUUID().slice(0, 8)}@example.com`,
          password: "SmokeTest123!",
          fullName: "Platform Smoke User",
          role: "technician",
        }),
      });
      if (teamCreate.response.status === 201 || teamCreate.response.status === 200) {
        pass("platform_operator_creates_team_member");
      } else {
        fail("platform_operator_creates_team_member", `Status ${teamCreate.response.status}`);
      }
    } else {
      fail("platform_operator_creates_team_member", "Could not obtain HTTP session");
    }

    report.ok = report.errors.length === 0;
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    report.ok = false;
  } finally {
    if (testOrganizationId) {
      try {
        report.cleanup.removed = await cleanupTestOrganization(dataSource, testOrganizationId);
        if (report.cleanup.removed) {
          pass("cleanup_test_organization");
        }
      } catch (error) {
        fail("cleanup_test_organization", error instanceof Error ? error.message : String(error));
      }
    }

    await app.close();
    await dataSource.destroy();
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
