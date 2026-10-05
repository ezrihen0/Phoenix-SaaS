/**
 * Apply only TechnicianCustomerFacingIdentity1796200000000 on production wizfield.
 * Does not run TypeORM migration:run (avoids unrelated pending migrations).
 */
import { execSync } from "node:child_process";
import mysql from "mysql2/promise";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const railwayJson = execSync(`${npx} --yes @railway/cli variables --service MySQL --json`, {
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
});
const publicUrl = new URL(JSON.parse(railwayJson).MYSQL_PUBLIC_URL);

const connection = await mysql.createConnection({
  host: publicUrl.hostname,
  port: publicUrl.port || 3306,
  user: decodeURIComponent(publicUrl.username),
  password: decodeURIComponent(publicUrl.password),
  database: "wizfield",
  multipleStatements: false,
});

const [dbRows] = await connection.query("SELECT DATABASE() AS db");
const databaseName = dbRows[0]?.db;
if (databaseName !== "wizfield") {
  throw new Error(`Refusing to migrate database ${databaseName}`);
}

const [existing] = await connection.query(
  `SELECT id, timestamp, name FROM typeorm_migrations
   WHERE timestamp = 1796200000000 OR name = 'TechnicianCustomerFacingIdentity1796200000000'`,
);

const [columnsBefore] = await connection.query(`
  SELECT COLUMN_NAME
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'technicians'
    AND COLUMN_NAME IN ('display_name', 'customer_facing_name', 'customer_facing_title', 'customer_facing_photo_url')
  ORDER BY COLUMN_NAME
`);

if (existing.length > 0) {
  console.log(JSON.stringify({
    skipped: true,
    reason: "migration already recorded",
    database: databaseName,
    existing,
    columnsBefore,
  }, null, 2));
  await connection.end();
  process.exit(0);
}

const columnNames = new Set(columnsBefore.map((row) => row.COLUMN_NAME));
if (!columnNames.has("display_name")) {
  throw new Error("technicians.display_name missing; aborting");
}

await connection.beginTransaction();
try {
  if (!columnNames.has("customer_facing_name")) {
    await connection.query("ALTER TABLE `technicians` ADD COLUMN `customer_facing_name` varchar(80) NULL");
  }
  if (!columnNames.has("customer_facing_title")) {
    await connection.query("ALTER TABLE `technicians` ADD COLUMN `customer_facing_title` varchar(80) NULL");
  }
  if (!columnNames.has("customer_facing_photo_url")) {
    await connection.query("ALTER TABLE `technicians` ADD COLUMN `customer_facing_photo_url` varchar(1024) NULL");
  }

  await connection.query(
    "INSERT INTO typeorm_migrations (timestamp, name) VALUES (?, ?)",
    [1796200000000, "TechnicianCustomerFacingIdentity1796200000000"],
  );

  await connection.commit();
} catch (error) {
  await connection.rollback();
  await connection.end();
  throw error;
}

const [columnsAfter] = await connection.query(`
  SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'technicians'
    AND COLUMN_NAME IN ('display_name', 'customer_facing_name', 'customer_facing_title', 'customer_facing_photo_url')
  ORDER BY COLUMN_NAME
`);
const [ledger] = await connection.query(
  `SELECT id, timestamp, name FROM typeorm_migrations WHERE timestamp = 1796200000000`,
);
const [identityUnchanged] = await connection.query(`
  SELECT
    COUNT(*) AS technician_count,
    SUM(CASE WHEN display_name IS NULL OR display_name = '' THEN 1 ELSE 0 END) AS empty_display_name,
    SUM(CASE WHEN customer_facing_name IS NULL THEN 1 ELSE 0 END) AS null_public_name
  FROM technicians
`);

console.log(JSON.stringify({
  applied: true,
  database: databaseName,
  ledger,
  columnsAfter,
  identityUnchanged,
}, null, 2));

await connection.end();
