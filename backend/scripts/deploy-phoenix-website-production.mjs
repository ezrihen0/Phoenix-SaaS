/**
 * Deploy production marketing + portal website (portal.phoenixfireplace.ca).
 *
 * Vercel project: papoon_fireplacerepair (Phoenix-Website repo root).
 *
 * Auth (pick one):
 * - PHOENIX_WEBSITE_VERCEL_DEPLOY_HOOK_URL — Deploy Hook from Vercel project papoon_fireplacerepair
 * - VERCEL_TOKEN — Vercel CLI deploy from Phoenix-Website checkout (--prod)
 */
import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(process.cwd());
config({ path: resolve(repoRoot, "backend/.env") });
config({ path: resolve(repoRoot, ".env") });

const PORTAL = process.env.PHOENIX_PORTAL_VERIFY_BASE_URL?.trim() || "https://portal.phoenixfireplace.ca";

function websiteRoot() {
  const candidates = [
    process.env.PHOENIX_WEBSITE_ROOT?.trim(),
    resolve(repoRoot, "../Phoenix-Website"),
    resolve(repoRoot, "../phoenix-website"),
    resolve(repoRoot, "apps/website"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && existsSync(resolve(candidate, "package.json"))) {
      return candidate;
    }
  }

  throw new Error("Phoenix-Website checkout not found. Set PHOENIX_WEBSITE_ROOT.");
}

async function triggerDeployHook() {
  const hook = process.env.PHOENIX_WEBSITE_VERCEL_DEPLOY_HOOK_URL?.trim();
  if (!hook) {
    return false;
  }

  const response = await fetch(hook, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Website deploy hook failed (${response.status})`);
  }

  console.log("Triggered Vercel deploy hook for Phoenix website (portal.phoenixfireplace.ca).");
  return true;
}

function triggerVercelCli(root) {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    return false;
  }

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(npx, ["--yes", "vercel", "deploy", "--prod", "--yes"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VERCEL_TOKEN: token },
  });
  console.log("Vercel CLI production deploy finished for Phoenix website.");
  return true;
}

async function verifyPortalRoutes() {
  const checks = [
    [`${PORTAL}/portal/auth/magic?token=probe&entry=invoice`, "Opening your invoice"],
    [`${PORTAL}/portal/invoices/00000000-0000-4000-8000-000000000001`, null],
    [`${PORTAL}/access/probe-token`, null],
  ];

  for (const [url, needle] of checks) {
    const response = await fetch(url, { redirect: "manual" });
    const text = needle ? await response.text().catch(() => "") : "";
    console.log(JSON.stringify({ url, status: response.status, matched: needle ? text.includes(needle) : response.status !== 404 }));
  }
}

async function main() {
  const root = websiteRoot();
  const hooked = await triggerDeployHook();
  const cli = hooked ? false : triggerVercelCli(root);

  if (!hooked && !cli) {
    throw new Error("Set PHOENIX_WEBSITE_VERCEL_DEPLOY_HOOK_URL or VERCEL_TOKEN to deploy the website.");
  }

  await verifyPortalRoutes();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
