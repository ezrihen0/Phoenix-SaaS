import "dotenv/config";
import "reflect-metadata";

import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";

import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { CustomerEntity } from "./entities/customer.entity";
import { parseAllWorkizHistoricalPdfs } from "./workiz/workiz-historical-parser.v1";
import { resolveWorkizHistoricalIdentity } from "./workiz/workiz-historical-identity.v1";
import {
  buildWorkizCustomerExternalKey,
  matchProductionPhoenixCustomer,
} from "./workiz/workiz-historical-production-customer-match";
import { isWorkizWarrantyReconstructionValid } from "./workiz/workiz-historical-service-warranty.v1";
import type {
  WorkizCustomerCluster,
  WorkizHistoricalCustomerEvidence,
  WorkizHistoricalParseCandidate,
} from "./workiz/workiz-historical-types.v1";
import { PHOENIX_ORG_ID } from "./workiz/workiz-production-mutation-guard";
import { filterResumeSafeEligible } from "./workiz/workiz-phase6-resume-cohort";
import { buildDataSourceOptions } from "./typeorm.config";

const IMPORT_ACTIVITY_START_ISO = "2026-10-05T02:50:47.776Z";

type ClusterStatus =
  | "MATCHED_EXISTING_CORRECTLY"
  | "CREATED_CORRECTLY"
  | "MISSING_FROM_PRODUCTION"
  | "WRONG_MATCH"
  | "POSSIBLE_DUPLICATE"
  | "MANUAL_REVIEW";

