import "dotenv/config";
import "reflect-metadata";

import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";
import {
  projectWorkizCsvImportExecuteOutcome,
  type WorkizInvoiceImportRecord,
} from "./workiz-invoice-csv-import";
import {
  loadExistingWorkizImportIndex,
  upsertHistoricalWorkizInvoice,
  buildCsvProvenanceSnapshot,
} from "./workiz/workiz-invoice-upsert";
import {
  assertWorkizProductionMutationAllowed,
  buildWorkizMutationGuardContext,
  isEphemeralWorkizMutationDatabase,
  PHOENIX_ORG_ID,
  PHOENIX_ORG_SLUG,
} from "./workiz/workiz-production-mutation-guard";

async function main() {
  const baseOptions = buildDataSourceOptions() as MysqlConnectionOptions;
  const smokeDbName = process.env.DB_SMOKE_DATABASE ?? `wizfield_workiz_csv_idempotent_${Date.now()}`;
  const admin = await mysql.createConnection({
    host: baseOptions.host,
    port: baseOptions.port,
    user: baseOptions.username,
    password: baseOptions.password,
  });

  let dataSource: DataSource | null = null;
  const results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: unknown }> = [];

  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${smokeDbName}\``);
    dataSource = new DataSource({
      ...baseOptions,
      database: smokeDbName,
      migrationsRun: true,
    });
    await dataSource.initialize();
    await verifyDatabaseSchema(dataSource);

    await dataSource.query(
      "INSERT INTO organizations (id, name, slug, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(6), NOW(6))",
      [PHOENIX_ORG_ID, "Phoenix Fireplace Smoke", PHOENIX_ORG_SLUG],
    );

    const customer = await dataSource.getRepository(CustomerEntity).save(
      dataSource.getRepository(CustomerEntity).create({
        organization_id: PHOENIX_ORG_ID,
        full_name: "Smoke Customer",
        email: "smoke@wizfield.test",
        phone: "(403) 555-0100",
        service_address_line_1: "1 Smoke Street",
        service_city: "Calgary",
        service_state_or_region: "AB",
        service_postal_code: "T2P0A1",
      }),
    );

    await upsertHistoricalWorkizInvoice({
      dataSource,
      organizationId: PHOENIX_ORG_ID,
      customerId: customer.id,
      historical: {
        invoiceCode: "SMOKE01",
        jobCode: null,
        invoiceDate: new Date("2024-01-01T00:00:00.000Z"),
        dueDate: new Date("2024-01-01T00:00:00.000Z"),
        subtotalCents: 1000,
        taxCents: 0,
        taxRateBps: 0,
        totalCents: 1000,
        paid: true,
        paidAt: new Date("2024-01-01T00:00:00.000Z"),
        lineItems: [{
          description: "Smoke service",
          quantity: 1,
          unitPriceCents: 1000,
          amountCents: 1000,
        }],
        payments: [{
          amountCents: 1000,
          occurredAt: new Date("2024-01-01T00:00:00.000Z"),
          methodLabel: "derived_from_csv_balance",
        }],
        notes: null,
        provenance: JSON.parse(buildCsvProvenanceSnapshot({
          invoiceCode: "SMOKE01",
          jobCode: null,
          sourceFilename: "smoke.csv",
          importedAt: new Date().toISOString(),
          financialMismatch: false,
          statusRaw: "Paid",
          mismatchReason: null,
        })),
      },
    });

    const existingIndex = await loadExistingWorkizImportIndex(dataSource, PHOENIX_ORG_ID);
    const syntheticRecords = [{
      invoiceCode: "SMOKE01",
      action: "import",
      customerMatch: {
        kind: "matched",
        customerId: customer.id,
        customerName: customer.full_name,
        strategy: "email",
      },
      financialMismatch: false,
      financialMismatchReason: null,
      rejectedReason: null,
      mapped: {},
    }] as unknown as WorkizInvoiceImportRecord[];

    const projected = projectWorkizCsvImportExecuteOutcome({
      records: syntheticRecords,
      existingIndex,
    });
    if (projected.imported !== 0 || projected.skippedDuplicates !== 1) {
      throw new Error(`expected duplicate skip, got ${JSON.stringify(projected)}`);
    }
    results.push({ name: "projected_second_run_idempotent", status: "PASS", detail: projected });

    if (!isEphemeralWorkizMutationDatabase(smokeDbName)) {
      throw new Error("expected smoke database name to be treated as ephemeral");
    }
    assertWorkizProductionMutationAllowed(buildWorkizMutationGuardContext({
      dataSourceOptions: { ...baseOptions, database: smokeDbName },
      organizationId: PHOENIX_ORG_ID,
      organizationSlug: PHOENIX_ORG_SLUG,
      commandLabel: "workiz-invoice-csv-import-idempotency-smoke",
    }));
    results.push({ name: "ephemeral_db_allows_guarded_mutation", status: "PASS" });

    const invoiceCount = await dataSource.getRepository(InvoiceEntity).count({
      where: { organization_id: PHOENIX_ORG_ID },
    });
    if (invoiceCount !== 1) throw new Error(`expected 1 invoice, got ${invoiceCount}`);
    results.push({ name: "invoice_count_stable", status: "PASS", detail: { invoiceCount } });

    console.log(JSON.stringify({ ok: true, database: smokeDbName, results }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      database: smokeDbName,
      results,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    await admin.query(`DROP DATABASE IF EXISTS \`${smokeDbName}\``);
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
