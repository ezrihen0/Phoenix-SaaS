import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";
import type { Request, Response } from "express";

import type { ActorContext } from "../common/request-types";
import { buildBillingSmokeHarness } from "./billing-smoke-harness";
import { BillingAccountEntity } from "./entities/billing-account.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";

type SmokeStatus = "PASS" | "FAIL";
type SmokeResult = { name: string; status: SmokeStatus; detail?: unknown };
type SmokeSummary = {
  ok: boolean;
  database: string;
  phases: Record<string, SmokeStatus>;
  results: SmokeResult[];
  errors: string[];
  cleanup: { droppedDatabase: boolean };
};

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Billing multi-org smoke test currently supports MySQL only.");
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
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function extractErrorCode(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse() as { error?: { code?: string; message?: string } };
    return response?.error?.code ?? error.message;
  }
  if (error instanceof Error) return error.message;
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
      seeding: "FAIL",
      cleanup: "FAIL",
    },
    results: [],
    errors: [],
    cleanup: { droppedDatabase: false },
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

async function expectApiError(
  summary: SmokeSummary,
  name: string,
  expectedCode: string,
  run: () => Promise<unknown>,
) {
  try {
    await run();
    summary.results.push({ name, status: "FAIL", detail: "Expected API rejection but call succeeded." });
    throw new Error(`${name}: expected rejection`);
  } catch (error) {
    const code = extractErrorCode(error);
    if (code !== expectedCode) {
      summary.results.push({ name, status: "FAIL", detail: code });
      throw error;
    }
    summary.results.push({ name, status: "PASS", detail: code });
  }
}

function createSessionMocks() {
  const cookies: Record<string, string> = {};
  const request = {
    ip: "127.0.0.1",
    get: () => undefined,
    cookies,
  } as unknown as Request;
  const response = {
    cookie(name: string, value: string) {
      cookies[name] = value;
    },
    clearCookie() {
      /* noop */
    },
  } as unknown as Response;
  return { request, response };
}

async function seedPaidAccount(
  dataSource: DataSource,
  input: {
    token: string;
    planKey: "starter" | "pro" | "business";
    organizationLimit: number | null;
  },
) {
  const harness = buildBillingSmokeHarness(dataSource);
  const email = `multi-org-${input.planKey}-${input.token}@example.com`;
  const { request, response } = createSessionMocks();
  const actor = await harness.authService.register(
    {
      email,
      password: "StrongPass123!",
      fullName: `${input.planKey} owner`,
      phone: null,
      organizationName: `${input.planKey} Org ${input.token}`,
    },
    request,
    response,
  );

  const organizationId = actor.organization_id ?? "";
  const context = await harness.organizationBillingService.getOrCreateContextForOrganization(organizationId);

  await dataSource.getRepository(BillingAccountEntity).update(
    { id: context.account.id },
    {
      plan_key: input.planKey,
      billing_status: "active",
      organization_limit: input.organizationLimit,
    },
  );

  return { harness, actor: actor as ActorContext, organizationId, billingAccountId: context.account.id, request };
}

async function runCases(summary: SmokeSummary, dataSource: DataSource) {
  const token = randomUUID().slice(0, 8);

  await expectPass(summary, "M1 — starter plan allows one organization only", async () => {
    const seed = await seedPaidAccount(dataSource, { token: `${token}-starter`, planKey: "starter", organizationLimit: 1 });
    const context = await seed.harness.organizationBillingService.getOrCreateContextForOrganization(seed.organizationId);
    if (context.canAddOrganization) {
      throw new Error("Starter plan with one covered org should not allow another organization.");
    }
    return { coveredOrganizationCount: context.coveredOrganizationCount, organizationLimit: context.organizationLimit };
  });

  await expectApiError(
    summary,
    "M2 — starter plan rejects second organization",
    "organization_limit_reached",
    async () => {
      const seed = await seedPaidAccount(dataSource, { token: `${token}-starter2`, planKey: "starter", organizationLimit: 1 });
      await seed.harness.authService.createOrganizationForActiveAccount(seed.actor, "Second Starter Org", seed.request);
    },
  );

  await expectPass(summary, "M3 — pro plan allows up to three organizations", async () => {
    const seed = await seedPaidAccount(dataSource, { token: `${token}-pro`, planKey: "pro", organizationLimit: 3 });
    await seed.harness.authService.createOrganizationForActiveAccount(seed.actor, "Pro Org Two", seed.request);
    await seed.harness.authService.createOrganizationForActiveAccount(seed.actor, "Pro Org Three", seed.request);
    const context = await seed.harness.organizationBillingService.getOrCreateContextForOrganization(seed.organizationId);
    if (context.coveredOrganizationCount !== 3) {
      throw new Error(`Expected 3 covered organizations on pro plan, got ${context.coveredOrganizationCount}.`);
    }
    if (context.canAddOrganization) {
      throw new Error("Pro plan with 3 covered orgs must not allow another organization.");
    }
    return { coveredOrganizationCount: context.coveredOrganizationCount };
  });

  await expectApiError(
    summary,
    "M4 — pro plan rejects fourth organization",
    "organization_limit_reached",
    async () => {
      const seed = await seedPaidAccount(dataSource, { token: `${token}-pro2`, planKey: "pro", organizationLimit: 3 });
      await seed.harness.authService.createOrganizationForActiveAccount(seed.actor, "Pro Org Two", seed.request);
      await seed.harness.authService.createOrganizationForActiveAccount(seed.actor, "Pro Org Three", seed.request);
      await seed.harness.authService.createOrganizationForActiveAccount(seed.actor, "Pro Org Four", seed.request);
    },
  );

  await expectPass(summary, "M5 — business plan allows expanded organization coverage", async () => {
    const seed = await seedPaidAccount(dataSource, { token: `${token}-biz`, planKey: "business", organizationLimit: null });
    for (let index = 2; index <= 4; index += 1) {
      await seed.harness.authService.createOrganizationForActiveAccount(seed.actor, `Business Org ${index}`, seed.request);
    }
    const context = await seed.harness.organizationBillingService.getOrCreateContextForOrganization(seed.organizationId);
    if (context.coveredOrganizationCount < 4) {
      throw new Error(`Expected at least 4 covered organizations on business plan, got ${context.coveredOrganizationCount}.`);
    }
    if (!context.canAddOrganization) {
      throw new Error("Business plan should remain able to add organizations.");
    }
    return { coveredOrganizationCount: context.coveredOrganizationCount };
  });
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_billing_multi_org_${Date.now()}`;
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
    if (shouldDrop) await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await adminConnection.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    summary.phases.databaseCreate = "PASS";

    dataSource = new DataSource({ ...options, database: databaseName, synchronize: false, migrationsRun: false, logging: false });
    await dataSource.initialize();
    await dataSource.runMigrations();
    summary.phases.migrations = "PASS";

    await verifyDatabaseSchema(dataSource);
    summary.phases.schemaVerify = "PASS";
    summary.phases.seeding = "PASS";

    await runCases(summary, dataSource);
    summary.ok = summary.results.every((row) => row.status === "PASS");
    summary.phases.cleanup = "PASS";
  } catch (error) {
    summary.errors.push(extractErrorCode(error));
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (shouldDrop) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
      summary.cleanup.droppedDatabase = true;
    }
    await adminConnection.end();
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exit(1);
}

void main();
