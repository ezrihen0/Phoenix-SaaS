/**
 * Apply pending TypeORM migrations on production wizfield (Michael report tables).
 * Requires Railway CLI auth and backend/.env (optional local overrides).
 */
import { config } from "dotenv";
import { execFileSync, execSync } from "node:child_process";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "backend/.env") });

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

execFileSync("npm", ["run", "migration:run"], {
  cwd: resolve(process.cwd(), "backend"),
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

console.log("phoenix-field-report production migrations complete");
