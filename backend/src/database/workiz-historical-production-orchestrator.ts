import "dotenv/config";
import "reflect-metadata";

import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { resolvePhoenixOperatingOrganization } from "./jobber/phoenix-org-resolver";
import { buildDataSourceOptions } from "./typeorm.config";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";
import { InvoiceServiceIntelligenceEntity } from "./entities/invoice-service-intelligence.entity";
import { InvoiceServiceIntelligenceWarrantyEntity } from "./entities/invoice-service-intelligence-warranty.entity";
import { JobEntity } from "./entities/job.entity";
import { parseAllWorkizHistoricalPdfs } from "./workiz/workiz-historical-parser.v1";
import { resolveWorkizHistoricalIdentity } from "./workiz/workiz-historical-identity.v1";
import {
  WORKIZ_CALGARY_TAG,
  WORKIZ_HISTORICAL_PIPELINE_VERSION,
  type WorkizCustomerCluster,
  type WorkizHistoricalParseCandidate,
} from "./workiz/workiz-historical-types.v1";
import {
  assertWorkizProductionMutationAllowed,
  buildWorkizMutationGuardContext,
  PHOENIX_ORG_ID,
  PHOENIX_ORG_SLUG,
} from "./workiz/workiz-production-mutation-guard";
import { matchProductionPhoenixCustomer } from "./workiz/workiz-historical-production-customer-match";
import {
  loadExistingWorkizImportIndex,
  WORKIZ_HISTORICAL_IMPORT_SOURCE,
  type WorkizHistoricalInvoiceInput,
} from "./workiz/workiz-invoice-upsert";
import { isWorkizWarrantyReconstructionValid } from "./workiz/workiz-historical-service-warranty.v1";
import { withWorkizPhase6ImportLock } from "./workiz/workiz-phase6-import-lock";
import {
  buildResumeCohortTotals,
  filterResumeSafeEligible,
} from "./workiz/workiz-phase6-resume-cohort";
import {
  runProductionImportPass,
  type ImportPassMetrics,
} from "./workiz/workiz-phase6-production-import-pass";

const DEFAULT_BATCH_ID = "WORKIZ-CALGARY-2026-10-PROD-001";
const PRODUCTION_APP_URL = "https://app.phoenixfireplace.ca";
const PORTAL_APP_URL = "https://portal.phoenixfireplace.ca";

type ProductionBaseline = {
  customers: number;
  jobs: number;
  invoices: number;
  invoiceLines: number;
  payments: number;
  sourceDocuments: number;
  serviceIntelligenceRecords: number;
  warrantyRecords: number;
  invoiceTotalCents: string;
  paymentsTotalCents: string;
  outstandingBalanceCents: string;
};

function parseArgs(argv: string[]) {
  return {
    gateOnly: argv.includes("--gate-only"),
    executeImport: argv.includes("--execute-production-import"),
    confirmProduction: argv.includes("--confirm-phoenix-production"),
    allowProductionMutation: argv.includes("--allow-production-mutation"),
    skipBackup: argv.includes("--skip-backup"),
    secondPassOnly: argv.includes("--second-pass-only"),
  };
}

function buildProductionProvenance(
  candidate: WorkizHistoricalParseCandidate,
  importedAt: string,
  batchId: string,
): Record<string, unknown> {
  return {
    import_source: WORKIZ_HISTORICAL_IMPORT_SOURCE,
    source_kind: "pdf",
    source_system: "WORKIZ",
    production_batch_id: batchId,
    production_target_app: PRODUCTION_APP_URL,
    workiz_invoice_code: candidate.invoice?.workiz_invoice_number,
    workiz_file_number: candidate.source.workiz_file_number,
    source_filename: candidate.source.filename,
    source_sha256: candidate.source.sha256,
    source_path: candidate.source.source_path,
    parser_version: candidate.source.parser_version,
    import_batch_id: candidate.source.import_batch_id,
    imported_at: importedAt,
    duplicate_export_siblings: candidate.source.duplicate_export_siblings,
    financial_gate: candidate.financial_gate,
    identity_cluster_id: candidate.identity.cluster_id,
    service_intelligence: candidate.service_intelligence,
    warranty_reconstruction: candidate.warranty_reconstruction,
    warranty_evidence: candidate.warranty_evidence,
    review_flags: candidate.review_flags,
    enrichment_status: "production_controlled_import_v1",
  };
}

