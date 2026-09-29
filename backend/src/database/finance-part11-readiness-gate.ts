/**
 * Phase 11 — Workiz migration readiness gate (compatibility only; migration deferred until after Phase 15).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const backendRoot = join(__dirname, "..", "..");
const repoRoot = join(backendRoot, "..");
const outputDir = join(backendRoot, "_runtime_harness", "finance-part11");

type GateItem = {
  id: string;
  label: string;
  status: "READY" | "PARTIAL" | "BLOCKED" | "DEFERRED";
  blocksWorkizMigration: boolean;
  note?: string;
};

function readPackageScripts(): Record<string, string> {
  const raw = readFileSync(join(backendRoot, "package.json"), "utf8");
  return (JSON.parse(raw) as { scripts: Record<string, string> }).scripts;
}

function main() {
  const scripts = readPackageScripts();
  const requiredScripts = [
    "finance-part11:checks",
    "finance-historical-compatibility:unit-check",
    "finance-part10:checks",
    "finance-part6:workiz-audit",
  ];

  const missingScripts = requiredScripts.filter((name) => !scripts[name]);

  const items: GateItem[] = [
    {
      id: "finance_spine_4_10",
      label: "Phases 4–10 check chain (finance-part10:checks)",
      status: missingScripts.length === 0 ? "READY" : "BLOCKED",
      blocksWorkizMigration: missingScripts.length > 0,
      note: missingScripts.length ? `Missing scripts: ${missingScripts.join(", ")}` : undefined,
    },
    {
      id: "phase11_compatibility_tests",
      label: "Phase 11 historical compatibility unit checks",
      status: scripts["finance-historical-compatibility:unit-check"] ? "READY" : "BLOCKED",
      blocksWorkizMigration: !scripts["finance-historical-compatibility:unit-check"],
    },
    {
      id: "dual_pdf_kinds",
      label: "workiz_source_pdf + native_customer_pdf coexistence",
      status: "READY",
      blocksWorkizMigration: false,
    },
    {
      id: "discount_fidelity",
      label: "Faithful historical discount representation",
      status: "BLOCKED",
      blocksWorkizMigration: true,
      note: "No invoice discount column; money engine discountCents=0 — defer to migration project schema/policy.",
    },
    {
      id: "snapshot_convergence",
      label: "Single customer-facing truth (v3 snapshot for AI/native PDF)",
      status: "PARTIAL",
      blocksWorkizMigration: true,
      note: "Workiz rows often branding-only; migration must backfill v3 or extend reads.",
    },
    {
      id: "canonical_numbering_on_import",
      label: "Canonical document_number on import (not Workiz code in UI)",
      status: "PARTIAL",
      blocksWorkizMigration: true,
      note: "Policy + migration allocator; display fallback exists until numbers assigned.",
    },
    {
      id: "phase_15_closeout",
      label: "Part 7 Phases 13–15 production closeout",
      status: "DEFERRED",
      blocksWorkizMigration: true,
      note: "Required before separate Workiz migration workstream starts.",
    },
    {
      id: "phase_12_unified_reads",
      label: "Phase 12 Customer/Job/Portal integration",
      status: "DEFERRED",
      blocksWorkizMigration: false,
      note: "Recommended before customer-facing historical surfaces.",
    },
    {
      id: "backup_checkpoint",
      label: "Backup/recovery checkpoint before migration",
      status: "DEFERRED",
      blocksWorkizMigration: true,
      note: "Ops runbook — not automated in Phase 11.",
    },
  ];

  const workizMigrationExecutable =
    items.every((item) => !item.blocksWorkizMigration || item.status === "READY" || item.status === "DEFERRED")
      ? false
      : false;

  const report = {
    generated_at: new Date().toISOString(),
    phase: 11,
    actual_workiz_migration: "DEFERRED_UNTIL_AFTER_PHASE_15",
    workiz_migration_executable_now: workizMigrationExecutable,
    compatibility_report: join(repoRoot, "docs/finance/phase11-historical-compatibility-report.md"),
    provenance_contract: join(repoRoot, "docs/finance/phase11-provenance-contract.md"),
    missing_npm_scripts: missingScripts,
    items,
    minimum_before_migration: [
      "finance-part10:checks PASS",
      "finance-part9:certify / finance-program:finish PASS on configured DB",
      "Phase 12 unified Finance reads",
      "Phase 13–15 closeout",
      "Owner-approved discount + numbering + snapshot policies",
      "Backup checkpoint",
    ],
  };

  mkdirSync(outputDir, { recursive: true });
  const outPath = join(outputDir, "workiz-migration-readiness-gate.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  if (missingScripts.length > 0) {
    console.error(JSON.stringify({ ok: false, missingScripts, outPath }, null, 2));
    process.exit(1);
  }

  if (!existsSync(join(repoRoot, "docs/finance/phase11-historical-compatibility-report.md"))) {
    console.error("Missing compatibility report markdown");
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, outPath, workiz_migration_executable_now: false }, null, 2));
}

main();
