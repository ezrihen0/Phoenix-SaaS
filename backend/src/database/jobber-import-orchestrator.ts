import "dotenv/config";
import "reflect-metadata";

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { buildDataSourceOptions } from "./typeorm.config";
import { DEFAULT_JOBBER_EXPORT_DIR } from "./jobber/jobber-csv-parser";
import { runJobberCustomerImport } from "./jobber/jobber-customer-import";
import { runJobberInvoiceImport } from "./jobber/jobber-invoice-import";
import { runJobberVisitImport } from "./jobber/jobber-visit-import";
import {
  assertJobberProductionMutationAllowed,
  buildJobberMutationGuardContext,
} from "./jobber/jobber-production-mutation-guard";
import { resolvePhoenixOperatingOrganization } from "./jobber/phoenix-org-resolver";

const REPORT_DIR = join(process.cwd(), "reports", "jobber-import");

type Phase = "customers" | "visits" | "invoices";

function parseArgs(argv: string[]) {
  const execute = argv.includes("--execute");
  const allowProductionMutation = argv.includes("--allow-production-mutation");
  const onlyArg = argv.find((arg) => arg.startsWith("--only="));
  const exportDirArg = argv.find((arg) => arg.startsWith("--export-dir="));
  const only = onlyArg?.slice("--only=".length).split(",") as Phase[] | undefined;
  const exportDir = exportDirArg?.slice("--export-dir=".length) ?? DEFAULT_JOBBER_EXPORT_DIR;

  return {
    execute,
    allowProductionMutation,
    exportDir,
    phases: only?.length ? only : (["customers", "visits", "invoices"] as Phase[]),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const org = await resolvePhoenixOperatingOrganization(dataSource);

    if (args.execute) {
      assertJobberProductionMutationAllowed(buildJobberMutationGuardContext({
        dataSourceOptions: dataSource.options as MysqlConnectionOptions,
        organizationId: org.id,
        organizationSlug: org.slug,
        allowProductionMutation: args.allowProductionMutation,
        commandLabel: "jobber-import-orchestrator",
      }));
    }

    mkdirSync(REPORT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const summary: Record<string, unknown> = {
      mode: args.execute ? "execute" : "preview",
      exportDir: args.exportDir,
      organizationId: org.id,
      organizationSlug: org.slug,
      phases: {},
    };

    if (args.phases.includes("customers")) {
      const report = await runJobberCustomerImport({
        dataSource,
        organizationId: org.id,
        exportDir: args.exportDir,
        execute: args.execute,
      });
      writeFileSync(
        join(REPORT_DIR, `${stamp}-customers-${args.execute ? "execute" : "preview"}.json`),
        JSON.stringify(report, null, 2),
      );
      (summary.phases as Record<string, unknown>).customers = report;
      if (report.stopReason && args.execute) {
        throw new Error(report.stopReason);
      }
    }

    if (args.phases.includes("visits")) {
      const report = await runJobberVisitImport({
        dataSource,
        organizationId: org.id,
        exportDir: args.exportDir,
        execute: args.execute,
      });
      writeFileSync(
        join(REPORT_DIR, `${stamp}-visits-${args.execute ? "execute" : "preview"}.json`),
        JSON.stringify(report, null, 2),
      );
      (summary.phases as Record<string, unknown>).visits = report;
      if (report.stopReason && args.execute) {
        throw new Error(report.stopReason);
      }
    }

    if (args.phases.includes("invoices")) {
      const report = await runJobberInvoiceImport({
        dataSource,
        organizationId: org.id,
        exportDir: args.exportDir,
        execute: args.execute,
        maxUnmatchedRate: 0,
      });
      writeFileSync(
        join(REPORT_DIR, `${stamp}-invoices-${args.execute ? "execute" : "preview"}.json`),
        JSON.stringify(report, null, 2),
      );
      (summary.phases as Record<string, unknown>).invoices = report;
      if (report.stopReason) {
        if (args.execute) {
          throw new Error(report.stopReason);
        }
      }
    }

    writeFileSync(join(REPORT_DIR, `${stamp}-summary.json`), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
