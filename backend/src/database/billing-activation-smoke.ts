import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";
import type { Request, Response } from "express";

import { buildBillingSmokeHarness } from "./billing-smoke-harness";
import { BillingAccountEntity } from "./entities/billing-account.entity";
import { UserEntity } from "./entities/user.entity";
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
    throw new Error("Billing activation smoke test currently supports MySQL only.");
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

function mockRequest(): Request {
  return {
    ip: "127.0.0.1",
    get: (header: string) => (header.toLowerCase() === "user-agent" ? "billing-activation-smoke" : undefined),
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

async function runCases(summary: SmokeSummary, dataSource: DataSource) {
  const harness = buildBillingSmokeHarness(dataSource);
  const token = randomUUID().slice(0, 8);
  const email = `billing-activation-${token}@example.com`;

  let organizationId = "";
  let billingAccountId = "";
  let actor = null as Awaited<ReturnType<typeof harness.authService.register>> | null;

  await expectPass(summary, "A1 — signup creates trialing workspace and routes to /home without Stripe", async () => {
    actor = await harness.authService.register(
      {
        email,
        password: "StrongPass123!",
        fullName: "Billing Activation Smoke",
        phone: null,
        organizationName: `Activation Org ${token}`,
      },
      mockRequest(),
      mockResponse(),
    );

    organizationId = actor.organization_id ?? "";
    if (!organizationId) throw new Error("Signup did not create an active organization.");

    const billingContext = await harness.organizationBillingService.getOrCreateContextForOrganization(organizationId);
    billingAccountId = billingContext.account.id;

    const destination = await harness.authService.resolveClientDestination(actor);
    if (destination !== "/home") {
      throw new Error(`Expected /home destination after signup, got ${destination ?? "null"}.`);
    }

    const eligible = await harness.authService.isOrganizationOperationallyEligible(organizationId);
    if (!eligible) throw new Error("Signup trialing state must unlock operational access without Stripe.");

    return { destination, billing_status: billingContext.account.billing_status };
  });

  await expectPass(summary, "A2 — signup has no provider subscription requirement", async () => {
    const context = await harness.organizationBillingService.getOrCreateContextForOrganization(organizationId);
    if (context.account.provider_subscription_id) {
      throw new Error("Signup should not create a provider subscription locally.");
    }
    const eligible = await harness.authService.isOrganizationOperationallyEligible(organizationId);
    if (!eligible) throw new Error("Local trialing billing state should remain operationally eligible.");
    return { eligible };
  });

  await expectPass(summary, "A3 — local active billing state routes to /home without webhook", async () => {
    await harness.orchestration.applyProviderSnapshot({
      provider: "clover",
      billingAccountId,
      organizationId,
      providerCustomerId: `cus_${token}`,
      providerSubscriptionId: `sub_${token}`,
      providerPriceId: null,
      planKey: "starter",
      billingStatus: "active",
      lastProviderSyncAt: new Date(),
      lastWebhookAt: null,
    });

    if (!actor) throw new Error("Missing actor from signup step.");
    const destination = await harness.authService.resolveClientDestination(actor);
    if (destination !== "/home") {
      throw new Error(`Expected /home destination after local activation, got ${destination ?? "null"}.`);
    }

    const eligible = await harness.authService.isOrganizationOperationallyEligible(organizationId);
    if (!eligible) throw new Error("Local active billing status must unlock operational access.");

    const billingRepo = dataSource.getRepository(BillingAccountEntity);
    const account = await billingRepo.findOne({ where: { id: billingAccountId } });
    if (!account) throw new Error("Billing account could not be reloaded.");
    if (account?.last_webhook_at) throw new Error("Non-Stripe local activation must not require a webhook timestamp.");

    return { destination, billing_status: account.billing_status };
  });

  await expectPass(summary, "A4 — password login routes to /home without Stripe", async () => {
    const loginActor = await harness.authService.login(
      email,
      "StrongPass123!",
      mockRequest(),
      mockResponse(),
    );
    const destination = await harness.authService.resolveClientDestination(loginActor);
    if (destination !== "/home") {
      throw new Error(`Expected /home destination after login, got ${destination ?? "null"}.`);
    }
    return { destination, organization_id: loginActor.organization_id };
  });

  await expectPass(summary, "A5 — duplicate signup email rejected without extra billing rows", async () => {
    const beforeUsers = await dataSource.getRepository(UserEntity).count();
    const beforeBilling = await dataSource.getRepository(BillingAccountEntity).count();

    try {
      await harness.authService.register(
        {
          email,
          password: "AnotherPass123!",
          fullName: "Duplicate Signup",
          phone: null,
          organizationName: "Duplicate Org",
        },
        mockRequest(),
        mockResponse(),
      );
      throw new Error("Expected duplicate signup rejection.");
    } catch (error) {
      const code = extractErrorCode(error);
      if (code !== "account_email_exists") throw error;
    }

    const afterUsers = await dataSource.getRepository(UserEntity).count();
    const afterBilling = await dataSource.getRepository(BillingAccountEntity).count();
    if (afterUsers !== beforeUsers || afterBilling !== beforeBilling) {
      throw new Error("Duplicate signup must not create extra user or billing rows.");
    }

    return { code: "account_email_exists" };
  });
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_billing_activation_${Date.now()}`;
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
