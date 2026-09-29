const mysql = require("mysql2/promise");

const orgId = "8d5bc762-eb13-43e5-85a1-723477adb47c";
const abBranchId = "475b5a8a-359a-4fda-b9dc-92a5ce1e7108";
const blockingStatuses = ["scheduled", "in_progress", "completed", "on_hold"];

(async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    connectTimeout: 15_000,
  });

  const from = "2026-10-01";
  const to = "2026-10-31";
  const rangeStart = "2026-10-01 06:00:00.000";
  const rangeEndExclusive = "2026-11-01 07:00:00.000";

  const [counts] = await connection.query(
    "SELECT COUNT(*) AS totalJobs, SUM(branch_id IS NOT NULL) AS withBranch FROM jobs WHERE organization_id = ?",
    [orgId],
  );

  const statusPlaceholders = blockingStatuses.map(() => "?").join(",");
  const sql = `SELECT scheduled_window, scheduled_for FROM jobs WHERE organization_id = ? AND branch_id = ? AND status IN (${statusPlaceholders}) AND scheduled_for >= ? AND scheduled_for < ?`;

  const params = [orgId, abBranchId, ...blockingStatuses, rangeStart, rangeEndExclusive];

  const t0 = process.hrtime.bigint();
  const [rows] = await connection.query(sql, params);
  const queryMs = Number(process.hrtime.bigint() - t0) / 1e6;

  const [explain] = await connection.query(`EXPLAIN ${sql}`, params);

  const [indexes] = await connection.query("SHOW INDEX FROM jobs WHERE Key_name IN ('IDX_jobs_organization_id','IDX_jobs_organization_branch')");

  await connection.end();

  process.stdout.write(
    JSON.stringify({
      orgId,
      abBranchId,
      range: { from, to },
      jobCounts: counts[0],
      matchingRowsOctoberAb: rows.length,
      queryMsRounded: Math.round(queryMs * 100) / 100,
      explain,
      jobsIndexes: indexes.map((i) => ({
        Key_name: i.Key_name,
        Seq_in_index: i.Seq_in_index,
        Column_name: i.Column_name,
      })),
      note: "Read-only observation of monthly availability job scan (Calgary/AB branch). No index created.",
    }),
  );
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
