import "dotenv/config";
import "reflect-metadata";

import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { buildDataSourceOptions } from "./typeorm.config";
import { runWorkizImportVerify } from "./workiz-import-verify";
import { runWorkizInvoiceCsvImport } from "./workiz-invoice-csv-import";
import { runWorkizInvoiceCsvImportVerify } from "./workiz-invoice-csv-import-verify";
import {
  assertWorkizProductionMutationAllowed,
  buildWorkizMutationGuardContext,
  PHOENIX_ORG_ID,
  PHOENIX_ORG_SLUG,
} from "./workiz/workiz-production-mutation-guard";

type SmokeResult = { name: string; status: "PASS" | "FAIL"; detail?: unknown };

async function collectCounts(connection: mysql.Connection) {
  const [[{ invoiceCount }]] = await connection.query("SELECT COUNT(*) AS invoiceCount FROM invoices") as [[{ invoiceCount: number }], unknown];
  const [[{ paymentCount }]] = await connection.query("SELECT COUNT(*) AS paymentCount FROM invoice_payments") as [[{ paymentCount: number }], unknown];
  return {
    invoiceCount: Number(invoiceCount),
    paymentCount: Number(paymentCount),
  };
}

async function main() {
  const options = buildDataSourceOptions() as MysqlConnectionOptions;
  const connection = await mysql.createConnection({
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3306,
    user: options.username ?? "root",
    password: options.password ?? "",
    database: options.database,
  });

  const results: SmokeResult[] = [];
  let ok = true;

  async function expectPass(name: string, run: () => Promise<unknown>) {
    try {
      results.push({ name, status: "PASS", detail: await run() });
    } catch (error) {
      ok = false;
      results.push({
        name,
        status: "FAIL",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    const before = await collectCounts(connection);

    await expectPass("invoices_verify_default_zero_writes", async () => {
      await runWorkizInvoiceCsvImportVerify();
      const afterFirst = await collectCounts(connection);
      await runWorkizInvoiceCsvImportVerify();
      const afterSecond = await collectCounts(connection);
      if (afterFirst.invoiceCount !== before.invoiceCount || afterFirst.paymentCount !== before.paymentCount) {
        throw new Error(`first verify changed counts: before=${JSON.stringify(before)} after=${JSON.stringify(afterFirst)}`);
      }
      if (afterSecond.invoiceCount !== before.invoiceCount || afterSecond.paymentCount !== before.paymentCount) {
        throw new Error(`second verify changed counts: before=${JSON.stringify(before)} after=${JSON.stringify(afterSecond)}`);
      }
      return { before, afterFirst, afterSecond };
    });

    await expectPass("import_verify_default_zero_writes", async () => {
      const dataSource = new DataSource({ ...options, synchronize: false, migrationsRun: false });
      await dataSource.initialize();
      try {
        await runWorkizImportVerify(dataSource);
        const after = await collectCounts(connection);
        if (after.invoiceCount !== before.invoiceCount || after.paymentCount !== before.paymentCount) {
          throw new Error(`import verify changed counts: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
        }
        return after;
      } finally {
        await dataSource.destroy();
      }
    });

    await expectPass("csv_import_execute_blocked_on_phoenix_without_opt_in", async () => {
      let threw = false;
      try {
        await runWorkizInvoiceCsvImport({ execute: true });
      } catch (error) {
        threw = true;
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("requires explicit opt-in")) {
          throw new Error(`unexpected error: ${message}`);
        }
      }
      if (!threw) throw new Error("expected execute import to be blocked without opt-in");
      return { blocked: true };
    });

    await expectPass("production_guard_blocks_verify_second_run_mutation", async () => {
      let threw = false;
      try {
        assertWorkizProductionMutationAllowed(buildWorkizMutationGuardContext({
          dataSourceOptions: options,
          organizationId: PHOENIX_ORG_ID,
          organizationSlug: PHOENIX_ORG_SLUG,
          commandLabel: "workiz-invoice-csv-import-verify",
        }));
      } catch {
        threw = true;
      }
      if (!threw) throw new Error("expected production guard to block mutation");
      return { blocked: true };
    });
  } finally {
    await connection.end();
  }

  console.log(JSON.stringify({ ok, results }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
