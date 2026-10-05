/**
 * Mark Michael report imported jobs completed and clear schedule fields (Phoenix production).
 */
import { execSync } from "node:child_process";
import mysql from "mysql2/promise";

const BATCH_ID = "da410a3f-658b-4c8a-8c9f-7baba6b06da6";
const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";

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
  const [before] = await connection.query(
    `SELECT j.id, j.title, j.status, j.scheduled_for, j.completed_at
     FROM jobs j
     INNER JOIN phoenix_field_historical_report_entries e ON e.job_id = j.id
     WHERE e.batch_id = ? AND e.organization_id = ? AND e.status = 'imported'
     ORDER BY e.sort_order ASC`,
    [BATCH_ID, PHOENIX_ORG_ID],
  );

  const [updateResult] = await connection.query(
    `UPDATE jobs j
     INNER JOIN phoenix_field_historical_report_entries e ON e.job_id = j.id
     SET
       j.completed_at = COALESCE(j.completed_at, j.scheduled_for, j.requested_at, UTC_TIMESTAMP(6)),
       j.scheduled_for = NULL,
       j.scheduled_window = NULL
     WHERE e.batch_id = ? AND e.organization_id = ? AND e.status = 'imported'
       AND j.organization_id = ?`,
    [BATCH_ID, PHOENIX_ORG_ID, PHOENIX_ORG_ID],
  );

  await connection.query(
    `UPDATE jobs j
     INNER JOIN phoenix_field_historical_report_entries e ON e.job_id = j.id
     INNER JOIN invoices i ON i.job_id = j.id AND i.organization_id = j.organization_id
     SET j.status = 'paid'
     WHERE e.batch_id = ? AND e.organization_id = ? AND e.status = 'imported'
       AND j.organization_id = ?
       AND j.scheduled_for IS NULL
       AND EXISTS (
         SELECT 1 FROM invoice_payments p
         WHERE p.invoice_id = i.id AND p.organization_id = i.organization_id
       )`,
    [BATCH_ID, PHOENIX_ORG_ID, PHOENIX_ORG_ID],
  );

  await connection.query(
    `UPDATE jobs j
     INNER JOIN phoenix_field_historical_report_entries e ON e.job_id = j.id
     SET j.status = 'completed'
     WHERE e.batch_id = ? AND e.organization_id = ? AND e.status = 'imported'
       AND j.organization_id = ?
       AND j.scheduled_for IS NULL
       AND j.status NOT IN ('paid', 'cancelled')`,
    [BATCH_ID, PHOENIX_ORG_ID, PHOENIX_ORG_ID],
  );

  const [after] = await connection.query(
    `SELECT j.id, j.title, j.status, j.scheduled_for, j.completed_at
     FROM jobs j
     INNER JOIN phoenix_field_historical_report_entries e ON e.job_id = j.id
     WHERE e.batch_id = ? AND e.organization_id = ? AND e.status = 'imported'
     ORDER BY e.sort_order ASC`,
    [BATCH_ID, PHOENIX_ORG_ID],
  );

  console.log(
    JSON.stringify(
      {
        batchId: BATCH_ID,
        rowsMatched: updateResult.affectedRows,
        before,
        after,
      },
      null,
      2,
    ),
  );
} finally {
  await connection.end();
}
