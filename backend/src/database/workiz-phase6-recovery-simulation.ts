import "dotenv/config";
import "reflect-metadata";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { resolvePhoenixOperatingOrganization } from "./jobber/phoenix-org-resolver";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";
import { CustomerEntity } from "./entities/customer.entity";
import { parseAllWorkizHistoricalPdfs } from "./workiz/workiz-historical-parser.v1";
import { resolveWorkizHistoricalIdentity } from "./workiz/workiz-historical-identity.v1";
import {
  assertWorkizProductionMutationAllowed,
  buildWorkizMutationGuardContext,
  isEphemeralWorkizMutationDatabase,
  PHOENIX_ORG_ID,
  PHOENIX_ORG_SLUG,
} from "./workiz/workiz-production-mutation-guard";
import {
  buildResumeCohortTotals,
  filterResumeSafeEligible,
} from "./workiz/workiz-phase6-resume-cohort";
import { isPhase6OwnerExcludedCluster } from "./workiz/workiz-phase6-resume-owner-decisions";
import { runProductionImportPass } from "./workiz/workiz-phase6-production-import-pass";
import { toHistoricalInvoiceInput } from "./workiz-historical-production-orchestrator";
import { WORKIZ_PROVENANCE_TAGS } from "./workiz/workiz-historical-types.v1";
import {
  WorkizImportAlreadyRunningError,
  withWorkizPhase6ImportLock,
} from "./workiz/workiz-phase6-import-lock";

const DEFAULT_BATCH_ID = "WORKIZ-CALGARY-2026-10-PROD-001-RECOVERY-SIM";

function parseArgs(argv: string[]) {
  return { execute: argv.includes("--execute-recovery-simulation") };
}

function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "(000) 000-0000";
  const d = digits.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return digits;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

type Phase6bClusterRow = {
  cluster_id: string;
  source_customer_name: string;
  normalized_email: string | null;
  normalized_phone: string | null;
  source_address: string;
  production_customer_id: string | null;
  workiz_external_key: string | null;
  workiz_tag_present: string | null;
  historical_import_tag_present: string | null;
  calgary_tag_present: string | null;
};

async function seedPhoenixOperatingOrganization(dataSource: DataSource): Promise<void> {
  const existing = await dataSource.query(
    "SELECT id FROM organizations WHERE id = ? LIMIT 1",
    [PHOENIX_ORG_ID],
  ) as Array<{ id: string }>;
  if (existing.length > 0) return;
  await dataSource.query(
    "INSERT INTO organizations (id, name, slug, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(6), NOW(6))",
    [PHOENIX_ORG_ID, "Phoenix Fireplace Recovery Sim", PHOENIX_ORG_SLUG],
  );
}