export function toHistoricalInvoiceInput(
  candidate: WorkizHistoricalParseCandidate,
  importedAt: string,
  batchId: string,
): WorkizHistoricalInvoiceInput {
  const invoice = candidate.invoice!;
  const invoiceDate = invoice.invoice_date ? new Date(`${invoice.invoice_date}T12:00:00.000Z`) : new Date();
  const dueDate = invoice.due_date ? new Date(`${invoice.due_date}T12:00:00.000Z`) : invoiceDate;
  const paid = (invoice.balance_due_cents ?? 0) === 0 && candidate.payments.length > 0;
  const paidAt = paid
    ? candidate.payments.map((payment) => payment.occurred_at).filter(Boolean).sort().at(-1)
    : null;

  return {
    invoiceCode: invoice.workiz_invoice_number,
    jobCode: candidate.source.workiz_file_number,
    invoiceDate,
    dueDate,
    subtotalCents: invoice.subtotal_cents ?? 0,
    taxCents: invoice.tax_cents ?? 0,
    taxRateBps: invoice.tax_rate_bps ?? 0,
    totalCents: invoice.total_cents ?? 0,
    paid,
    paidAt: paidAt ? new Date(`${paidAt}T12:00:00.000Z`) : null,
    lineItems: candidate.invoice_lines.map((line) => ({
      description: line.raw_description,
      quantity: line.quantity,
      unitPriceCents: line.unit_price_cents,
      amountCents: line.amount_cents,
    })),
    payments: candidate.payments.map((payment) => ({
      amountCents: payment.amount_cents,
      occurredAt: payment.occurred_at ? new Date(`${payment.occurred_at}T12:00:00.000Z`) : null,
      methodLabel: payment.method_label,
    })),
    notes: candidate.job.historical_notes,
    provenance: buildProductionProvenance(candidate, importedAt, batchId),
  };
}

