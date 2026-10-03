/**
 * Run invoice-customer-delivery closeout against production wizfield (readonly send + SMTP).
 * Uses owner backend/.env for SMTP; DB URL from Railway MySQL public proxy (database wizfield).
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
process.env.CUSTOMER_PORTAL_BASE_URL =
  process.env.CUSTOMER_PORTAL_BASE_URL?.trim() || "https://portal.phoenixfireplace.ca";
process.env.INVOICE_DELIVERY_CLOSEOUT_TO =
  process.env.INVOICE_DELIVERY_CLOSEOUT_TO?.trim()
  || process.env.PHOENIX_OWNER_EMAIL?.trim()
  || "";

execFileSync(
  process.execPath,
  [
    "-r",
    "ts-node/register",
    resolve(process.cwd(), "backend/src/database/invoice-customer-delivery-closeout.ts"),
  ],
  {
    stdio: "inherit",
    env: process.env,
    cwd: resolve(process.cwd(), "backend"),
  },
);
