/**
 * Read-only pre/post cutover table counts via configured DB env (Railway: run on phoenix-crm-backend).
 * Does not log secrets.
 */
import mysql from "mysql2/promise";

const tables = [
  "organizations",
  "users",
  "memberships",
  "customers",
  "jobs",
  "invoices",
  "quotes",
  "invoice_payments",
  "invoice_documents",
  "portal_magic_links",
];

const phoenixOrgId = "8d5bc762-eb13-43e5-85a1-723477adb47c";

async function main() {
  const configured = {
    db_host: process.env.DB_HOST?.trim(),
    db_port: Number(process.env.DB_PORT || 3306),
    db_user: process.env.DB_USERNAME?.trim(),
    db_name: process.env.DB_NAME?.trim(),
    db_type: process.env.DB_TYPE?.trim() || "mysql",
  };

  if (!configured.db_host || !configured.db_user || !configured.db_name) {
    throw new Error("DB_HOST, DB_USERNAME, and DB_NAME are required.");
  }

  const connection = await mysql.createConnection({
    host: configured.db_host,
    port: configured.db_port,
    user: configured.db_user,
    password: process.env.DB_PASSWORD,
    database: configured.db_name,
  });

  const [[dbRow]] = await connection.query("SELECT DATABASE() AS db, @@hostname AS db_hostname");
  const counts = {};
  for (const table of tables) {
    const [[row]] = await connection.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
    counts[table] = Number(row.c);
  }

  const [[mig]] = await connection.query("SELECT COUNT(*) AS c FROM typeorm_migrations");
  const [[phoenix]] = await connection.query(
    "SELECT id, slug, name FROM organizations WHERE id = ? LIMIT 1",
    [phoenixOrgId],
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: "pre-cutover-readonly",
        configured,
        runtime: {
          connected_database: dbRow.db,
          mysql_hostname: dbRow.db_hostname,
          configured_matches_runtime: configured.db_name === dbRow.db,
        },
        typeorm_migrations_count: Number(mig.c),
        phoenix_organization: phoenix ?? null,
        table_counts: counts,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  await connection.end();
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error.message || error) }));
  process.exit(1);
});
