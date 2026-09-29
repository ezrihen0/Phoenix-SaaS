/**
 * Read-only production migration ledger check via Railway SSH (no writes).
 * Uses the same base64-over-SSH pattern as run-multi-branch-prod-verify-ssh.mjs.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FINANCE_CEILING = 1791000000000;
const EXCLUDED = 1790000000000;

const remoteScript = String.raw`
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const backendRoots = [
  process.cwd(),
  path.join(process.cwd(), "backend"),
  "/app",
  "/app/backend",
];
let mysql = null;
let resolvedBackendRoot = null;
for (const root of backendRoots) {
  const pkg = path.join(root, "package.json");
  if (!fs.existsSync(pkg)) continue;
  try {
    mysql = createRequire(pkg)("mysql2/promise");
    resolvedBackendRoot = root;
    break;
  } catch {
    // try next root
  }
}
if (!mysql) {
  console.error(JSON.stringify({ error: "mysql2/promise not found", cwd: process.cwd(), backendRoots }));
  process.exit(1);
}
const FINANCE_CEILING = ${FINANCE_CEILING};
const EXCLUDED = ${EXCLUDED};
const FINANCE_PROGRAM_TIMESTAMPS = [
  1782000000000, 1785000000000, 1786000000000, 1787000000000, 1788000000000, 1791000000000,
];
(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [allRows] = await c.query(
    "SELECT id, timestamp, name FROM typeorm_migrations ORDER BY timestamp DESC LIMIT 40"
  );
  const [maxRow] = await c.query(
    "SELECT MAX(timestamp) AS high_water FROM typeorm_migrations"
  );
  const [financeBand] = await c.query(
    "SELECT id, timestamp, name FROM typeorm_migrations WHERE timestamp >= 1782000000000 AND timestamp <= 1792000000000 ORDER BY timestamp"
  );
  const [excludedRows] = await c.query(
    "SELECT id, timestamp, name FROM typeorm_migrations WHERE timestamp = ? OR name LIKE ?",
    [EXCLUDED, "%MultiBranchPhase1%"]
  );
  const appliedTs = new Set(financeBand.map((row) => Number(row.timestamp)));
  const pendingFinance = FINANCE_PROGRAM_TIMESTAMPS.filter((ts) => !appliedTs.has(ts));
  const overCeiling = financeBand.filter((row) => Number(row.timestamp) > FINANCE_CEILING);
  const checks = [
    {
      name: "multi_branch_179000_absent",
      status: excludedRows.length === 0 ? "PASS" : "FAIL",
      detail: excludedRows,
    },
    {
      name: "no_applied_migrations_above_finance_ceiling",
      status: overCeiling.length === 0 ? "PASS" : "FAIL",
      detail: overCeiling,
    },
  ];
  const ok = checks.every((row) => row.status === "PASS");
  const payload = {
    ok,
    generatedAt: new Date().toISOString(),
    database: process.env.DB_NAME,
    resolvedBackendRoot,
    productionHighWaterMark: Number(maxRow[0]?.high_water ?? 0),
    financeCeiling: FINANCE_CEILING,
    excludedTimestamp: EXCLUDED,
    latestMigrations: allRows.slice(0, 15),
    financeBandApplied: financeBand,
    pendingFinanceProgramMigrations: pendingFinance,
    missingFinanceMigrations: pendingFinance,
    checks,
  };
  console.log(JSON.stringify(payload, null, 2));
  await c.end();
  if (!ok) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
`;

const backendRoot = join(process.cwd());
const outDir = join(backendRoot, "_runtime_harness", "finance-phase15");
mkdirSync(outDir, { recursive: true });

const localPath = join(tmpdir(), `finance-phase15-prod-migration-readonly-${Date.now()}.js`);
writeFileSync(localPath, remoteScript, "utf8");

const remoteShell =
  "cat > /tmp/finance-phase15-prod-migration-readonly.js && node /tmp/finance-phase15-prod-migration-readonly.js";
const escapedLocal = localPath.replace(/'/g, "''");
const psCommand = [
  `Get-Content -Raw -LiteralPath '${escapedLocal}' |`,
  "npx --yes @railway/cli ssh --service phoenix-crm-backend --",
  `sh -c '${remoteShell.replace(/'/g, "'\\''")}'`,
].join(" ");
const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", psCommand], {
  cwd: backendRoot,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});

try {
  unlinkSync(localPath);
} catch {
  // ignore
}

const stdout = result.stdout || "";
const stderr = result.stderr || "";
if (stdout.trim()) {
  console.log(stdout);
}
if (stderr) console.error(stderr);

const jsonStart = stdout.indexOf("{");
if (jsonStart >= 0) {
  try {
    const parsed = JSON.parse(stdout.slice(jsonStart));
    writeFileSync(
      join(outDir, "production-migration-readonly.json"),
      JSON.stringify(parsed, null, 2),
      "utf8",
    );
  } catch {
    // ignore parse errors
  }
}

process.exit(result.status ?? 1);
