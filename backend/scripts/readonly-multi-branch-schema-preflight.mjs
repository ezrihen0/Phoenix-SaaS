/**
 * READ-ONLY: production multi-branch schema preflight via Railway SSH.
 * Does not apply migrations or mutate data.
 *
 * Windows: pipes script to `node -` (avoid `node -e`; shell parsing breaks on `;` / `DATABASE()`).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PHOENIX_ORG_ID =
  process.env.PHOENIX_WIZFIELD_ORG_ID?.trim() || "8d5bc762-eb13-43e5-85a1-723477adb47c";

const remoteScript = `
const mysql = require('mysql2/promise');
(async () => {
  const orgId = ${JSON.stringify(PHOENIX_ORG_ID)};
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });
  const requiredTables = ['branches', 'membership_branch_access', 'branch_invoice_sequences'];
  const [tableRows] = await connection.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?,?,?)",
    requiredTables,
  );
  const presentTables = tableRows.map((r) => r.TABLE_NAME);
  async function hasBranchColumn(tableName) {
    const [rows] = await connection.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'branch_id'",
      [tableName],
    );
    return rows.length > 0;
  }
  const [fkRows] = await connection.query(
    "SELECT CONSTRAINT_NAME, TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'branches' AND TABLE_NAME IN ('jobs','quotes','invoices')",
  );
  let jobBranchIndex = [];
  try {
    [jobBranchIndex] = await connection.query(
      "SHOW INDEX FROM jobs WHERE Key_name = 'IDX_jobs_organization_branch'",
    );
  } catch {}
  let phoenixBranches = [];
  if (presentTables.includes("branches")) {
    [phoenixBranches] = await connection.query(
      "SELECT id, code, active FROM branches WHERE organization_id = ? ORDER BY code",
      [orgId],
    );
  }
  const jobsBranchId = await hasBranchColumn("jobs");
  const quotesBranchId = await hasBranchColumn("quotes");
  const invoicesBranchId = await hasBranchColumn("invoices");
  await connection.end();
  process.stdout.write(
    JSON.stringify({
      database: process.env.DB_NAME,
      presentTables,
      missingTables: requiredTables.filter((t) => !presentTables.includes(t)),
      jobsBranchId,
      quotesBranchId,
      invoicesBranchId,
      idxJobsOrganizationBranch: jobBranchIndex.length > 0,
      branchForeignKeys: fkRows,
      phoenixBranches,
    }),
  );
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;

const saasRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const child = spawnSync(
  "npx",
  ["@railway/cli", "ssh", "-s", "phoenix-crm-backend", "--", "node", "-"],
  {
    cwd: saasRoot,
    encoding: "utf8",
    input: remoteScript,
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
    shell: true,
  },
);

if (child.error) {
  console.error(child.error.message);
  process.exit(1);
}
if (child.status !== 0) {
  console.error(child.stderr || child.stdout || "railway ssh failed");
  process.exit(child.status ?? 1);
}

const payload = child.stdout;

const parsed = JSON.parse(payload.trim());
const requiredFk = ["FK_jobs_branch", "FK_quotes_branch", "FK_invoices_branch"];
const fkNames = new Set(parsed.branchForeignKeys.map((r) => r.CONSTRAINT_NAME));
const missingFk = requiredFk.filter((name) => !fkNames.has(name));

const checks = {
  tables: parsed.missingTables.length === 0,
  jobsBranchId: parsed.jobsBranchId,
  quotesBranchId: parsed.quotesBranchId,
  invoicesBranchId: parsed.invoicesBranchId,
  idxJobsOrganizationBranch: parsed.idxJobsOrganizationBranch,
  branchForeignKeys: missingFk.length === 0,
  phoenixAbOnBranches:
    parsed.phoenixBranches.filter((b) => b.active && (b.code === "AB" || b.code === "ON")).length >= 2,
};

const failed = Object.entries(checks).filter(([, ok]) => !ok);
let status = "PRESENT";
if (failed.length === Object.keys(checks).length) status = "MISSING";
else if (failed.length > 0) status = "PARTIAL";

console.log(
  JSON.stringify(
    {
      status: `PRODUCTION MULTI-BRANCH SCHEMA — ${status}`,
      checks,
      failedChecks: failed.map(([k]) => k),
      raw: parsed,
    },
    null,
    2,
  ),
);

process.exit(status === "PRESENT" ? 0 : 2);
