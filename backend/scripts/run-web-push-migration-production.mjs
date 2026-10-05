/**
 * Apply pending TypeORM migrations on production wizfield (Web Push subscriptions table).
 * Requires Railway CLI auth. Skips work if migration already recorded.
 */
import { config } from "dotenv";
import { execFileSync, execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
config({ path: resolve(repoRoot, "backend/.env") });

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const railwayJson = execSync(`${npx} --yes @railway/cli variables --service MySQL --json`, {
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
});

const mysqlVars = JSON.parse(railwayJson);
const publicUrl = new URL(mysqlVars.MYSQL_PUBLIC_URL);

const connection = await mysql.createConnection({
  host: publicUrl.hostname,
  port: publicUrl.port || 3306,
  user: decodeURIComponent(publicUrl.username),
  password: decodeURIComponent(publicUrl.password),
  database: "wizfield",
});

const [existing] = await connection.query(
  `SELECT id, timestamp, name FROM typeorm_migrations WHERE timestamp = 1795000000000 OR name LIKE '%WebPush%'`,
);

await connection.end();

if (existing.length > 0) {
  console.log("Web Push migration already applied on production wizfield; skipping migration:run.");
  console.log(JSON.stringify(existing, null, 2));
  process.exit(0);
}

publicUrl.pathname = "/wizfield";

process.env.DB_HOST = publicUrl.hostname;
process.env.DB_PORT = publicUrl.port || "3306";
process.env.DB_USERNAME = decodeURIComponent(publicUrl.username);
process.env.DB_PASSWORD = decodeURIComponent(publicUrl.password);
process.env.DB_NAME = "wizfield";
process.env.DB_TYPE = "mysql";

execFileSync("npm", ["run", "migration:run"], {
  cwd: resolve(repoRoot, "backend"),
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

console.log("Web Push production migration complete");
