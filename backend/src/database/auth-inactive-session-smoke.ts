import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { Request, Response } from "express";
import mysql from "mysql2/promise";
import { DataSource, IsNull } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { listPermissionsForRole } from "../auth/permissions";
import { isPlatformCapability } from "../platform/platform-operator.policy";
import { buildBillingSmokeHarness } from "./billing-smoke-harness";
import { ControlledAccessGrantEntity } from "./entities/controlled-access-grant.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { PlatformOperatorGrantEntity } from "./entities/platform-operator-grant.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { UserEntity } from "./entities/user.entity";
import { AuthSessionEntity } from "./entities/auth-session.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";

type SmokeStatus = "PASS" | "FAIL";

type SmokeResult = {
  name: string;
  status: SmokeStatus;
  detail?: unknown;
};

type SmokeSummary = {
  ok: boolean;
  database: string;
  phases: Record<string, SmokeStatus>;
  results: SmokeResult[];
  errors: string[];
};

const TEST_PASSWORD = "SmokeInactiveSession1!";

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Auth inactive session smoke test currently supports MySQL only.");
  }

  return {
    ...(options as MysqlConnectionOptions),
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3306,
    username: options.username ?? "root",
    password: options.password ?? "",
    synchronize: false,
    migrationsRun: false,
    logging: false,
  };
}

