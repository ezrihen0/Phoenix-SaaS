/** Read-only: identify activation-verify public booking lead(s). */
import mysql from "mysql2/promise";

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";
const VERIFY_EMAIL = "verify@phoenixfireplace.com";
const VERIFY_NAME = "Phoenix Activation Verify";

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [rows] = await connection.query(
    `SELECT l.id, l.organization_id, l.full_name, l.email, l.phone, l.status, l.source, l.created_at
     FROM leads l
     WHERE l.organization_id = ?
       AND (l.email = ? OR l.full_name = ? OR (? <> '' AND l.id = ?))
     ORDER BY l.created_at DESC`,
    [
      PHOENIX_ORG_ID,
      VERIFY_EMAIL,
      VERIFY_NAME,
      process.env.VERIFY_LEAD_ID ?? "",
      process.env.VERIFY_LEAD_ID ?? "",
    ],
  );

  console.log(JSON.stringify({ ok: true, matches: rows }, null, 2));
  await connection.end();
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error.message || error) }));
  process.exit(1);
});
