/**
 * 1) Dispose known test customer email collision
 * 2) Full portal identity backfill (production wizfield)
 * 3) Strict Eden production smoke
 */
import { config } from "dotenv";
import { execFileSync, execSync } from "node:child_process";
import { resolve } from "node:path";

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";

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
process.env.WORKIZ_ALLOW_PRODUCTION_MUTATION = "1";
process.env.PORTAL_EDEN_SMOKE_STRICT = "1";
process.env.PORTAL_EDEN_SMOKE_BOOTSTRAP = "0";
process.env.PHOENIX_ORG_ID = PHOENIX_ORG_ID;

try {
  const backendJson = execSync(`${npx} --yes @railway/cli variables --service phoenix-crm-backend --json`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const backendVars = JSON.parse(backendJson);
  if (backendVars.PORTAL_OTP_PEPPER?.trim()) {
    process.env.PORTAL_OTP_PEPPER = backendVars.PORTAL_OTP_PEPPER.trim();
  }
  if (backendVars.PORTAL_SESSION_SECRET?.trim()) {
    process.env.PORTAL_SESSION_SECRET = backendVars.PORTAL_SESSION_SECRET.trim();
  }
} catch {
  // SmokeEnvConfig falls back to PORTAL_SESSION_SECRET from backend/.env when set.
}

const backendRoot = resolve(process.cwd(), "backend");
const nodeTs = (script) =>
  execFileSync(process.execPath, ["-r", "ts-node/register", script], {
    stdio: "inherit",
    env: process.env,
    cwd: backendRoot,
  });

console.log("\n=== Step 1: dispose test customer email collision ===\n");
nodeTs(resolve(backendRoot, "src/database/portal-dispose-phoenix-test-customer.ts"));

console.log("\n=== Step 2: portal identity backfill (all customers) ===\n");
nodeTs(resolve(backendRoot, "src/customer-portal/portal-identity-backfill.ts"));

console.log("\n=== Step 3: strict Eden production smoke ===\n");
nodeTs(resolve(backendRoot, "src/database/portal-eden-customer-smoke.ts"));

console.log(JSON.stringify({ ok: true, closeout: "portal-eden-production" }, null, 2));
