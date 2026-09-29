/**
 * Controlled production backfill: set branch_id on 3 approved Ontario jobs only.
 */
const mysql = require("mysql2/promise");

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";
const ONTARIO_BRANCH_ID = "70ea744e-ce6d-4e5b-9384-a8f377493f27";

const APPROVED_JOB_IDS = [
  "a8995096-bfc3-4f12-a1a0-55c86c8effc6",
  "5c9fd168-3567-4289-b33e-96c9fa665754",
  "9ef0543b-de70-4560-9039-7354273c4efd",
];

async function verifyReadOnly(connection) {
  const [counts] = await connection.query(
    `SELECT
       COUNT(*) AS jobs_total,
       SUM(branch_id = ?) AS ontario_branch_count,
       SUM(branch_id IS NULL) AS null_branch_count,
       SUM(
         CASE WHEN branch_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM branches b WHERE b.id = jobs.branch_id
         ) THEN 1 ELSE 0 END
       ) AS invalid_branch_fk
     FROM jobs
     WHERE organization_id = ?`,
    [ONTARIO_BRANCH_ID, PHOENIX_ORG_ID],
  );

  const [rows] = await connection.query(
    `SELECT id, service_city, service_state_or_region, branch_id
     FROM jobs
     WHERE organization_id = ?
     ORDER BY created_at ASC`,
    [PHOENIX_ORG_ID],
  );

  return { counts: counts[0], rows };
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    await connection.beginTransaction();

    const placeholders = APPROVED_JOB_IDS.map(() => "?").join(", ");
    const [updateResult] = await connection.query(
      `UPDATE jobs
       SET branch_id = ?
       WHERE organization_id = ?
         AND branch_id IS NULL
         AND id IN (${placeholders})
         AND UPPER(TRIM(service_state_or_region)) IN ('ON', 'ONTARIO')`,
      [ONTARIO_BRANCH_ID, PHOENIX_ORG_ID, ...APPROVED_JOB_IDS],
    );

    const affected = updateResult.affectedRows ?? 0;
    if (affected !== 3) {
      await connection.rollback();
      console.log(
        JSON.stringify(
          {
            ok: false,
            phase: "backfill",
            error: "expected exactly 3 rows updated",
            affectedRows: affected,
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }

    await connection.commit();

    const verification = await verifyReadOnly(connection);
    const c = verification.counts;
    const pass =
      Number(c.jobs_total) === 6
      && Number(c.ontario_branch_count) === 3
      && Number(c.null_branch_count) === 3
      && Number(c.invalid_branch_fk) === 0;

    console.log(
      JSON.stringify(
        {
          ok: pass,
          phase: "complete",
          backfill: {
            affectedRows: affected,
            branchId: ONTARIO_BRANCH_ID,
            jobIds: APPROVED_JOB_IDS,
          },
          verification: {
            jobs_total: Number(c.jobs_total),
            ontario_branch_count: Number(c.ontario_branch_count),
            null_branch_count: Number(c.null_branch_count),
            invalid_branch_fk: Number(c.invalid_branch_fk),
            jobs: verification.rows.map((r) => ({
              id: r.id,
              service_city: r.service_city,
              province: r.service_state_or_region,
              branch_id: r.branch_id,
            })),
          },
        },
        null,
        2,
      ),
    );

    process.exit(pass ? 0 : 1);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore
    }
    console.error(error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

void main();