async function captureBaseline(dataSource: DataSource, organizationId: string): Promise<ProductionBaseline> {
  const invoiceAgg = await dataSource.getRepository(InvoiceEntity)
    .createQueryBuilder("invoice")
    .select("COUNT(*)", "invoices")
    .addSelect("COALESCE(SUM(invoice.total_cents), 0)", "invoiceTotalCents")
    .addSelect(
      "COALESCE(SUM(CASE WHEN invoice.status <> 'paid' THEN invoice.total_cents ELSE 0 END), 0)",
      "outstandingBalanceCents",
    )
    .where("invoice.organization_id = :organizationId", { organizationId })
    .getRawOne<{ invoices: string; invoiceTotalCents: string; outstandingBalanceCents: string }>();

  const paymentsAgg = await dataSource.getRepository(InvoicePaymentEntity)
    .createQueryBuilder("payment")
    .innerJoin(InvoiceEntity, "invoice", "invoice.id = payment.invoice_id")
    .select("COALESCE(SUM(payment.amount_cents), 0)", "paymentsTotalCents")
    .where("invoice.organization_id = :organizationId", { organizationId })
    .getRawOne<{ paymentsTotalCents: string }>();

  return {
    customers: await dataSource.getRepository(CustomerEntity).count({ where: { organization_id: organizationId } }),
    jobs: await dataSource.getRepository(JobEntity).count({ where: { organization_id: organizationId } }),
    invoices: Number(invoiceAgg?.invoices ?? 0),
    invoiceLines: await dataSource.getRepository(InvoiceLineItemEntity)
      .createQueryBuilder("line")
      .innerJoin(InvoiceEntity, "invoice", "invoice.id = line.invoice_id")
      .where("invoice.organization_id = :organizationId", { organizationId })
      .getCount(),
    payments: await dataSource.getRepository(InvoicePaymentEntity)
      .createQueryBuilder("payment")
      .innerJoin(InvoiceEntity, "invoice", "invoice.id = payment.invoice_id")
      .where("invoice.organization_id = :organizationId", { organizationId })
      .getCount(),
    sourceDocuments: await dataSource.getRepository(InvoiceDocumentEntity).count({ where: { organization_id: organizationId } }),
    serviceIntelligenceRecords: await dataSource.getRepository(InvoiceServiceIntelligenceEntity)
      .count({ where: { organization_id: organizationId } }),
    warrantyRecords: await dataSource.getRepository(InvoiceServiceIntelligenceWarrantyEntity)
      .count({ where: { organization_id: organizationId } }),
    invoiceTotalCents: String(invoiceAgg?.invoiceTotalCents ?? "0"),
    paymentsTotalCents: String(paymentsAgg?.paymentsTotalCents ?? "0"),
    outstandingBalanceCents: String(invoiceAgg?.outstandingBalanceCents ?? "0"),
  };
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function createLogicalDatabaseBackup(options: MysqlConnectionOptions, harnessRoot: string): {
  filename: string;
  timestamp: string;
  databaseName: string;
  fileHash: string;
  storageLocation: string;
} {
  const databaseName = options.database as string;
  const timestamp = new Date().toISOString();
  const safeStamp = timestamp.replace(/[:.]/g, "-");
  const backupDir = join(harnessRoot, "production-backups");
  mkdirSync(backupDir, { recursive: true });
  const filename = `${databaseName}-pre-workiz-phase6-${safeStamp}.sql`;
  const storageLocation = join(backupDir, filename);

  const args = [
    "-h", String(options.host ?? "127.0.0.1"),
    "-P", String(options.port ?? 3306),
    "-u", String(options.username),
    `--result-file=${storageLocation}`,
    "--single-transaction",
    "--routines",
    "--triggers",
    databaseName,
  ];
  const env = { ...process.env };
  if (options.password) env.MYSQL_PWD = String(options.password);

  const mysqldumpBin = process.env.WORKIZ_MYSQLDUMP_PATH?.trim()
    || (process.platform === "win32"
      ? "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe"
      : "mysqldump");
  execFileSync(mysqldumpBin, args, { env, stdio: "pipe" });
  if (!existsSync(storageLocation)) {
    throw new Error(`Backup file was not created at ${storageLocation}`);
  }

  return {
    filename,
    timestamp,
    databaseName,
    fileHash: sha256File(storageLocation),
    storageLocation,
  };
}

function buildManualAuditSample(candidates: WorkizHistoricalParseCandidate[]): Array<Record<string, unknown>> {
  const eligible = filterResumeSafeEligible(candidates);
  const pick = (predicate: (c: WorkizHistoricalParseCandidate) => boolean, label: string) => {
    const match = eligible.find(predicate);
    return match
      ? {
        case: label,
        invoiceNumber: match.invoice?.workiz_invoice_number,
        filename: match.source.filename,
        customer: match.customer?.name,
      }
      : null;
  };

  return [
    pick((c) => c.payments.length === 1 && (c.invoice?.balance_due_cents ?? 0) === 0, "simple_paid_invoice"),
    pick((c) => c.identity.classification === "CONFIRMED_REPEAT_CUSTOMER", "repeat_customer"),
    pick((c) => c.payments.length >= 2, "multiple_payments"),
    pick((c) => (c.invoice?.discount_cents ?? 0) > 0, "discount_invoice"),
    pick((c) => c.warranty_reconstruction?.parts.provenance === "DOCUMENTED", "documented_parts_warranty"),
    pick((c) => c.warranty_reconstruction?.labor.provenance === "DOCUMENTED", "documented_labor_warranty"),
    pick((c) => c.warranty_reconstruction?.parts.provenance === "PHOENIX_DEFAULT_POLICY", "default_parts_warranty"),
    pick((c) => c.warranty_reconstruction?.labor.provenance === "PHOENIX_DEFAULT_POLICY", "default_labor_warranty"),
    pick((c) => /repair/i.test(c.invoice_lines.map((l) => l.raw_description).join(" ")), "repair"),
    pick((c) => /clean/i.test(c.invoice_lines.map((l) => l.raw_description).join(" ")), "cleaning"),
    pick((c) => /inspect/i.test(c.invoice_lines.map((l) => l.raw_description).join(" ")), "inspection"),
    pick((c) => /replace|pilot|valve/i.test(c.invoice_lines.map((l) => l.raw_description).join(" ")), "part_replacement"),
    pick((c) => (c.invoice?.total_cents ?? 0) >= 150_000, "high_value_invoice"),
    pick((c) => (c.invoice?.balance_due_cents ?? 0) > 0, "historical_outstanding_balance"),
    pick((c) => !c.customer?.normalized_email, "customer_without_email"),
    pick((c) => c.source.duplicate_export_siblings.length > 0, "duplicate_export_group"),
    pick((c) => c.customer?.normalized_city === "calgary", "calgary_customer"),
    pick((c) => c.warranty_evidence.some((e) => e.source_location === "INVOICE_LINE"), "line_sourced_warranty"),
    pick((c) => c.review_flags.some((f) => f.startsWith("PARSE_WARNING")), "unusual_source_wording"),
    pick((c) => (c.invoice?.total_cents ?? 0) > 50_000 && c.payments.length > 0, "audit_extra_high_signal"),
  ].filter(Boolean) as Array<Record<string, unknown>>;
}

function countActiveMigrationsInRepo(): number {
  const activeDir = resolve(process.cwd(), "src", "database", "migrations", "active");
  return readdirSync(activeDir).filter((name) => name.endsWith(".ts")).length;
}

async function analyzeExistingWorkizImports(input: {
  dataSource: DataSource;
  organizationId: string;
  eligibleInvoiceCodes: string[];
}): Promise<Record<string, unknown>> {
  const index = await loadExistingWorkizImportIndex(input.dataSource, input.organizationId);
  const existingCodes = new Set(index.keys());
  const overlap = input.eligibleInvoiceCodes.filter((code) => existingCodes.has(code));
  return {
    existingHistoricalImportInvoices: index.size,
    overlapWithEligibleCohort: overlap.length,
    overlapInvoiceCodes: overlap.slice(0, 50),
    netNewInvoicesExpected: input.eligibleInvoiceCodes.length - overlap.length,
  };
}

async function analyzeGateCustomerMatches(input: {
  dataSource: DataSource;
  organizationId: string;
  clusters: WorkizCustomerCluster[];
  eligible: WorkizHistoricalParseCandidate[];
}): Promise<Record<string, unknown>> {
  const clusterIds = new Set(
    input.eligible
      .map((candidate) => candidate.identity.cluster_id)
      .filter(Boolean) as string[],
  );
  const uniqueClusters = input.clusters.filter((cluster) => clusterIds.has(cluster.cluster_id));

  let emailMatches = 0;
  let phoneMatches = 0;
  let nameAddressMatches = 0;
  let workizExternalKeyMatches = 0;
  let ownerPinnedMatches = 0;
  let ambiguousMatches = 0;
  let estimatedNew = 0;
  const ambiguousDetails: string[] = [];

  for (const cluster of uniqueClusters) {
    const snapshot = cluster.customer_snapshot;
    if (!snapshot) continue;
    const outcome = await matchProductionPhoenixCustomer({
      dataSource: input.dataSource,
      organizationId: input.organizationId,
      snapshot,
      clusterId: cluster.cluster_id,
    });
    if (outcome.kind === "ambiguous") {
      ambiguousMatches += 1;
      ambiguousDetails.push(`${cluster.cluster_id}:${outcome.reason}`);
      continue;
    }
    if (outcome.kind === "create") {
      estimatedNew += 1;
      continue;
    }
    if (outcome.strategy === "owner_pinned") ownerPinnedMatches += 1;
    else if (outcome.strategy === "email") emailMatches += 1;
    else if (outcome.strategy === "phone") phoneMatches += 1;
    else if (outcome.strategy === "name_address") nameAddressMatches += 1;
    else if (outcome.strategy === "external_client_number") workizExternalKeyMatches += 1;
  }

  const estimatedMatchedExisting =
    uniqueClusters.length - estimatedNew - ambiguousMatches;

  return {
    uniqueCustomerClustersInEligibleCohort: uniqueClusters.length,
    exactEmailMatches: emailMatches,
    exactPhoneMatches: phoneMatches,
    strongNameAddressMatches: nameAddressMatches,
    workizExternalKeyMatches,
    ownerPinnedMatches,
    ambiguousMatches,
    estimatedNewCustomers: estimatedNew,
    estimatedMatchedExistingCustomers: estimatedMatchedExisting,
    recoveryResumeExpectsZeroNewCustomers: estimatedNew === 0 && ambiguousMatches === 0,
    ambiguousClusterDetails: ambiguousDetails.slice(0, 25),
  };
}

async function readMigrationLedgerSummary(dataSource: DataSource): Promise<Record<string, unknown>> {
  const rows = await dataSource.query(
    "SELECT id, timestamp FROM typeorm_migrations ORDER BY id DESC LIMIT 5",
  ) as Array<{ id: number; timestamp: number }>;
  const executed = await dataSource.query(
    "SELECT COUNT(*) AS c FROM typeorm_migrations",
  ) as Array<{ c: string }>;
  const expectedActive = countActiveMigrationsInRepo();
  const executedCount = Number(executed[0]?.c ?? 0);
  return {
    executedCount,
    expectedActiveMigrationsInRepo: expectedActive,
    migrationLedgerValid: executedCount >= expectedActive,
    latestMigrations: rows.map((row) => ({ id: row.id, timestamp: row.timestamp })),
  };
}

async function verifyProductionImport(input: {
  dataSource: DataSource;
  organizationId: string;
  cohortInvoiceCodes: string[];
  expectedInvoiceValueCents: number;
  expectedPaymentsCents: number;
}): Promise<Record<string, unknown>> {
  const invoices = await input.dataSource.getRepository(InvoiceEntity).find({
    where: { organization_id: input.organizationId },
  });

  const workizInvoices = invoices.filter((invoice) =>
    invoice.branding_snapshot_json?.includes(WORKIZ_HISTORICAL_IMPORT_SOURCE),
  );

  const crossOrg = await input.dataSource.getRepository(InvoiceEntity)
    .createQueryBuilder("invoice")
    .where("invoice.organization_id <> :organizationId", { organizationId: input.organizationId })
    .andWhere("invoice.branding_snapshot_json LIKE :source", { source: `%${WORKIZ_HISTORICAL_IMPORT_SOURCE}%` })
    .getCount();

  const codeCounts = new Map<string, number>();
  let cohortInvoiceValue = 0;
  let cohortPayments = 0;
  for (const invoice of workizInvoices) {
    try {
      const snapshot = JSON.parse(invoice.branding_snapshot_json ?? "{}") as { workiz_invoice_code?: string };
      if (snapshot.workiz_invoice_code) {
        codeCounts.set(snapshot.workiz_invoice_code, (codeCounts.get(snapshot.workiz_invoice_code) ?? 0) + 1);
      }
      if (input.cohortInvoiceCodes.includes(snapshot.workiz_invoice_code ?? "")) {
        cohortInvoiceValue += invoice.total_cents;
      }
    } catch {
      // ignore
    }
  }

  const payments = await input.dataSource.getRepository(InvoicePaymentEntity)
    .createQueryBuilder("payment")
    .innerJoin(InvoiceEntity, "invoice", "invoice.id = payment.invoice_id")
    .where("invoice.organization_id = :organizationId", { organizationId: input.organizationId })
    .andWhere("invoice.branding_snapshot_json LIKE :source", { source: `%${WORKIZ_HISTORICAL_IMPORT_SOURCE}%` })
    .getMany();
  const cohortCodeSet = new Set(input.cohortInvoiceCodes);
  let financialReconciliationFailures = 0;
  let warrantyCalculationFailures = 0;
  let orphanSourceDocuments = 0;

  for (const invoice of workizInvoices) {
    try {
      const snapshot = JSON.parse(invoice.branding_snapshot_json ?? "{}") as {
        workiz_invoice_code?: string;
        financial_gate?: string;
        warranty_reconstruction?: unknown;
        subtotal?: unknown;
      };
      if (!snapshot.workiz_invoice_code || !cohortCodeSet.has(snapshot.workiz_invoice_code)) continue;
      if (snapshot.financial_gate && snapshot.financial_gate !== "PASS") {
        financialReconciliationFailures += 1;
      }
      if (!isWorkizWarrantyReconstructionValid(snapshot.warranty_reconstruction as never)) {
        warrantyCalculationFailures += 1;
      }
    } catch {
      financialReconciliationFailures += 1;
    }
  }

  cohortPayments = 0;
  for (const payment of payments) {
    const invoice = workizInvoices.find((row) => row.id === payment.invoice_id);
    if (!invoice?.branding_snapshot_json) continue;
    try {
      const snapshot = JSON.parse(invoice.branding_snapshot_json) as { workiz_invoice_code?: string };
      if (snapshot.workiz_invoice_code && cohortCodeSet.has(snapshot.workiz_invoice_code)) {
        cohortPayments += payment.amount_cents;
      }
    } catch {
      // ignore
    }
  }

  const sourceDocOrphans = await input.dataSource.query(
    `SELECT COUNT(*) AS c FROM invoice_documents d
     LEFT JOIN invoices i ON i.id = d.invoice_id
     WHERE d.organization_id = ? AND i.id IS NULL`,
    [input.organizationId],
  ) as Array<{ c: string }>;
  orphanSourceDocuments = Number(sourceDocOrphans[0]?.c ?? 0);

  const duplicateInvoices = [...codeCounts.values()].filter((count) => count > 1).length;
  const paymentRefs = new Map<string, number>();
  for (const payment of payments) {
    const key = payment.reference ?? payment.id;
    paymentRefs.set(key, (paymentRefs.get(key) ?? 0) + 1);
  }
  const duplicatePayments = [...paymentRefs.values()].filter((count) => count > 1).length;

  const orphanPayments = await input.dataSource.query(
    `SELECT COUNT(*) AS c FROM invoice_payments p
     LEFT JOIN invoices i ON i.id = p.invoice_id
     WHERE i.id IS NULL`,
  ) as Array<{ c: string }>;

  const orphanJobs = await input.dataSource.query(
    `SELECT COUNT(*) AS c FROM jobs j
     LEFT JOIN invoices i ON i.job_id = j.id
     WHERE j.organization_id = ? AND i.id IS NULL`,
    [input.organizationId],
  ) as Array<{ c: string }>;

  return {
    crossOrgMismatches: crossOrg,
    duplicateInvoices,
    duplicatePayments,
    orphanPayments: Number(orphanPayments[0]?.c ?? 0),
    orphanJobs: Number(orphanJobs[0]?.c ?? 0),
    cohortInvoiceValueCents: cohortInvoiceValue,
    cohortPaymentsCents: cohortPayments,
    expectedInvoiceValueCents: input.expectedInvoiceValueCents,
    expectedPaymentsCents: input.expectedPaymentsCents,
    moneyMatch:
      cohortInvoiceValue === input.expectedInvoiceValueCents
      && cohortPayments === input.expectedPaymentsCents,
    orphanSourceDocuments,
    financialReconciliationFailures,
    warrantyCalculationFailures,
    pass:
      crossOrg === 0
      && duplicateInvoices === 0
      && duplicatePayments === 0
      && Number(orphanPayments[0]?.c ?? 0) === 0
      && Number(orphanJobs[0]?.c ?? 0) === 0
      && orphanSourceDocuments === 0
      && financialReconciliationFailures === 0
      && warrantyCalculationFailures === 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const harnessRoot = resolve(process.cwd(), "_runtime_harness", "workiz-migration");
  mkdirSync(harnessRoot, { recursive: true });

  const batchId = process.env.WORKIZ_PRODUCTION_BATCH_ID?.trim() || DEFAULT_BATCH_ID;
  const baseOptions = buildDataSourceOptions() as MysqlConnectionOptions;
  const databaseName = baseOptions.database ?? "unknown";

  const preWriteGate = {
    productionDatabaseName: databaseName,
    targetOrganizationId: PHOENIX_ORG_ID,
    deploymentCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    migrationState: null as { executed: number } | null,
    timestamp: new Date().toISOString(),
    importBatchId: batchId,
    productionAppUrl: PRODUCTION_APP_URL,
    portalAppUrl: PORTAL_APP_URL,
    pipelineVersion: WORKIZ_HISTORICAL_PIPELINE_VERSION,
  };

  const dataSource = new DataSource({ ...baseOptions, migrationsRun: false });
  await dataSource.initialize();

  const migrationSummary = await readMigrationLedgerSummary(dataSource);
  preWriteGate.migrationState = { executed: Number((migrationSummary.executedCount as number) ?? 0) };

  const productionDbIdentity = {
    dbName: databaseName,
    host: baseOptions.host ?? null,
    port: baseOptions.port ?? null,
    username: baseOptions.username ?? null,
  };

  const org = await resolvePhoenixOperatingOrganization(dataSource);
  if (org.id !== PHOENIX_ORG_ID) {
    throw new Error(`Refusing import: resolved organization id ${org.id} does not match SoT ${PHOENIX_ORG_ID}`);
  }

  const baseline = await captureBaseline(dataSource, org.id);
  const importBatchId = `${batchId}-parse-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const candidates = await parseAllWorkizHistoricalPdfs({ importBatchId });
  const { clusters } = resolveWorkizHistoricalIdentity(candidates);
  const resumeEligible = filterResumeSafeEligible(candidates);
  const resumeCohort = buildResumeCohortTotals(candidates);
  const resumeClusterCount = new Set(
    resumeEligible.map((candidate) => candidate.identity.cluster_id).filter(Boolean),
  ).size;

  const eligibleInvoiceCodes = resumeEligible.map((candidate) => candidate.invoice!.workiz_invoice_number);
  const existingWorkiz = await analyzeExistingWorkizImports({
    dataSource,
    organizationId: org.id,
    eligibleInvoiceCodes,
  });
  const customerMatchProjection = await analyzeGateCustomerMatches({
    dataSource,
    organizationId: org.id,
    clusters,
    eligible: resumeEligible,
  });

  const gateChecks = {
    dbNameIsWizfield: databaseName === "wizfield",
    phoenixOrgExists: true,
    phoenixOrgIdMatches: org.id === PHOENIX_ORG_ID,
    phoenixSlugMatches: org.slug === PHOENIX_ORG_SLUG,
    migrationLedgerValid: Boolean(migrationSummary.migrationLedgerValid),
    resumeCohortInvoiceCountMatches: resumeEligible.length === resumeCohort.invoices,
    resumeCohortClusterCountMatches: resumeClusterCount === resumeCohort.customerClusters,
    recoveryZeroNewCustomersProjected: Boolean(
      (customerMatchProjection as { recoveryResumeExpectsZeroNewCustomers?: boolean }).recoveryResumeExpectsZeroNewCustomers,
    ),
    noWorkizHistoricalImportInvoicesYet: Number(existingWorkiz.existingHistoricalImportInvoices ?? 0) === 0,
    readOnly: true,
    writesPerformed: false,
  };

  type Phase6Report = {
    phase: string;
    preWriteGate: typeof preWriteGate;
    productionDbIdentity: typeof productionDbIdentity;
    phoenixOrgIdentity: { id: string; slug: string; name: string };
    migrationSummary: Record<string, unknown>;
    gateChecks: typeof gateChecks;
    existingWorkizImports: Record<string, unknown>;
    customerMatchProjection: Record<string, unknown>;
    baseline: ProductionBaseline;
    approvedCohort: Record<string, unknown>;
    resumeOwnerDecisions: Record<string, unknown>;
    backup: Record<string, unknown> | null;
    sourceDocumentStorageNote: string;
    firstPass: ImportPassMetrics | null;
    secondPass: ImportPassMetrics | null;
    verification: Record<string, unknown> | null;
    idempotency: Record<string, unknown> | null;
    manualAuditSample: Array<Record<string, unknown>>;
    portalVerificationChecklist: Record<string, unknown>;
    postImportMetrics: Record<string, unknown> | null;
    phase6Status: string;
    rollbackTriggers: string[];
  };

  const gatePass =
    gateChecks.dbNameIsWizfield
    && gateChecks.phoenixOrgIdMatches
    && gateChecks.phoenixSlugMatches
    && gateChecks.migrationLedgerValid
    && gateChecks.resumeCohortInvoiceCountMatches
    && gateChecks.recoveryZeroNewCustomersProjected
    && gateChecks.noWorkizHistoricalImportInvoicesYet;

  const report: Phase6Report = {
    phase: "WORKIZ_PHASE6_CONTROLLED_PRODUCTION_IMPORT",
    preWriteGate,
    productionDbIdentity,
    phoenixOrgIdentity: { id: org.id, slug: org.slug, name: org.name },
    migrationSummary,
    gateChecks,
    existingWorkizImports: existingWorkiz,
    customerMatchProjection,
    baseline,
    approvedCohort: {
      ...resumeCohort,
      parsedResumeEligible: resumeEligible.length,
      expectedInvoiceValueCents: resumeCohort.invoiceValueCents,
      expectedPaymentCents: resumeCohort.paymentCents,
    },
    resumeOwnerDecisions: {
      note: "Phase 6 resume hardening — Angie excluded; Brenda/Kevin pinned to existing Phoenix customers.",
    },
    backup: null,
    sourceDocumentStorageNote:
      "Invoice PDFs remain on owner OneDrive source; DB stores provenance snapshots only. "
      + "Separate object-storage backup not required for this batch unless invoice_document rows are added later.",
    firstPass: null,
    secondPass: null,
    verification: null,
    idempotency: null,
    manualAuditSample: buildManualAuditSample(candidates),
    portalVerificationChecklist: {
      portalBaseUrl: PORTAL_APP_URL,
      note: "Owner/staff must verify representative customers in portal UI; agent records checklist only.",
      checks: [
        "correct customer",
        "correct invoice",
        "correct amounts",
        "correct balance",
        "historical date",
        "clean service description",
        "warranty information",
        "no Workiz clutter in normal UI",
        "no broken document routes",
        "no incorrect customer cross-linking",
      ],
    },
    postImportMetrics: null,
    phase6Status: "NOT_RUN",
    rollbackTriggers: [],
  };

  if (args.gateOnly || (!args.executeImport && !args.secondPassOnly)) {
    writeFileSync(
      join(harnessRoot, "phase6-pre-write-gate.json"),
      `${JSON.stringify({
        gatePass,
        preWriteGate,
        productionDbIdentity,
        phoenixOrgIdentity: report.phoenixOrgIdentity,
        migrationSummary,
        gateChecks,
        existingWorkizImports: existingWorkiz,
        customerMatchProjection,
        baseline,
        resumeCohort,
        eligibleCount: resumeEligible.length,
      }, null, 2)}\n`,
      "utf8",
    );
    report.phase6Status = gatePass ? "PHASE_6_PRE_WRITE_GATE_PASS" : "PHASE_6_PRE_WRITE_GATE_FAIL";
    writeFileSync(join(harnessRoot, "phase6-production-import-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      phase6PreWriteGate: gatePass ? "PASS" : "FAIL",
      productionDbIdentity,
      phoenixOrgIdentity: report.phoenixOrgIdentity,
      baseline,
      migrationSummary,
      gateChecks,
      resumeCohort,
      existingWorkizImports: existingWorkiz,
      customerMatchProjection,
      eligible: resumeEligible.length,
      deploymentCommit: preWriteGate.deploymentCommit,
    }, null, 2));
    await dataSource.destroy();
    console.log("Phase 6 import not executed. Production mutation remains NOT AUTHORIZED.");
    if (!gatePass) process.exitCode = 1;
    return;
  }

  if (!args.confirmProduction) {
    throw new Error("Refusing production import without --confirm-phoenix-production");
  }
  if (databaseName !== "wizfield") {
    throw new Error(`Refusing production import: expected database 'wizfield', got '${databaseName}'`);
  }

  assertWorkizProductionMutationAllowed(buildWorkizMutationGuardContext({
    dataSourceOptions: baseOptions,
    organizationId: org.id,
    organizationSlug: PHOENIX_ORG_SLUG,
    allowProductionMutation: args.allowProductionMutation,
    commandLabel: "workiz-historical-production-orchestrator",
  }));

  const gateSnapshotPath = join(harnessRoot, "phase6-pre-write-gate.json");
  let baselineBeforeImport = baseline;
  let baselineDrift: Record<string, unknown> | null = null;
  if (existsSync(gateSnapshotPath)) {
    const priorGate = JSON.parse(readFileSync(gateSnapshotPath, "utf8")) as {
      baseline?: ProductionBaseline;
    };
    if (priorGate.baseline) {
      baselineBeforeImport = priorGate.baseline;
      const driftFields: string[] = [];
      for (const key of Object.keys(priorGate.baseline) as Array<keyof ProductionBaseline>) {
        if (String(priorGate.baseline[key]) !== String(baseline[key])) {
          driftFields.push(key);
        }
      }
      baselineDrift = {
        driftDetected: driftFields.length > 0,
        driftFields,
        preWriteGateBaseline: priorGate.baseline,
        importStartBaseline: baseline,
      };
      if (driftFields.length > 0) {
        report.rollbackTriggers.push(`baseline_drift_before_import:${driftFields.join(",")}`);
      }
    }
  }
  (report as Phase6Report & { baselineBeforeImport?: ProductionBaseline; baselineDrift?: Record<string, unknown> | null }).baselineBeforeImport = baselineBeforeImport;
  (report as Phase6Report & { baselineDrift?: Record<string, unknown> | null }).baselineDrift = baselineDrift;

  if (!args.skipBackup) {
    try {
      report.backup = createLogicalDatabaseBackup(baseOptions, harnessRoot);
    } catch (error) {
      report.phase6Status = "FAIL_BACKUP";
      report.rollbackTriggers.push(`backup_failed:${error instanceof Error ? error.message : String(error)}`);
      writeFileSync(join(harnessRoot, "phase6-production-import-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
      throw error;
    }
  } else {
    report.backup = { skipped: true, reason: "--skip-backup" };
  }

  const importedAt = new Date().toISOString();
  await withWorkizPhase6ImportLock(dataSource, async () => {
    if (!args.secondPassOnly) {
      report.firstPass = await runProductionImportPass({
        dataSource,
        organizationId: org.id,
        eligible: resumeEligible,
        clusters,
        batchId,
        importedAt,
        buildHistoricalInvoiceInput: toHistoricalInvoiceInput,
      });
    }

    report.verification = await verifyProductionImport({
      dataSource,
      organizationId: org.id,
      cohortInvoiceCodes: resumeEligible.map((c) => c.invoice!.workiz_invoice_number),
      expectedInvoiceValueCents: resumeCohort.invoiceValueCents,
      expectedPaymentsCents: resumeCohort.paymentCents,
    });

    report.secondPass = await runProductionImportPass({
      dataSource,
      organizationId: org.id,
      eligible: resumeEligible,
      clusters,
      batchId,
      importedAt,
      buildHistoricalInvoiceInput: toHistoricalInvoiceInput,
    });
  });

  const secondPassMetrics = report.secondPass;
  if (!secondPassMetrics) {
    throw new Error("Phase 6 import lock completed without second pass metrics");
  }
  report.idempotency = {
    customersCreated: secondPassMetrics.customersCreated,
    jobsCreated: secondPassMetrics.jobsCreated,
    invoicesCreated: secondPassMetrics.invoicesCreated,
    paymentsCreated: secondPassMetrics.paymentsCreated,
    sourceDocumentsLinked: secondPassMetrics.sourceDocumentsLinked,
    pass:
      secondPassMetrics.customersCreated === 0
      && secondPassMetrics.jobsCreated === 0
      && secondPassMetrics.invoicesCreated === 0
      && secondPassMetrics.paymentsCreated === 0
      && secondPassMetrics.sourceDocumentsLinked === 0,
  };

  const afterBaseline = await captureBaseline(dataSource, org.id);
  const warrantyCounts = {
    documentedParts: resumeEligible.filter((c) => c.warranty_reconstruction?.parts.provenance === "DOCUMENTED").length,
    ambiguousParts: resumeEligible.filter((c) => c.warranty_reconstruction?.parts.provenance === "AMBIGUOUS_WARRANTY").length,
    defaultParts: resumeEligible.filter((c) => c.warranty_reconstruction?.parts.provenance === "PHOENIX_DEFAULT_POLICY").length,
    documentedLabor: resumeEligible.filter((c) => c.warranty_reconstruction?.labor.provenance === "DOCUMENTED").length,
    ambiguousLabor: resumeEligible.filter((c) => c.warranty_reconstruction?.labor.provenance === "AMBIGUOUS_WARRANTY").length,
    defaultLabor: resumeEligible.filter((c) => c.warranty_reconstruction?.labor.provenance === "PHOENIX_DEFAULT_POLICY").length,
  };

  report.postImportMetrics = {
    customersCreatedDelta: report.firstPass?.customersCreated ?? 0,
    customersMatched: report.firstPass?.customersMatched ?? 0,
    jobsCreated: report.firstPass?.jobsCreated ?? 0,
    invoicesCreated: report.firstPass?.invoicesCreated ?? 0,
    invoiceLinesCreated: report.firstPass?.invoiceLinesCreated ?? 0,
    paymentsCreated: report.firstPass?.paymentsCreated ?? 0,
    sourceDocumentsLinked: report.firstPass?.sourceDocumentsLinked ?? 0,
    serviceIntelligenceRecords: report.firstPass?.serviceIntelligenceRecords ?? 0,
    warrantyRecords: report.firstPass?.warrantyRecords ?? 0,
    skippedRecords: report.firstPass?.skippedRecords ?? 0,
    failedRecords: report.firstPass?.failedRecords ?? 0,
    firstPassMoneyTotals: {
      cohortInvoiceValueCents: (report.verification as { cohortInvoiceValueCents?: number })?.cohortInvoiceValueCents,
      cohortPaymentsCents: (report.verification as { cohortPaymentsCents?: number })?.cohortPaymentsCents,
    },
    afterBaseline,
    calgaryCustomersImported: resumeEligible.filter((c) => c.customer?.normalized_city === "calgary").length,
    calgaryCustomersWithEmail: resumeEligible.filter((c) =>
      c.customer?.normalized_city === "calgary" && Boolean(c.customer.normalized_email),
    ).length,
    repeatCustomers: clusters.filter((c) => c.classification === "CONFIRMED_REPEAT_CUSTOMER").length,
    warrantyCounts,
  };

  const verification = report.verification as { pass?: boolean; moneyMatch?: boolean } | null;
  const idempotency = report.idempotency as { pass?: boolean } | null;
  const firstPass = report.firstPass;
  const phase6Pass =
    Boolean(report.backup)
    && Boolean(verification?.pass)
    && Boolean(verification?.moneyMatch)
    && Boolean(idempotency?.pass)
    && (firstPass?.invoicesCreated ?? 0) + (await loadExistingWorkizImportIndex(dataSource, org.id)).size >= resumeEligible.length;

  report.phase6Status = phase6Pass ? "PASS" : "FAIL";

  const closeoutPath = resolve(process.cwd(), "..", "docs", "migration", "WORKIZ_PHASE6_PRODUCTION_IMPORT_CLOSEOUT.md");
  writeFileSync(closeoutPath, `# Workiz Phase 6 — Controlled Production Import

Status: **${report.phase6Status === "PASS" ? "WORKIZ PRODUCTION SAFE COHORT IMPORT — CLOSED / PASS" : "PHASE 6 — FAIL"}**

Production import remains scoped to Phoenix org \`${PHOENIX_ORG_ID}\` on database \`wizfield\`.
Full historical migration is **not** closed until the 70 financial MANUAL_REVIEW invoices are handled separately.

## Pre-write gate

\`\`\`json
${JSON.stringify(preWriteGate, null, 2)}
\`\`\`

## Backup

\`\`\`json
${JSON.stringify(report.backup, null, 2)}
\`\`\`

## First pass deltas

\`\`\`json
${JSON.stringify(report.firstPass, null, 2)}
\`\`\`

## Verification

\`\`\`json
${JSON.stringify(report.verification, null, 2)}
\`\`\`

## Idempotency (second pass)

\`\`\`json
${JSON.stringify(report.idempotency, null, 2)}
\`\`\`

## Manual audit sample (20 cases)

\`\`\`json
${JSON.stringify(report.manualAuditSample, null, 2)}
\`\`\`

## Portal verification

Portal base: ${PORTAL_APP_URL}

Staff must complete portal UI verification using the manual audit sample before customer communications.

## Post-import metrics

\`\`\`json
${JSON.stringify(report.postImportMetrics, null, 2)}
\`\`\`

## Next branches

- **Branch A — MANUAL REVIEW CLEANUP:** 70 financial MANUAL_REVIEW invoices (separate).
- **Branch B — CALGARY REACTIVATION:** segments after clean cohort is verified.
`, "utf8");

  writeFileSync(join(harnessRoot, "phase6-production-import-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    phase6Status: report.phase6Status,
    firstPass: report.firstPass,
    idempotency: report.idempotency,
    verification: report.verification,
  }, null, 2));

  await dataSource.destroy();
  if (report.phase6Status !== "PASS") process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
