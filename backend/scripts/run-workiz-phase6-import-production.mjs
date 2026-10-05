/**
 * Controlled Workiz Phase 6 production import against Railway MySQL `wizfield`.
 * Requires WORKIZ_ALLOW_PRODUCTION_MUTATION=1 (set below) and owner authorization.
 */
import { config } from "dotenv";
import { execFileSync, execSync } from "node:child_process";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env") });

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const railwayJson = execSync(`${npx} --yes @railway/cli variables --service MySQL --json`, {
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
});

const mysqlVars = JSON.parse(railwayJson);
const publicUrl = new URL(mysqlVars.MYSQL_PUBLIC_URL);
publicUrl.pathname = "/wizfield";

process.env.DB_HOST = publicUrl.hostname;
process.env.DB_PORT = publicUrl.port || "3306";
process.env.DB_USERNAME = decodeURIComponent(publicUrl.username);
process.env.DB_PASSWORD = decodeURIComponent(publicUrl.password);
process.env.DB_NAME = "wizfield";
process.env.DB_TYPE = "mysql";
process.env.WORKIZ_ALLOW_PRODUCTION_MUTATION = "1";
process.env.WORKIZ_PRODUCTION_BATCH_ID =
  process.env.WORKIZ_PRODUCTION_BATCH_ID?.trim() || "WORKIZ-CALGARY-2026-10-PROD-001";
process.env.WORKIZ_MYSQLDUMP_PATH =
  process.env.WORKIZ_MYSQLDUMP_PATH?.trim()
  || "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe";

execFileSync(
  process.execPath,
  [
    "-r",
    "ts-node/register",
    resolve(process.cwd(), "src/database/workiz-historical-production-orchestrator.ts"),
    "--execute-production-import",
    "--confirm-phoenix-production",
    "--allow-production-mutation",
  ],
  {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  },
);