function isEligible(candidate: WorkizHistoricalParseCandidate): boolean {
  if (!candidate.source.is_canonical_for_invoice) return false;
  if (!candidate.invoice || !candidate.customer) return false;
  if (candidate.financial_gate !== "PASS") return false;
  if (candidate.identity.classification === "MANUAL_REVIEW") return false;
  if (!isWorkizWarrantyReconstructionValid(candidate.warranty_reconstruction)) return false;
  return true;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeStreet(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function customerHasTag(customer: CustomerEntity, tag: string): boolean {
  return Array.isArray(customer.tags) && customer.tags.includes(tag);
}

function snapshotAlignsWithCustomer(
  snapshot: WorkizHistoricalCustomerEvidence,
  customer: CustomerEntity,
  matchType: string | null,
): boolean {
  if (matchType === "email" && snapshot.normalized_email) {
    return (customer.email ?? "").trim().toLowerCase() === snapshot.normalized_email;
  }
  if (matchType === "phone" && snapshot.normalized_phone) {
    return customer.phone.replace(/\D/g, "") === snapshot.normalized_phone;
  }
  if (matchType === "name_address") {
    return normalizeName(customer.full_name) === normalizeName(snapshot.name)
      && normalizeStreet(customer.service_address_line_1) === normalizeStreet(snapshot.address_line_1)
      && customer.service_postal_code.trim().toUpperCase() === snapshot.postal_code.trim().toUpperCase();
  }
  if (matchType === "external_client_number") {
    return customer.full_name.trim().length > 0;
  }
  return true;
}

function expectedMatchLabel(
  outcome: Awaited<ReturnType<typeof matchProductionPhoenixCustomer>>,
): string {
  if (outcome.kind === "create") return "PROJECTED_NEW_CUSTOMER";
  if (outcome.kind === "ambiguous") return "PROJECTED_AMBIGUOUS";
  return `PROJECTED_${outcome.strategy.toUpperCase()}_MATCH`;
}

async function reconcileCluster(input: {
  dataSource: DataSource;
  organizationId: string;
  cluster: WorkizCustomerCluster;
}): Promise<Record<string, unknown>> {
  const snapshot = input.cluster.customer_snapshot;
  const base = {
    cluster_id: input.cluster.cluster_id,
    source_customer_name: snapshot?.name ?? null,
    normalized_email: snapshot?.normalized_email ?? null,
    normalized_phone: snapshot?.normalized_phone ?? null,
    source_address: snapshot
      ? `${snapshot.address_line_1}, ${snapshot.city}, ${snapshot.province ?? ""} ${snapshot.postal_code}`.trim()
      : null,
    identity_classification: input.cluster.classification,
    invoice_numbers: input.cluster.invoice_numbers,
  };

  if (!snapshot) {
    return {
      ...base,
      expected_match_classification: "MANUAL_REVIEW",
      production_customer_id: null,
      production_match_type: null,
      existing_before_import: null,
      created_by_interrupted_import: null,
      workiz_tag_present: null,
      historical_import_tag_present: null,
      calgary_tag_present: null,
      workiz_external_key: null,
      status: "MANUAL_REVIEW" satisfies ClusterStatus,
      detail: "missing_customer_snapshot",
    };
  }

  const externalKey = buildWorkizCustomerExternalKey(snapshot, input.cluster.cluster_id);
  const repo = input.dataSource.getRepository(CustomerEntity);
  const externalMatches = await repo.find({
    where: { organization_id: input.organizationId, external_client_number: externalKey },
  });

  const matchOutcome = await matchProductionPhoenixCustomer({
    dataSource: input.dataSource,
    organizationId: input.organizationId,
    snapshot,
    clusterId: input.cluster.cluster_id,
  });

  if (matchOutcome.kind === "ambiguous") {
    return {
      ...base,
      expected_match_classification: expectedMatchLabel(matchOutcome),
      production_customer_id: null,
      production_match_type: null,
      existing_before_import: null,
      created_by_interrupted_import: null,
      workiz_tag_present: null,
      historical_import_tag_present: null,
      calgary_tag_present: null,
      workiz_external_key: externalKey,
      status: "MANUAL_REVIEW" satisfies ClusterStatus,
      detail: matchOutcome.reason,
      ambiguous_candidate_ids: matchOutcome.candidateIds,
    };
  }

  if (externalMatches.length > 1) {
    return {
      ...base,
      expected_match_classification: expectedMatchLabel(matchOutcome),
      production_customer_id: externalMatches.map((row) => row.id).join(","),
      production_match_type: "external_client_number",
      existing_before_import: null,
      created_by_interrupted_import: null,
      workiz_tag_present: null,
      historical_import_tag_present: null,
      calgary_tag_present: null,
      workiz_external_key: externalKey,
      status: "POSSIBLE_DUPLICATE" satisfies ClusterStatus,
      detail: "duplicate_external_client_number",
    };
  }

  let productionCustomerId: string | null = null;
  let productionMatchType: string | null = null;

  if (externalMatches.length === 1) {
    productionCustomerId = externalMatches[0].id;
    productionMatchType = "external_client_number";
  } else if (matchOutcome.kind === "matched") {
    productionCustomerId = matchOutcome.customerId;
    productionMatchType = matchOutcome.strategy;
  }

  if (!productionCustomerId) {
    return {
      ...base,
      expected_match_classification: expectedMatchLabel(matchOutcome),
      production_customer_id: null,
      production_match_type: null,
      existing_before_import: "no",
      created_by_interrupted_import: "no",
      workiz_tag_present: "no",
      historical_import_tag_present: "no",
      calgary_tag_present: snapshot.normalized_city === "calgary" ? "expected" : "n/a",
      workiz_external_key: externalKey,
      status: "MISSING_FROM_PRODUCTION" satisfies ClusterStatus,
    };
  }

  const customer = await repo.findOne({
    where: { id: productionCustomerId, organization_id: input.organizationId },
  });
  if (!customer) {
    return {
      ...base,
      expected_match_classification: expectedMatchLabel(matchOutcome),
      production_customer_id: productionCustomerId,
      production_match_type: productionMatchType,
      existing_before_import: null,
      created_by_interrupted_import: null,
      workiz_tag_present: null,
      historical_import_tag_present: null,
      calgary_tag_present: null,
      workiz_external_key: externalKey,
      status: "MANUAL_REVIEW" satisfies ClusterStatus,
      detail: "resolved_id_missing_in_db",
    };
  }

  const importStart = Date.parse(IMPORT_ACTIVITY_START_ISO);
  const createdAt = customer.created_at?.getTime() ?? NaN;
  const existingBeforeImport = Number.isFinite(createdAt) && createdAt < importStart;
  const createdByInterruptedImport = Number.isFinite(createdAt) && createdAt >= importStart;

  const workizTag = customerHasTag(customer, "WORKIZ");
  const historicalTag = customerHasTag(customer, "HISTORICAL_IMPORT");
  const calgaryTag = customerHasTag(customer, "CALGARY");
  const isCalgary = snapshot.normalized_city === "calgary";

  if (!snapshotAlignsWithCustomer(snapshot, customer, productionMatchType)) {
    return {
      ...base,
      expected_match_classification: expectedMatchLabel(matchOutcome),
      production_customer_id: customer.id,
      production_match_type: productionMatchType,
      existing_before_import: existingBeforeImport ? "yes" : "no",
      created_by_interrupted_import: createdByInterruptedImport ? "yes" : "no",
      workiz_tag_present: workizTag ? "yes" : "no",
      historical_import_tag_present: historicalTag ? "yes" : "no",
      calgary_tag_present: isCalgary ? (calgaryTag ? "yes" : "no") : "n/a",
      workiz_external_key: customer.external_client_number ?? externalKey,
      status: "WRONG_MATCH" satisfies ClusterStatus,
    };
  }

  const projectedNew = matchOutcome.kind === "create"
    || (matchOutcome.kind === "matched" && matchOutcome.strategy === "external_client_number" && createdByInterruptedImport);

  let status: ClusterStatus;
  if (existingBeforeImport && productionMatchType !== "external_client_number") {
    status = "MATCHED_EXISTING_CORRECTLY";
  } else if (existingBeforeImport && productionMatchType === "external_client_number") {
    status = customer.external_client_number?.startsWith("workiz:") ? "MANUAL_REVIEW" : "WRONG_MATCH";
  } else if (createdByInterruptedImport || projectedNew) {
    status = workizTag && historicalTag ? "CREATED_CORRECTLY" : "MANUAL_REVIEW";
  } else {
    status = "MANUAL_REVIEW";
  }

  if (status === "CREATED_CORRECTLY" && isCalgary && !calgaryTag) {
    status = "MANUAL_REVIEW";
  }

  return {
    ...base,
    expected_match_classification: expectedMatchLabel(matchOutcome),
    production_customer_id: customer.id,
    production_match_type: productionMatchType,
    existing_before_import: existingBeforeImport ? "yes" : "no",
    created_by_interrupted_import: createdByInterruptedImport ? "yes" : "no",
    workiz_tag_present: workizTag ? "yes" : "no",
    historical_import_tag_present: historicalTag ? "yes" : "no",
    calgary_tag_present: isCalgary ? (calgaryTag ? "yes" : "no") : "n/a",
    workiz_external_key: customer.external_client_number ?? externalKey,
    status,
  };
}

function applyRailwayProductionDbEnv(): void {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const railwayJson = execSync(`${npx} --yes @railway/cli variables --service MySQL --json`, { encoding: "utf8" });
  const mysqlVars = JSON.parse(railwayJson) as { MYSQL_PUBLIC_URL: string };
  const publicUrl = new URL(mysqlVars.MYSQL_PUBLIC_URL);
  publicUrl.pathname = "/wizfield";
  process.env.DB_HOST = publicUrl.hostname;
  process.env.DB_PORT = publicUrl.port || "3306";
  process.env.DB_USERNAME = decodeURIComponent(publicUrl.username);
  process.env.DB_PASSWORD = decodeURIComponent(publicUrl.password);
  process.env.DB_NAME = "wizfield";
  process.env.DB_TYPE = "mysql";
}

async function main() {
  applyRailwayProductionDbEnv();
  const harnessRoot = resolve(process.cwd(), "_runtime_harness", "workiz-migration");
  mkdirSync(harnessRoot, { recursive: true });

  const candidates = await parseAllWorkizHistoricalPdfs({
    importBatchId: "workiz-phase6b-reconciliation-readonly",
  });
  const { clusters } = resolveWorkizHistoricalIdentity(candidates);
  const eligible = filterResumeSafeEligible(candidates);
  const clusterIds = [...new Set(
    eligible.map((candidate) => candidate.identity.cluster_id).filter(Boolean) as string[],
  )].sort();
  const clusterById = new Map(clusters.map((cluster) => [cluster.cluster_id, cluster]));

  const baseOptions = buildDataSourceOptions() as MysqlConnectionOptions;
  const dataSource = new DataSource({ ...baseOptions, migrationsRun: false });
  await dataSource.initialize();

  const rows: Record<string, unknown>[] = [];
  for (const clusterId of clusterIds) {
    const cluster = clusterById.get(clusterId);
    if (!cluster) {
      rows.push({
        cluster_id: clusterId,
        status: "MANUAL_REVIEW",
        detail: "cluster_not_found_in_identity_resolution",
      });
      continue;
    }
    rows.push(await reconcileCluster({
      dataSource,
      organizationId: PHOENIX_ORG_ID,
      cluster,
    }));
  }

  await dataSource.destroy();

  const summary = {
    totalClusters: rows.length,
    expectedClusters: 333,
    byStatus: rows.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.status ?? "UNKNOWN");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    matchedExistingCorrectly: rows.filter((r) => r.status === "MATCHED_EXISTING_CORRECTLY").length,
    createdCorrectly: rows.filter((r) => r.status === "CREATED_CORRECTLY").length,
    missing: rows.filter((r) => r.status === "MISSING_FROM_PRODUCTION").length,
    wrongMatch: rows.filter((r) => r.status === "WRONG_MATCH").length,
    possibleDuplicate: rows.filter((r) => r.status === "POSSIBLE_DUPLICATE").length,
    manualReview: rows.filter((r) => r.status === "MANUAL_REVIEW").length,
  };

  const output = {
    generatedAt: new Date().toISOString(),
    importActivityStartIso: IMPORT_ACTIVITY_START_ISO,
    organizationId: PHOENIX_ORG_ID,
    summary,
    clusters: rows,
  };

  const jsonPath = join(harnessRoot, "phase6b-customer-reconciliation.json");
  writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const mdPath = resolve(process.cwd(), "..", "docs", "migration", "WORKIZ_PHASE6B_CUSTOMER_RECONCILIATION.md");
  writeFileSync(mdPath, `# Workiz Phase 6B — Customer Recovery Reconciliation (read-only)

Generated: ${output.generatedAt}

## Summary

\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`

Full per-cluster rows (${rows.length}): \`backend/_runtime_harness/workiz-migration/phase6b-customer-reconciliation.json\`

No production mutations were performed.
`, "utf8");

  console.log(JSON.stringify({ summary, jsonPath }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
