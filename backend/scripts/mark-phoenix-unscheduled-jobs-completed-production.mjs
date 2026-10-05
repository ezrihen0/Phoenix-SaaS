/**
 * Mark all unscheduled Phoenix jobs (scheduled_for IS NULL) as completed.
 *
 * Usage:
 *   node scripts/mark-phoenix-unscheduled-jobs-completed-production.mjs          # dry-run
 *   node scripts/mark-phoenix-unscheduled-jobs-completed-production.mjs --execute
 */
import { execSync } from "node:child_process";
import mysql from "mysql2/promise";

const PHOENIX_ORG_SLUG = "phoenix-fireplace";
const execute = process.argv.includes("--execute");
/** Also set status=completed for unscheduled rows already marked paid (keeps paid_at). */
const includePaid = process.argv.includes("--include-paid");

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const railwayJson = execSync(`${npx} --yes @railway/cli variables --service MySQL --json`, {
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
});
const publicUrl = new URL(JSON.parse(railwayJson).MYSQL_PUBLIC_URL);
publicUrl.pathname = "/wizfield";

const connection = await mysql.createConnection({
  host: publicUrl.hostname,
  port: Number(publicUrl.port || 3306),
  user: decodeURIComponent(publicUrl.username),
  password: decodeURIComponent(publicUrl.password),
  database: "wizfield",
});

try {
  const [orgRows] = await connection.query(
    `SELECT id, name, slug FROM organizations WHERE slug = ? AND is_active = 1 LIMIT 1`,
    [PHOENIX_ORG_SLUG],
  );
  const org = orgRows[0];
  if (!org) {
    throw new Error(`Organization not found for slug ${PHOENIX_ORG_SLUG}`);
  }

  const statusFilterSql = includePaid
    ? `status NOT IN ('completed', 'cancelled')`
    : `status NOT IN ('completed', 'paid', 'cancelled')`;

  const [candidates] = await connection.query(
    `SELECT id, title, status, scheduled_for, completed_at, created_at
     FROM jobs
     WHERE organization_id = ?
       AND scheduled_for IS NULL
       AND ${statusFilterSql}
     ORDER BY created_at ASC`,
    [org.id],
  );

  const summary = {
    mode: execute ? "execute" : "dry-run",
    organizationId: org.id,
    organizationSlug: org.slug,
    candidateCount: candidates.length,
    statusBreakdown: candidates.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {}),
  };

  if (!execute) {
    console.log(
      JSON.stringify(
        {
          ...summary,
          message: "Dry run only. Re-run with --execute to apply updates.",
          sample: candidates.slice(0, 15),
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const [updateResult] = await connection.query(
    `UPDATE jobs
     SET
       status = 'completed',
       completed_at = COALESCE(completed_at, paid_at, requested_at, created_at, UTC_TIMESTAMP(6)),
       on_the_way_at = COALESCE(on_the_way_at, completed_at),
       started_at = COALESCE(started_at, completed_at)
     WHERE organization_id = ?
       AND scheduled_for IS NULL
       AND ${statusFilterSql}`,
    [org.id],
  );

  const remainingFilterSql = includePaid
    ? `status NOT IN ('completed', 'cancelled')`
    : `status NOT IN ('completed', 'paid', 'cancelled')`;

  const [remaining] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM jobs
     WHERE organization_id = ?
       AND scheduled_for IS NULL
       AND ${remainingFilterSql}`,
    [org.id],
  );

  console.log(
    JSON.stringify(
      {
        ...summary,
        rowsUpdated: updateResult.affectedRows,
        remainingUnscheduledNonTerminal: remaining[0]?.count ?? null,
      },
      null,
      2,
    ),
  );
} finally {
  await connection.end();
}
