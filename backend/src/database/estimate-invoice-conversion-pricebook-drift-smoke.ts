import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";

import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { PricebookItemEntity } from "./entities/pricebook-item.entity";
import { resolveSmokeDatabasePlan } from "./db-smoke-database-plan";
import {
  buildConversionService,
  cleanupConversionSmokeOrganizations,
  extractErrorCode,
  requireMySqlOptions,
  seedConversionSmokeFixture,
} from "./estimate-invoice-conversion-smoke.harness";
import { verifyDatabaseSchema } from "./verify-schema";

type SmokeSummary = {
  ok: boolean;
  database: string;
  phases: Record<string, "PASS" | "FAIL">;
  results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: unknown }>;
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

async function main() {
  const options = requireMySqlOptions();
  const plan = resolveSmokeDatabasePlan(options, "wizfield_estimate_conversion_drift_verify");
  const summary = createSummary(plan.databaseName);

  let adminConnection: mysql.Connection | null = null;
  let dataSource: DataSource | null = null;

  try {
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

    const conversionService = buildConversionService(dataSource);
    const fixture = await seedConversionSmokeFixture(dataSource);
    const estimateUnitPriceCents = 12_345;
    const mutatedCatalogPriceCents = 77_777;

    await dataSource.getRepository(PricebookItemEntity).update(fixture.pricebookItemId, {
      customer_price_cents: mutatedCatalogPriceCents,
    });

    const invoice = await conversionService.convertFromEstimate({
      organizationId: fixture.organizationId,
      jobId: fixture.jobId,
      estimateId: fixture.quoteId,
      actor: fixture.actor,
    });

    const lines = await dataSource.getRepository(InvoiceLineItemEntity).find({
      where: { invoice_id: invoice.id },
      order: { sort_order: "ASC" },
    });

    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.unit_price_cents_snapshot, estimateUnitPriceCents);
    assert.notEqual(lines[0]?.unit_price_cents_snapshot, mutatedCatalogPriceCents);
    assert.equal(lines[0]?.catalog_unit_price_cents_snapshot, 9_999);

    summary.results.push({
      name: "pricebook drift does not change converted invoice unit price snapshot",
      status: "PASS",
      detail: {
        invoiceId: invoice.id,
        unitPriceCents: lines[0]?.unit_price_cents_snapshot,
        liveCatalogPriceCents: mutatedCatalogPriceCents,
      },
    });
    summary.phases.tests = "PASS";
  } catch (error) {
    summary.errors.push(extractErrorCode(error));
    summary.results.push({
      name: "pricebook drift does not change converted invoice unit price snapshot",
      status: "FAIL",
      detail: extractErrorCode(error),
    });
    summary.phases.tests = "FAIL";
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

  summary.ok = summary.errors.length === 0 && summary.phases.tests === "PASS";
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
