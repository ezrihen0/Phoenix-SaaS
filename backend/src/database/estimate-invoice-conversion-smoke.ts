import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";

import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { JobEntity } from "./entities/job.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { resolveSmokeDatabasePlan } from "./db-smoke-database-plan";
import {
  applyEphemeralDatabaseAccessSkip,
  assertConfiguredSmokeDatabaseIsSafe,
  buildConversionService,
  cleanupConversionSmokeOrganizations,
  extractErrorCode,
  finalizeSmokeSummary,
  requireMySqlOptions,
  seedConversionSmokeFixture,
  seedDraftEstimateJob,
  seedEmptyInvoiceShell,
  seedInvoiceWithManualLine,
  seedLockedEmptyInvoice,
  type SmokeOutcome,
  type SmokePhaseStatus,
} from "./estimate-invoice-conversion-smoke.harness";
import { verifyDatabaseSchema } from "./verify-schema";

type SmokeSummary = {
  ok: boolean;
  outcome?: SmokeOutcome;
  database: string;
  phases: Record<string, SmokePhaseStatus>;
  results: Array<{ name: string; status: "PASS" | "FAIL" | "SKIP"; detail?: unknown }>;
  errors: string[];
};

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

async function expectFailCode(summary: SmokeSummary, name: string, expectedCode: string, run: () => Promise<unknown>) {
  try {
    await run();
    summary.results.push({ name, status: "FAIL", detail: "Expected failure but call succeeded." });
    throw new Error(`${name}: expected ${expectedCode}`);
  } catch (error) {
    const code = extractErrorCode(error);
    if (code !== expectedCode) {
      summary.results.push({ name, status: "FAIL", detail: { expectedCode, actual: code } });
      throw new Error(`${name}: expected ${expectedCode}, got ${code}`);
    }
    summary.results.push({ name, status: "PASS", detail: code });
  }
}