function normalizeBooleanFlag(value: string | undefined, fallback: boolean) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function extractErrorCode(error: unknown) {
  if (error instanceof UnauthorizedException) {
    const response = error.getResponse() as { error?: { code?: string } };
    return response?.error?.code ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function createSummary(database: string): SmokeSummary {
  return {
    ok: false,
    database,
    phases: {
      databaseCreate: "FAIL",
      migrations: "FAIL",
      schemaVerify: "FAIL",
      tests: "FAIL",
      cleanup: "FAIL",
    },
    results: [],
    errors: [],
  };
}

async function expectPass(summary: SmokeSummary, name: string, run: () => Promise<unknown>) {
  try {
    const detail = await run();
    summary.results.push({ name, status: "PASS", detail });
  } catch (error) {
    summary.results.push({ name, status: "FAIL", detail: extractErrorCode(error) });
    throw error;
  }
}

function mockRequest(sessionToken: string | null): Request {
  return {
    ip: "127.0.0.1",
    get: (header: string) => (header.toLowerCase() === "user-agent" ? "auth-inactive-session-smoke" : undefined),
    cookies: sessionToken ? { wizfield_session: sessionToken } : {},
  } as Request;
}

function mockResponse(): Response & { getSessionToken(): string | null } {
  let sessionToken: string | null = null;

  return {
    cookie(name: string, value: string) {
      if (name === "wizfield_session") {
        sessionToken = value;
      }
    },
    clearCookie() {
      sessionToken = null;
    },
    getSessionToken() {
      return sessionToken;
    },
  } as unknown as Response & { getSessionToken(): string | null };
}

async function seedControlledAccessGrant(
  dataSource: DataSource,
  organizationId: string,
) {
  const grantRepo = dataSource.getRepository(ControlledAccessGrantEntity);
  const now = new Date();

  await grantRepo.save(
    grantRepo.create({
      organization_id: organizationId,
      grant_type: "owner_internal",
      reason_code: "auth_inactive_session_smoke",
      starts_at: new Date(now.getTime() - 86_400_000),
      expires_at: new Date(now.getTime() + 86_400_000 * 365),
      revoked_at: null,
      notes: "Auth inactive session smoke fixture",
      created_by_user_id: null,
    }),
  );
}

async function seedStaffUser(dataSource: DataSource) {
  const token = randomUUID().slice(0, 8);
  const email = `inactive-session-smoke-${token}@example.com`;
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  const organization = await dataSource.getRepository(OrganizationEntity).save(
    dataSource.getRepository(OrganizationEntity).create({
      name: `Inactive Session Smoke Org ${token}`,
      slug: `inactive-session-${token}`,
      is_active: true,
    }),
  );

  await seedControlledAccessGrant(dataSource, organization.id);

  const user = await dataSource.getRepository(UserEntity).save(
    dataSource.getRepository(UserEntity).create({
      email,
      password_hash: passwordHash,
      is_active: true,
    }),
  );

  await dataSource.getRepository(ProfileEntity).save(
    dataSource.getRepository(ProfileEntity).create({
      auth_user_id: user.id,
      full_name: `Inactive Session Smoke User ${token}`,
      phone: null,
      role: "owner",
    }),
  );

  await dataSource.getRepository(MembershipEntity).save(
    dataSource.getRepository(MembershipEntity).create({
      user_id: user.id,
      organization_id: organization.id,
      role: "owner",
      status: "active",
      custom_role_id: null,
      custom_permission_keys: null,
    }),
  );

  return {
    email,
    userId: user.id,
    organizationId: organization.id,
  };
}

async function runTests(summary: SmokeSummary, dataSource: DataSource) {
  const harness = buildBillingSmokeHarness(dataSource);
  const { authService } = harness;
  const userRepo = dataSource.getRepository(UserEntity);
  const membershipRepo = dataSource.getRepository(MembershipEntity);
  const sessionRepo = dataSource.getRepository(AuthSessionEntity);
  const platformGrantRepo = dataSource.getRepository(PlatformOperatorGrantEntity);

  const fixture = await seedStaffUser(dataSource);
  const response = mockResponse();

  let sessionToken: string | null = null;

  await expectPass(summary, "1 active user with valid session resolves ActorContext", async () => {
    await authService.login(fixture.email, TEST_PASSWORD, mockRequest(null), response);
    sessionToken = response.getSessionToken();

    if (!sessionToken) {
      throw new Error("session_token_missing");
    }

    const actor = await authService.resolveActorFromRequest(mockRequest(sessionToken));
    if (!actor?.organization_id || actor.user.id !== fixture.userId) {
      throw new Error("active_session_actor_missing");
    }

    return {
      organizationId: actor.organization_id,
      permissionCount: actor.permissions.length,
    };
  });

  if (!sessionToken) {
    throw new Error("session_token_not_established");
  }

  const sessionCountBeforeDisable = await sessionRepo.count({ where: { user_id: fixture.userId } });

  await expectPass(summary, "2 inactive user with valid session row fails ActorContext resolution", async () => {
    const user = await userRepo.findOneOrFail({ where: { id: fixture.userId } });
    user.is_active = false;
    await userRepo.save(user);

    const actor = await authService.resolveActorFromRequest(mockRequest(sessionToken));
    if (actor !== null) {
      throw new Error("inactive_user_should_not_resolve_actor");
    }

    return { actor: null };
  });

  await expectPass(summary, "3 auth_sessions row persists after user disable", async () => {
    const sessionCountAfterDisable = await sessionRepo.count({ where: { user_id: fixture.userId } });
    if (sessionCountAfterDisable < sessionCountBeforeDisable) {
      throw new Error("session_row_deleted_on_disable");
    }

    return { sessionCount: sessionCountAfterDisable };
  });

  await expectPass(summary, "5 disabled user login remains rejected", async () => {
    try {
      await authService.login(fixture.email, TEST_PASSWORD, mockRequest(null), mockResponse());
      throw new Error("inactive_login_should_fail");
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) {
        throw error;
      }

      const code = extractErrorCode(error);
      if (code !== "invalid_credentials") {
        throw new Error(`unexpected_login_error:${code}`);
      }

      return { code };
    }
  });

  let reactivatedUsable: boolean | null = null;

  await expectPass(summary, "4 reactivated user with same unexpired session — behavior observed", async () => {
    const user = await userRepo.findOneOrFail({ where: { id: fixture.userId } });
    user.is_active = true;
    await userRepo.save(user);

    const actor = await authService.resolveActorFromRequest(mockRequest(sessionToken));
    reactivatedUsable = actor !== null && actor.organization_id === fixture.organizationId;

    return {
      sameSessionUsableAfterReactivation: reactivatedUsable,
      organizationId: actor?.organization_id ?? null,
    };
  });

  await expectPass(summary, "6 active membership behavior unchanged after reactivation", async () => {
    const membership = await membershipRepo.findOneOrFail({
      where: {
        user_id: fixture.userId,
        organization_id: fixture.organizationId,
      },
    });

    if (membership.status !== "active") {
      throw new Error(`membership_status_changed:${membership.status}`);
    }

    const actor = await authService.resolveActorFromRequest(mockRequest(sessionToken));
    if (!actor?.membership || actor.membership.id !== membership.id) {
      throw new Error("membership_not_resolved");
    }

    return { membershipStatus: membership.status, membershipId: membership.id };
  });

  await expectPass(summary, "7 role and permission resolution remains DB-authoritative", async () => {
    const membership = await membershipRepo.findOneOrFail({
      where: {
        user_id: fixture.userId,
        organization_id: fixture.organizationId,
      },
    });

    membership.role = "viewer";
    await membershipRepo.save(membership);

    const actor = await authService.resolveActorFromRequest(mockRequest(sessionToken));
    const expectedPermissions = listPermissionsForRole("viewer");

    if (!actor || actor.role !== "viewer") {
      throw new Error("viewer_role_not_applied");
    }

    if (actor.permissions.length !== expectedPermissions.length) {
      throw new Error("viewer_permissions_mismatch");
    }

    membership.role = "owner";
    await membershipRepo.save(membership);

    return {
      viewerPermissionCount: actor.permissions.length,
      restoredRole: "owner",
    };
  });

  await expectPass(summary, "8 platform capability resolution remains DB-authoritative", async () => {
    await platformGrantRepo.save(
      platformGrantRepo.create({
        user_id: fixture.userId,
        capability: "organizations.create_standalone",
        granted_at: new Date(),
        revoked_at: null,
        granted_by_user_id: null,
        notes: "auth inactive session smoke",
      }),
    );

    const actorWithGrant = await authService.resolveActorFromRequest(mockRequest(sessionToken));
    if (!actorWithGrant?.platform_capabilities.includes("organizations.create_standalone")) {
      throw new Error("platform_capability_missing");
    }

    const grant = await platformGrantRepo.findOneOrFail({
      where: {
        user_id: fixture.userId,
        capability: "organizations.create_standalone",
        revoked_at: IsNull(),
      },
    });

    grant.revoked_at = new Date();
    await platformGrantRepo.save(grant);

    const actorWithoutGrant = await authService.resolveActorFromRequest(mockRequest(sessionToken));
    if (actorWithoutGrant?.platform_capabilities.includes("organizations.create_standalone")) {
      throw new Error("revoked_platform_capability_still_present");
    }

    if (!isPlatformCapability("organizations.create_standalone")) {
      throw new Error("capability_registry_invalid");
    }

    return {
      withGrant: actorWithGrant.platform_capabilities,
      withoutGrant: actorWithoutGrant?.platform_capabilities ?? [],
    };
  });
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_auth_inactive_session_${Date.now()}`;
  const shouldDrop = normalizeBooleanFlag(process.env.DB_SMOKE_DROP, false);
  const summary = createSummary(databaseName);

  const adminConnection = await mysql.createConnection({
    host: options.host,
    port: options.port,
    user: options.username,
    password: options.password,
    multipleStatements: true,
  });

  let dataSource: DataSource | null = null;

  try {
    if (shouldDrop) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    }

    await adminConnection.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    summary.phases.databaseCreate = "PASS";

    dataSource = new DataSource({
      ...options,
      database: databaseName,
      synchronize: false,
      migrationsRun: false,
      logging: false,
    });

    await dataSource.initialize();
    await dataSource.runMigrations();
    summary.phases.migrations = "PASS";

    await verifyDatabaseSchema(dataSource);
    summary.phases.schemaVerify = "PASS";

    await runTests(summary, dataSource);
    summary.phases.tests = summary.results.every((result) => result.status === "PASS") ? "PASS" : "FAIL";
  } catch (error) {
    summary.errors.push(extractErrorCode(error));
  } finally {
    try {
      if (dataSource?.isInitialized) {
        await dataSource.destroy();
      }
      if (shouldDrop) {
        await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
      }
      summary.phases.cleanup = "PASS";
    } catch (error) {
      summary.errors.push(`cleanup: ${extractErrorCode(error)}`);
    } finally {
      await adminConnection.end();
    }
  }

  const failedResults = summary.results.filter((result) => result.status === "FAIL");
  summary.ok = summary.errors.length === 0 && failedResults.length === 0;
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
