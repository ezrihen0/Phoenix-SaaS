import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { buildBillingSmokeHarness } from "./billing-smoke-harness";
import { BillingAccountEntity } from "./entities/billing-account.entity";
import { ControlledAccessGrantEntity } from "./entities/controlled-access-grant.entity";
import { OrganizationBillingEntity } from "./entities/organization-billing.entity";
import { OrganizationEntity } from "./entities/organization.entity";
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

type Seed = { organizationId: string; billingAccountId: string };

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Billing lifecycle smoke test currently supports MySQL only.");
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

async function seedSignupLikeHarness(dataSource: DataSource, token: string): Promise<Seed> {
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const billingRepo = dataSource.getRepository(BillingAccountEntity);
  const coverageRepo = dataSource.getRepository(OrganizationBillingEntity);

  const organization = await orgRepo.save(
    orgRepo.create({
      name: `Billing Lifecycle Org ${token}`,
      slug: `billing-life-${token}`,
      is_active: true,
    }),
  );

  const billingAccount = await billingRepo.save(
    billingRepo.create({
      owner_user_id: null,
      anchor_organization_id: organization.id,
      plan_key: "starter",
      billing_status: "trialing",
      organization_limit: 1,
      billing_provider: null,
      provider_customer_id: null,
      provider_subscription_id: null,
      provider_price_id: null,
      clover_customer_id: null,
      clover_plan_id: null,
      clover_subscription_id: null,
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      deactivated_at: null,
      last_clover_sync_at: null,
      last_provider_sync_at: null,
      last_webhook_at: null,
      attention_reason: null,
    }),
  );

  await coverageRepo.save(
    coverageRepo.create({
      organization_id: organization.id,
      billing_account_id: billingAccount.id,
      plan_key: billingAccount.plan_key,
      billing_status: billingAccount.billing_status,
      clover_customer_id: null,
      clover_plan_id: null,
      clover_subscription_id: null,
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      deactivated_at: null,
      last_clover_sync_at: null,
      last_webhook_at: null,
      attention_reason: null,
    }),
  );

  return { organizationId: organization.id, billingAccountId: billingAccount.id };
}

async function runCases(summary: SmokeSummary, dataSource: DataSource, seed: Seed) {
  const harness = buildBillingSmokeHarness(dataSource);

  await expectPass(summary, "L1 — signup-like trialing workspace is operationally eligible without Stripe", async () => {
    const eligible = await harness.authService.isOrganizationOperationallyEligible(seed.organizationId);
    if (!eligible) throw new Error("Expected local trialing workspace to be operationally eligible.");
    return { eligible };
  });

  await expectPass(summary, "L2 — local active billing state unlocks operational access", async () => {
    await harness.orchestration.applyProviderSnapshot({
      provider: "clover",
      billingAccountId: seed.billingAccountId,
      organizationId: seed.organizationId,
      providerCustomerId: `cus_${seed.billingAccountId.slice(0, 8)}`,
      providerSubscriptionId: `sub_${seed.billingAccountId.slice(0, 8)}`,
      providerPriceId: null,
      planKey: "starter",
      billingStatus: "active",
      lastProviderSyncAt: new Date(),
      lastWebhookAt: null,
    });
    const eligible = await harness.authService.isOrganizationOperationallyEligible(seed.organizationId);
    if (!eligible) throw new Error("Expected local active state to unlock operational access.");
    return { eligible };
  });

  await expectPass(summary, "L3 — past_due billing state removes operational access", async () => {
    await harness.orchestration.applyProviderSnapshot({
      provider: "clover",
      billingAccountId: seed.billingAccountId,
      organizationId: seed.organizationId,
      providerCustomerId: `cus_${seed.billingAccountId.slice(0, 8)}`,
      providerSubscriptionId: `sub_${seed.billingAccountId.slice(0, 8)}`,
      providerPriceId: null,
      planKey: "starter",
      billingStatus: "past_due",
      lastProviderSyncAt: new Date(),
      lastWebhookAt: null,
    });
    const eligible = await harness.authService.isOrganizationOperationallyEligible(seed.organizationId);
    if (eligible) throw new Error("Expected past_due billing state to deny operational access.");
    return { eligible };
  });

  await expectPass(summary, "L4 — deactivated billing state keeps workspace locked", async () => {
    await harness.orchestration.applyProviderSnapshot({
      provider: "clover",
      billingAccountId: seed.billingAccountId,
      organizationId: seed.organizationId,
      providerCustomerId: `cus_${seed.billingAccountId.slice(0, 8)}`,
      providerSubscriptionId: `sub_${seed.billingAccountId.slice(0, 8)}`,
      providerPriceId: null,
      planKey: "starter",
      billingStatus: "deactivated",
      lastProviderSyncAt: new Date(),
      lastWebhookAt: null,
    });
    const eligible = await harness.authService.isOrganizationOperationallyEligible(seed.organizationId);
    if (eligible) throw new Error("Expected deactivated billing state to deny operational access.");
    return { eligible };
  });

  await expectPass(summary, "L5 — controlled access grant unlocks without subscription state", async () => {
    const grantRepo = dataSource.getRepository(ControlledAccessGrantEntity);
    const now = new Date();
    await grantRepo.save(
      grantRepo.create({
        organization_id: seed.organizationId,
        grant_type: "owner_internal",
        reason_code: "billing_lifecycle_smoke",
        starts_at: new Date(now.getTime() - 60_000),
        expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        revoked_at: null,
        notes: "smoke grant",
        created_by_user_id: null,
      }),
    );
    const eligible = await harness.authService.isOrganizationOperationallyEligible(seed.organizationId);
    if (!eligible) throw new Error("Expected active controlled access grant to unlock operational access.");
    return { eligible };
  });
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_billing_life_${Date.now()}`;
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

    const seed = await seedSignupLikeHarness(dataSource, randomUUID().slice(0, 8));
    summary.phases.seeding = "PASS";

    await runCases(summary, dataSource, seed);
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
