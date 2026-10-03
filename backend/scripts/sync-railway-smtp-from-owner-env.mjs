/**
 * Sync email transport + SMTP/Cloudflare vars from backend/.env to Railway phoenix-crm-backend (secrets not logged).
 */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "backend/.env") });

const transport = process.env.EMAIL_TRANSPORT?.trim() || "cloudflare_api";

const entries = [
  ["EMAIL_TRANSPORT", transport],
  ["SMTP_HOST", process.env.SMTP_HOST?.trim()],
  ["SMTP_PORT", process.env.SMTP_PORT?.trim()],
  ["SMTP_USER", process.env.SMTP_USER?.trim()],
  ["SMTP_PASS", process.env.SMTP_PASS?.trim()],
  ["SMTP_FROM", process.env.SMTP_FROM?.trim()],
  ["CLOUDFLARE_ACCOUNT_ID", process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || process.env.CF_ACCOUNT_ID?.trim()],
  ["EMAIL_HTTP_TIMEOUT_MS", process.env.EMAIL_HTTP_TIMEOUT_MS?.trim() || "25000"],
].filter(([, value]) => Boolean(value));

const alwaysRequired = ["SMTP_PASS", "SMTP_FROM"];
if (transport === "cloudflare_api") {
  alwaysRequired.push("CLOUDFLARE_ACCOUNT_ID");
}
const missing = alwaysRequired.filter((key) => !entries.find(([k]) => k === key));
if (missing.length > 0) {
  console.error(JSON.stringify({ ok: false, error: `Missing in backend/.env: ${missing.join(", ")}` }));
  process.exit(1);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const synced = [];

for (const [key, value] of entries) {
  const result = spawnSync(
    npx,
    ["--yes", "@railway/cli", "variables", "set", `${key}=${value}`, "--service", "phoenix-crm-backend"],
    { stdio: "pipe", encoding: "utf8", shell: process.platform === "win32" },
  );
  if (result.status !== 0) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `Failed to set ${key}`,
        detail: (result.stderr || result.stdout || "").trim().slice(0, 500),
      }),
    );
    process.exit(1);
  }
  synced.push(key);
}

console.log(JSON.stringify({ ok: true, synced }));
