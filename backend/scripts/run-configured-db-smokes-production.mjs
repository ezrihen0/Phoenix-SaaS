/**
 * Run configured-database isolation smokes against production wizfield (seed + cleanup).
 */
import { config } from "dotenv";
import { execFileSync, execSync } from "node:child_process";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "backend/.env") });

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const railwayJson = execSync(`${npx} --yes @railway/cli variables --service MySQL --json`, { encoding: "utf8" });
const mysqlVars = JSON.parse(railwayJson);
const publicUrl = new URL(mysqlVars.MYSQL_PUBLIC_URL);
publicUrl.pathname = "/wizfield";

process.env.DB_HOST = publicUrl.hostname;
process.env.DB_PORT = publicUrl.port || "3306";
process.env.DB_USERNAME = decodeURIComponent(publicUrl.username);
process.env.DB_PASSWORD = decodeURIComponent(publicUrl.password);
process.env.DB_NAME = "wizfield";
process.env.DB_TYPE = "mysql";
process.env.FINANCE_SMOKE_USE_CONFIGURED_DATABASE = "true";

const scripts = [
  "document-snapshot:isolation:smoke",
  "portal:isolation:smoke",
  "public-booking:isolation:smoke",
  "operational-access:isolation:smoke",
];

for (const script of scripts) {
  execFileSync(npx, ["run", script, "--workspace", "backend"], {
    stdio: "inherit",
    env: process.env,
    cwd: resolve(process.cwd()),
  });
}

console.log(JSON.stringify({ ok: true, scripts }, null, 2));
