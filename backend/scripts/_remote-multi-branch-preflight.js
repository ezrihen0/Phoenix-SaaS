const mysql = require("mysql2/promise");

(async () => {
  const orgId = "8d5bc762-eb13-43e5-85a1-723477adb47c";
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    connectTimeout: 15_000,
  });
  const requiredTables = ["branches", "membership_branch_access", "branch_invoice_sequences"];
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
