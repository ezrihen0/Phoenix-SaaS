/**
 * Strict portal verification for Eden Zrihen against production wizfield (Railway MySQL).
 */
import { config } from "dotenv";
import { execFileSync, execSync } from "node:child_process";
import { resolve } from "node:path";

/** Phoenix Fireplace operating org on production wizfield (SoT). */
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

process.env.PORTAL_EDEN_SMOKE_STRICT = "1";
process.env.PORTAL_EDEN_SMOKE_BOOTSTRAP = "0";
process.env.PHOENIX_ORG_ID = PHOENIX_ORG_ID;
process.env.PORTAL_EDEN_SMOKE_EMAIL = process.env.PORTAL_EDEN_SMOKE_EMAIL?.trim() || "zrihene1@gmail.com";

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
  // fall through
}

execFileSync(process.execPath, ["-r", "ts-node/register", resolve(process.cwd(), "backend/src/database/portal-eden-customer-smoke.ts")], {
  stdio: "inherit",
  env: process.env,
  cwd: resolve(process.cwd(), "backend"),
});