async function seedRecoveryCustomersFromPhase6b(input: {
  dataSource: DataSource;
  organizationId: string;
  reconciliationPath: string;
}): Promise<{ seeded: number; skipped: number }> {
  const payload = JSON.parse(readFileSync(input.reconciliationPath, "utf8")) as {
    clusters: Phase6bClusterRow[];
  };
  const repo = input.dataSource.getRepository(CustomerEntity);
  let seeded = 0;
  let skipped = 0;

  for (const row of payload.clusters) {
    if (isPhase6OwnerExcludedCluster(row.cluster_id)) {
      skipped += 1;
      continue;
    }
    if (!row.production_customer_id) {
      skipped += 1;
      continue;
    }

    const tags = new Set<string>();
    if (row.workiz_tag_present === "yes") tags.add("WORKIZ");
    if (row.historical_import_tag_present === "yes") tags.add("HISTORICAL_IMPORT");
    if (row.calgary_tag_present === "yes") tags.add("CALGARY");

    const existing = await repo.findOne({ where: { id: row.production_customer_id } });
    if (existing) continue;

    await repo.save(repo.create({
      id: row.production_customer_id,
      organization_id: input.organizationId,
      external_client_number: row.workiz_external_key ?? undefined,
      full_name: row.source_customer_name,
      email: row.normalized_email ?? undefined,
      phone: formatPhone(row.normalized_phone),
      service_address_line_1: row.source_address.split(",")[0]?.trim() || row.source_address,
      service_city: row.source_address.includes("Calgary") ? "Calgary" : undefined,
      service_state_or_region: "Alberta",
      tags: tags.size > 0 ? [...tags] : [...WORKIZ_PROVENANCE_TAGS],
      notes: `Phase 6 recovery simulation seed ${row.cluster_id}`,
    }));
    seeded += 1;
  }

  return { seeded, skipped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const harnessRoot = resolve(process.cwd(), "_runtime_harness", "workiz-migration");
  mkdirSync(harnessRoot, { recursive: true });

  const reconciliationPath = join(harnessRoot, "phase6b-customer-reconciliation.json");
  if (!existsSync(reconciliationPath)) {
    throw new Error(
      `Missing ${reconciliationPath}. Run workiz:phase6b:reconcile:prod-db first to capture production customer state.`,
    );
  }

  const importBatchId = `workiz-phase6-recovery-sim-${Date.now()}`;
  const candidates = await parseAllWorkizHistoricalPdfs({ importBatchId });
  const { clusters } = resolveWorkizHistoricalIdentity(candidates);
  const resumeEligible = filterResumeSafeEligible(candidates);
  const resumeCohort = buildResumeCohortTotals(candidates);

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    mode: args.execute ? "execute" : "plan-only",
    resumeCohort,
    expectations: {
      firstPassCustomersCreated: 0,
      firstPassInvoicesCreated: resumeCohort.invoices,
      secondPassAllZero: true,
    },
    lockProbe: null as Record<string, unknown> | null,
    seed: null as Record<string, unknown> | null,
    firstPass: null as Record<string, unknown> | null,
    secondPass: null as Record<string, unknown> | null,
    pass: false,
    blockers: [] as string[],
  };

  if (!args.execute) {
    writeFileSync(
      join(harnessRoot, "phase6-recovery-simulation-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    console.log(JSON.stringify({ planOnly: true, resumeCohort, note: "Re-run with --execute-recovery-simulation" }, null, 2));
    return;
  }

  const baseOptions = buildDataSourceOptions() as MysqlConnectionOptions;
  const smokeDbName = process.env.WORKIZ_PHASE6_RECOVERY_SIM_DB
    ?? `wizfield_workiz_phase6_recovery_${Date.now()}`;

  if (!isEphemeralWorkizMutationDatabase(smokeDbName)) {
    throw new Error(`Refusing recovery simulation: database '${smokeDbName}' is not ephemeral.`);
  }

  const admin = await mysql.createConnection({
    host: baseOptions.host,
    port: baseOptions.port,
    user: process.env.WORKIZ_PREPRODUCTION_MYSQL_ADMIN_USER ?? "root",
    password: process.env.WORKIZ_PREPRODUCTION_MYSQL_ADMIN_PASSWORD ?? "",
  });

  let dataSource: DataSource | null = null;
  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${smokeDbName}\``);
    const dbUser = baseOptions.username ?? "wizfield";
    await admin.query(`GRANT ALL PRIVILEGES ON \`${smokeDbName}\`.* TO '${dbUser}'@'localhost'`);
    await admin.query(`GRANT ALL PRIVILEGES ON \`${smokeDbName}\`.* TO '${dbUser}'@'127.0.0.1'`);
    await admin.query("FLUSH PRIVILEGES");

    dataSource = new DataSource({
      ...baseOptions,
      database: smokeDbName,
      migrations: [
        ...((baseOptions.migrations as string[] | undefined) ?? []),
        join(__dirname, "migrations", "deferred", "1790000000000-multi-branch-phase1-foundation.ts"),
      ],
      migrationsRun: true,
    });
    await dataSource.initialize();
    await verifyDatabaseSchema(dataSource);
    await seedPhoenixOperatingOrganization(dataSource);

    const org = await resolvePhoenixOperatingOrganization(dataSource);
    assertWorkizProductionMutationAllowed(buildWorkizMutationGuardContext({
      dataSourceOptions: { ...baseOptions, database: smokeDbName },
      organizationId: org.id,
      organizationSlug: org.slug,
      allowProductionMutation: true,
      commandLabel: "workiz-phase6-recovery-simulation",
    }));

    report.seed = await seedRecoveryCustomersFromPhase6b({
      dataSource,
      organizationId: org.id,
      reconciliationPath,
    });

    let lockContentionObserved = false;
    const lockHolder = dataSource.createQueryRunner();
    await lockHolder.connect();
    await lockHolder.query("SELECT GET_LOCK(?, 0)", ["phoenix_workiz_phase6_production_import"]);
    try {
      await withWorkizPhase6ImportLock(dataSource, async () => {
        lockContentionObserved = false;
      });
    } catch (error) {
      lockContentionObserved = error instanceof WorkizImportAlreadyRunningError;
    }
    await lockHolder.query("SELECT RELEASE_LOCK(?)", ["phoenix_workiz_phase6_production_import"]);
    await lockHolder.release();
    report.lockProbe = { concurrentImportBlocked: lockContentionObserved };

    const importedAt = new Date().toISOString();
    const batchId = process.env.WORKIZ_PRODUCTION_BATCH_ID?.trim() || DEFAULT_BATCH_ID;

    const ds = dataSource;
    await withWorkizPhase6ImportLock(ds, async () => {
      report.firstPass = await runProductionImportPass({
        dataSource: ds,
        organizationId: org.id,
        eligible: resumeEligible,
        clusters,
        batchId,
        importedAt,
        buildHistoricalInvoiceInput: toHistoricalInvoiceInput,
      });
      report.secondPass = await runProductionImportPass({
        dataSource: ds,
        organizationId: org.id,
        eligible: resumeEligible,
        clusters,
        batchId,
        importedAt,
        buildHistoricalInvoiceInput: toHistoricalInvoiceInput,
      });
    });

    const first = report.firstPass as {
      customersCreated?: number;
      invoicesCreated?: number;
      failedRecords?: number;
    } | null;
    const second = report.secondPass as {
      customersCreated?: number;
      jobsCreated?: number;
      invoicesCreated?: number;
      paymentsCreated?: number;
      sourceDocumentsLinked?: number;
    } | null;

    const blockers: string[] = [];
    if ((first?.customersCreated ?? -1) !== 0) {
      blockers.push(`expected firstPass.customersCreated=0 got ${first?.customersCreated}`);
    }
    if ((first?.invoicesCreated ?? 0) !== resumeCohort.invoices) {
      blockers.push(
        `expected firstPass.invoicesCreated=${resumeCohort.invoices} got ${first?.invoicesCreated}`,
      );
    }
    if ((first?.failedRecords ?? 0) > 0) {
      blockers.push(`firstPass failedRecords=${first?.failedRecords}`);
    }
    if (
      (second?.customersCreated ?? -1) !== 0
      || (second?.jobsCreated ?? -1) !== 0
      || (second?.invoicesCreated ?? -1) !== 0
      || (second?.paymentsCreated ?? -1) !== 0
      || (second?.sourceDocumentsLinked ?? -1) !== 0
    ) {
      blockers.push("second pass idempotency did not produce all zeros");
    }
    if (!lockContentionObserved) {
      blockers.push("lock probe did not observe WORKIZ_IMPORT_ALREADY_RUNNING under concurrent holder");
    }

    report.blockers = blockers;
    report.pass = blockers.length === 0;
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    await admin.end();
  }

  writeFileSync(
    join(harnessRoot, "phase6-recovery-simulation-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({
    pass: report.pass,
    resumeCohort,
    firstPass: report.firstPass,
    secondPass: report.secondPass,
    blockers: report.blockers,
  }, null, 2));

  if (!report.pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
