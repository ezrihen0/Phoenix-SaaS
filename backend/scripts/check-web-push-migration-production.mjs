/**
 * Read-only: confirm Web Push migration on production wizfield (Railway MySQL).
 */
import { execSync } from "node:child_process";
import mysql from "mysql2/promise";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const railwayJson = execSync(`${npx} --yes @railway/cli variables --service MySQL --json`, {
  encoding: "utf8",
});
const publicUrl = new URL(JSON.parse(railwayJson).MYSQL_PUBLIC_URL);

const connection = await mysql.createConnection({
  host: publicUrl.hostname,
  port: publicUrl.port || 3306,
  user: decodeURIComponent(publicUrl.username),
  password: decodeURIComponent(publicUrl.password),
  database: "wizfield",
});

const [migrations] = await connection.query(
  `SELECT id, timestamp, name FROM typeorm_migrations
   WHERE timestamp = 1795000000000 OR name LIKE '%WebPush%'
   ORDER BY timestamp DESC`,
);

const [tables] = await connection.query(`SHOW TABLES LIKE 'web_push_subscriptions'`);

console.log(
  JSON.stringify(
    {
      database: "wizfield",
      webPushMigrationRows: migrations,
      webPushTableExists: tables.length > 0,
    },
    null,
    2,
  ),
);

await connection.end();
