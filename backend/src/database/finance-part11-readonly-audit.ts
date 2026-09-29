/**
 * Phase 11A — read-only audit artifact (no imports, no writes to production finance rows).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const backendRoot = join(__dirname, "..", "..");
const repoRoot = join(backendRoot, "..");
const outputDir = join(backendRoot, "_runtime_harness", "finance-part11");

const CORPUS_REQUIREMENTS = {
  customersApprox: 642,
  invoiceCsvRecordsApprox: 415,
  pdfsApprox: 413,
  uniquePdfInvoiceNumbersApprox: 410,
  duplicatePdfPairsApprox: 3,
  csvWithoutPdfApprox: 5,
  notes: "Counts from prior recovery audit — not re-imported in Phase 11.",
};

function latestWorkizClassification(): Record<string, unknown> | null {
  const auditDir = join(backendRoot, "_runtime_harness", "finance-part6-workiz-audit");
  if (!existsSync(auditDir)) {
    return null;
  }

  const files = readdirSync(auditDir)
    .filter((name) => name.startsWith("classification-") && name.endsWith(".json"))
    .map((name) => join(auditDir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  if (!files[0]) {
    return null;
  }

  return JSON.parse(readFileSync(files[0], "utf8")) as Record<string, unknown>;
}

function main() {
  mkdirSync(outputDir, { recursive: true });

  const orgId = process.env.FINANCE_AUDIT_ORG_ID?.trim() || process.env.PHOENIX_ORG_ID?.trim() || "";
  let workizAudit: Record<string, unknown> | null = null;

  if (orgId) {
    execSync("npm run finance-part6:workiz-audit", {
      cwd: backendRoot,
      stdio: "inherit",
      env: process.env,
    });
    workizAudit = latestWorkizClassification();
  }

  const artifact = {
    generated_at: new Date().toISOString(),
    mode: "read_only",
    organization_id_audited: orgId || null,
    corpus_requirements: CORPUS_REQUIREMENTS,
    compatibility_report: "docs/finance/phase11-historical-compatibility-report.md",
    workiz_row_classification: workizAudit,
    legacy_row_policy: "Do not use malformed production rows as design baseline; triage via Part 6 classifications.",
    workiz_migration: "DEFERRED_UNTIL_AFTER_PHASE_15",
  };

  const outPath = join(outputDir, "phase11-readonly-audit.json");
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, audited: Boolean(orgId) }, null, 2));
}

main();
