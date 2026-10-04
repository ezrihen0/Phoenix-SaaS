/**
 * Deploy production staff UI for https://app.phoenixfireplace.ca only.
 *
 * Does NOT deploy https://app.wizfield.com (rollback surface stays unchanged).
 * Does NOT redeploy Railway by default (shared API at api.wizfield.com is optional via --backend).
 *
 * Auth (pick one):
 * - PHOENIX_APP_VERCEL_DEPLOY_HOOK_URL — Deploy Hook from Vercel project pheonix-crm-frontend-6bxw
 * - VERCEL_TOKEN — Vercel CLI deploy from frontend/ (--prod)
 */
import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = resolve(process.cwd());
config({ path: resolve(repoRoot, "backend/.env") });
config({ path: resolve(repoRoot, ".env") });

const PHOENIX_APP = "https://app.phoenixfireplace.ca";
const VERCEL_PROJECT = process.env.PHOENIX_VERCEL_PROJECT_NAME?.trim() || "pheonix-crm-frontend-6bxw";
const includeBackend = process.argv.includes("--backend");

async function verifyPhoenixAppRoute(pathname) {
  const url = `${PHOENIX_APP}${pathname}`;
  const response = await fetch(url, { redirect: "manual" });
  return { url, status: response.status };
}

async function triggerDeployHook() {
  const hook = process.env.PHOENIX_APP_VERCEL_DEPLOY_HOOK_URL?.trim();
  if (!hook) {
    return false;
  }

  const response = await fetch(hook, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Deploy hook failed (${response.status})`);
  }

  console.log("Triggered Vercel deploy hook for Phoenix app (app.phoenixfireplace.ca).");
  return true;
}

function triggerVercelCli() {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    return false;
  }

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(
    npx,
    [
      "--yes",
      "vercel",
      "deploy",
      "--prod",
      "--yes",
      "--cwd",
      resolve(repoRoot, "frontend"),
      "--token",
      token,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        VERCEL_ORG_ID: process.env.VERCEL_ORG_ID,
        VERCEL_PROJECT_ID: process.env.PHOENIX_VERCEL_PROJECT_ID ?? process.env.VERCEL_PROJECT_ID,
      },
    },
  );

  console.log(`Vercel production deploy submitted for project ${VERCEL_PROJECT}.`);
  return true;
}

function triggerRailwayBackend() {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(npx, ["--yes", "@railway/cli", "redeploy", "--service", "phoenix-crm-backend", "-y"], {
    stdio: "inherit",
    cwd: repoRoot,
  });
  console.log("Railway redeploy triggered for phoenix-crm-backend (shared API).");
}

async function main() {
  console.log("Phoenix-only deploy scope:");
  console.log(`  Staff app: ${PHOENIX_APP}`);
  console.log("  Skipping: app.wizfield.com frontend");

  if (includeBackend) {
    triggerRailwayBackend();
  }

  const deployed = (await triggerDeployHook()) || triggerVercelCli();
  if (!deployed) {
    console.error(
      "No Phoenix Vercel credentials. Set PHOENIX_APP_VERCEL_DEPLOY_HOOK_URL or VERCEL_TOKEN in backend/.env,",
    );
    console.error("then redeploy from Vercel dashboard → project pheonix-crm-frontend-6bxw → Deploy latest SaaS-master.");
    process.exit(1);
  }

  console.log("Waiting 90s for Vercel build…");
  await new Promise((resolveWait) => setTimeout(resolveWait, 90_000));

  const probe = await verifyPhoenixAppRoute("/michaelreport");
  console.log(`Probe ${probe.url} → HTTP ${probe.status}`);
  if (probe.status === 404) {
    console.warn("Route still 404 — build may be in progress or project root/env mismatch on Vercel.");
    process.exit(2);
  }

  console.log("Phoenix app deploy verification passed (route is live or auth-redirecting, not 404).");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
