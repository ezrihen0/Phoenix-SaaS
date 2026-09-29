import "dotenv/config";

import mysql from "mysql2/promise";

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";

type CheckResult = { name: string; status: "PASS" | "FAIL"; detail?: unknown };

type BranchRow = {
  id: string;
  code: string;
  name: string;
  tax_label: string | null;
  default_tax_rate_bps: number;
  invoice_prefix: string;
  estimate_prefix: string;
  city: string | null;
  province: string | null;
  active: number;
};

async function main() {
  const results: CheckResult[] = [];
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "wizfield",
  });

  try {
    const [migrationRows] = (await connection.query(
      `SELECT id, timestamp, name FROM typeorm_migrations
       WHERE name LIKE '%MultiBranchPhase1%' OR timestamp = 1790000000000`,
    )) as [Array<{ id: number; timestamp: number; name: string }>, unknown];
    results.push({
      name: "migration_ledger",
      status:
        migrationRows.length === 1
        && migrationRows[0]?.name.includes("MultiBranchPhase1Foundation")
          ? "PASS"
          : "FAIL",
      detail: migrationRows,
    });

    const [branches] = (await connection.query(
      `SELECT id, code, name, tax_label, default_tax_rate_bps,
              invoice_prefix, estimate_prefix, city, province, active
       FROM branches
       WHERE organization_id = ?
       ORDER BY sort_order`,
      [PHOENIX_ORG_ID],
    )) as [BranchRow[], unknown];

    const ab = branches.find((row) => row.code === "AB");
    const on = branches.find((row) => row.code === "ON");
    const taxOk =
      ab?.tax_label === "GST"
      && ab.default_tax_rate_bps === 500
      && ab.invoice_prefix === "AB-INV-"
      && on?.tax_label === "HST"
      && on.default_tax_rate_bps === 1300
      && on.invoice_prefix === "ON-INV-";

    results.push({
      name: "phoenix_branch_rows",
      status: branches.length === 2 && taxOk ? "PASS" : "FAIL",
      detail: branches,
    });

    const [sequences] = (await connection.query(
      `SELECT b.code, s.next_value
       FROM branch_invoice_sequences s
       JOIN branches b ON b.id = s.branch_id
       WHERE b.organization_id = ?
       ORDER BY b.code`,
      [PHOENIX_ORG_ID],
    )) as [Array<{ code: string; next_value: string }>, unknown];

    results.push({
      name: "branch_invoice_sequences",
      status: sequences.length === 2 ? "PASS" : "FAIL",
      detail: sequences,
    });

    const [jobCompat] = (await connection.query(
      `SELECT
         COUNT(*) AS jobs_total,
         SUM(branch_id IS NULL) AS jobs_null_branch,
         SUM(
           CASE WHEN branch_id IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM branches b WHERE b.id = jobs.branch_id
           ) THEN 1 ELSE 0 END
         ) AS invalid_branch_fk
       FROM jobs
       WHERE organization_id = ?`,
      [PHOENIX_ORG_ID],
    )) as [Array<{ jobs_total: number; jobs_null_branch: number; invalid_branch_fk: number }>, unknown];

    results.push({
      name: "jobs_branch_compatibility",
      status: Number(jobCompat[0]?.invalid_branch_fk ?? 1) === 0 ? "PASS" : "FAIL",
      detail: jobCompat[0],
    });

    const [crossOrg] = (await connection.query(
      `SELECT COUNT(*) AS cross_org_access
       FROM membership_branch_access mba
       JOIN memberships m ON m.id = mba.membership_id
       JOIN branches b ON b.id = mba.branch_id
       WHERE m.organization_id <> b.organization_id`,
    )) as [Array<{ cross_org_access: number }>, unknown];

    results.push({
      name: "branch_rbac_cross_org",
      status: Number(crossOrg[0]?.cross_org_access ?? 1) === 0 ? "PASS" : "FAIL",
      detail: crossOrg[0],
    });

    const [snapshots] = (await connection.query(
      `SELECT id, document_number, status,
              JSON_EXTRACT(branding_snapshot_json, '$.schema_version') AS schema_version,
              JSON_EXTRACT(branding_snapshot_json, '$.branch.branch_code') AS branch_code
       FROM invoices
       WHERE organization_id = ?
         AND branding_snapshot_json IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT 20`,
      [PHOENIX_ORG_ID],
    )) as [
      Array<{
        id: string;
        document_number: string | null;
        status: string;
        schema_version: unknown;
        branch_code: unknown;
      }>,
      unknown,
    ];

    const v2Rows = snapshots.filter((row) => Number(row.schema_version) === 2);
    const v2Valid =
      v2Rows.length === 0
      || v2Rows.every((row) => typeof row.branch_code === "string" && row.branch_code.length > 0);

    results.push({
      name: "snapshot_v2_sample",
      status: v2Valid ? "PASS" : "FAIL",
      detail: {
        sample_count: snapshots.length,
        v2_count: v2Rows.length,
        note:
          v2Rows.length === 0
            ? "No v2 snapshots in prod yet; column readable and legacy snapshots OK"
            : undefined,
        rows: snapshots.slice(0, 5),
      },
    });

    const ok = results.every((row) => row.status === "PASS");
    console.log(JSON.stringify({ ok, database: process.env.DB_NAME, results }, null, 2));
    if (!ok) {
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