async function runTests(summary: SmokeSummary, dataSource: DataSource) {
  const conversionService = buildConversionService(dataSource);
  const fixture = await seedConversionSmokeFixture(dataSource);

  await expectPass(summary, "happy path converts approved estimate to invoice with source quote", async () => {
    const invoice = await conversionService.convertFromEstimate({
      organizationId: fixture.organizationId,
      jobId: fixture.jobId,
      estimateId: fixture.quoteId,
      actor: fixture.actor,
    });

    assert.equal(invoice.source_quote_id, fixture.quoteId);

    const lines = await dataSource.getRepository(InvoiceLineItemEntity).find({
      where: { invoice_id: invoice.id },
      order: { sort_order: "ASC" },
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.unit_price_cents_snapshot, 12_345);

    return { invoiceId: invoice.id, unitPrice: lines[0]?.unit_price_cents_snapshot };
  });

  await expectFailCode(
    summary,
    "duplicate conversion returns invoice_already_converted",
    "invoice_already_converted",
    async () =>
      conversionService.convertFromEstimate({
        organizationId: fixture.organizationId,
        jobId: fixture.jobId,
        estimateId: fixture.quoteId,
        actor: fixture.actor,
      }),
  );

  const manualFixture = await seedConversionSmokeFixture(dataSource);
  await seedInvoiceWithManualLine(dataSource, {
    organizationId: manualFixture.organizationId,
    jobId: manualFixture.jobId,
    userId: manualFixture.userId,
  });

  await expectFailCode(
    summary,
    "invoice with manual lines returns invoice_exists",
    "invoice_exists",
    async () =>
      conversionService.convertFromEstimate({
        organizationId: manualFixture.organizationId,
        jobId: manualFixture.jobId,
        estimateId: manualFixture.quoteId,
        actor: manualFixture.actor,
      }),
  );

  const draft = await seedDraftEstimateJob(dataSource, fixture.organizationId, fixture.userId);
  await expectFailCode(
    summary,
    "draft estimate returns estimate_not_approved",
    "estimate_not_approved",
    async () =>
      conversionService.convertFromEstimate({
        organizationId: fixture.organizationId,
        jobId: draft.jobId,
        estimateId: draft.quoteId,
        actor: fixture.actor,
      }),
  );

  await expectFailCode(
    summary,
    "foreign organization job returns job_not_found",
    "job_not_found",
    async () =>
      conversionService.convertFromEstimate({
        organizationId: fixture.foreignOrganizationId,
        jobId: fixture.jobId,
        estimateId: fixture.quoteId,
        actor: fixture.actor,
      }),
  );

  await expectFailCode(
    summary,
    "unknown estimate id returns estimate_not_found",
    "estimate_not_found",
    async () =>
      conversionService.convertFromEstimate({
        organizationId: fixture.organizationId,
        jobId: fixture.jobId,
        estimateId: randomUUID(),
        actor: fixture.actor,
      }),
  );

  const mismatchFixture = await seedConversionSmokeFixture(dataSource);
  const foreignJob = await dataSource.getRepository(JobEntity).save(
    dataSource.getRepository(JobEntity).create({
      organization_id: mismatchFixture.organizationId,
      customer_id: mismatchFixture.customerId,
      service_id: null,
      assigned_technician_id: null,
      title: `Mismatch job ${mismatchFixture.token}`,
      description: "Estimate job mismatch fixture",
      lead_source: "phone",
      requested_service_type: "inspection",
      job_type: "inspection",
      status: "completed",
      service_address_line_1: "400 Smoke Lane",
      service_address_line_2: null,
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T2P1A4",
      scheduled_for: new Date(),
      scheduled_window: "morning",
      requested_at: new Date(),
      on_the_way_at: null,
      started_at: null,
      completed_at: new Date(),
      paid_at: null,
      cancellation_reason: null,
      cancelled_at: null,
      cancelled_by: null,
      created_by_auth_user_id: mismatchFixture.userId,
      updated_by_auth_user_id: mismatchFixture.userId,
    }),
  );

  await expectFailCode(
    summary,
    "estimate job mismatch returns estimate_not_found",
    "estimate_not_found",
    async () =>
      conversionService.convertFromEstimate({
        organizationId: mismatchFixture.organizationId,
        jobId: foreignJob.id,
        estimateId: mismatchFixture.quoteId,
        actor: mismatchFixture.actor,
      }),
  );

  const rejectedJobFixture = await seedConversionSmokeFixture(dataSource);
  await dataSource.getRepository(QuoteEntity).update(
    { id: rejectedJobFixture.quoteId },
    { status: "rejected", approved_at: new Date() },
  );

  await expectFailCode(
    summary,
    "rejected estimate returns estimate_not_approved",
    "estimate_not_approved",
    async () =>
      conversionService.convertFromEstimate({
        organizationId: rejectedJobFixture.organizationId,
        jobId: rejectedJobFixture.jobId,
        estimateId: rejectedJobFixture.quoteId,
        actor: rejectedJobFixture.actor,
      }),
  );

  const shellFixture = await seedConversionSmokeFixture(dataSource);
  await seedEmptyInvoiceShell(dataSource, {
    organizationId: shellFixture.organizationId,
    jobId: shellFixture.jobId,
  });

  await expectPass(summary, "empty invoice shell converts without overwriting manual compose path", async () => {
    const invoice = await conversionService.convertFromEstimate({
      organizationId: shellFixture.organizationId,
      jobId: shellFixture.jobId,
      estimateId: shellFixture.quoteId,
      actor: shellFixture.actor,
    });

    const lines = await dataSource.getRepository(InvoiceLineItemEntity).find({
      where: { invoice_id: invoice.id },
    });
    assert.equal(lines.length, 1);
    return { invoiceId: invoice.id, lineCount: lines.length };
  });

  const lockedFixture = await seedConversionSmokeFixture(dataSource);
  await seedLockedEmptyInvoice(dataSource, {
    organizationId: lockedFixture.organizationId,
    jobId: lockedFixture.jobId,
  });

  await expectFailCode(
    summary,
    "locked invoice returns invoice_locked",
    "invoice_locked",
    async () =>
      conversionService.convertFromEstimate({
        organizationId: lockedFixture.organizationId,
        jobId: lockedFixture.jobId,
        estimateId: lockedFixture.quoteId,
        actor: lockedFixture.actor,
      }),
  );
}

async function main() {
  const options = requireMySqlOptions();
  const plan = resolveSmokeDatabasePlan(options, "wizfield_estimate_conversion_verify");
  const summary = createSummary(plan.databaseName);

  let adminConnection: mysql.Connection | null = null;
  let dataSource: DataSource | null = null;
  let ephemeralSkipped = false;

  try {
    if (plan.mode === "configured") {
      assertConfiguredSmokeDatabaseIsSafe(plan.databaseName);
    }

    if (plan.mode === "ephemeral") {
      adminConnection = await mysql.createConnection({
        host: options.host,
        port: options.port,
        user: options.username,
        password: options.password,
        multipleStatements: true,
      });

      if (plan.shouldDrop) {
        await adminConnection.query(`DROP DATABASE IF EXISTS \`${plan.databaseName}\``);
      }

      await adminConnection.query(
        `CREATE DATABASE \`${plan.databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
    }

    summary.phases.databaseCreate = "PASS";

    dataSource = new DataSource({
      ...options,
      database: plan.databaseName,
      synchronize: false,
      migrationsRun: false,
      logging: false,
    });

    await dataSource.initialize();

    if (plan.mode === "ephemeral") {
      await dataSource.runMigrations();
    }

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
        if (plan.mode === "configured") {
          await cleanupConversionSmokeOrganizations(dataSource);
        }
        await dataSource.destroy();
      }
      if (plan.mode === "ephemeral" && adminConnection) {
        if (plan.shouldDrop) {
          await adminConnection.query(`DROP DATABASE IF EXISTS \`${plan.databaseName}\``);
        }
        await adminConnection.end();
      }
      summary.phases.cleanup = "PASS";
    } catch (error) {
      summary.errors.push(`cleanup: ${extractErrorCode(error)}`);
    }
  }

  ephemeralSkipped = applyEphemeralDatabaseAccessSkip(summary, plan);
  finalizeSmokeSummary(summary, ephemeralSkipped);

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
