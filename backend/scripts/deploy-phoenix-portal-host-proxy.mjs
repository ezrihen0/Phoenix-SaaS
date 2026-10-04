/**
 * Deploy Cloudflare Worker that proxies portal.phoenixfireplace.ca → app.phoenixfireplace.ca.
 * Requires CF_API_TOKEN (Workers Scripts Edit + Routes Edit) and CLOUDFLARE_ACCOUNT_ID in backend/.env.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");

config({ path: resolve(repoRoot, "backend/.env") });
config({ path: resolve(repoRoot, ".env") });

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CF_API_TOKEN?.trim() || process.env.CLOUDFLARE_API_TOKEN?.trim();

if (!accountId || !apiToken) {
  throw new Error("Set CLOUDFLARE_ACCOUNT_ID and CF_API_TOKEN in backend/.env");
}

const scriptName = "phoenix-portal-host-proxy";
const scriptPath = resolve(repoRoot, "infra/cloudflare/phoenix-portal-host-proxy.worker.js");
const script = readFileSync(scriptPath, "utf8");
const zoneId = process.env.PHOENIX_CLOUDFLARE_ZONE_ID?.trim() || "136f0953646558ce65d652773bad8d2e";

async function cf(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
  const payload = await response.json();
  if (!payload.success) {
    throw new Error(`${path} failed: ${JSON.stringify(payload.errors ?? payload)}`);
  }
  return payload.result;
}

const form = new FormData();
form.append(
  "metadata",
  JSON.stringify({
    main_module: "phoenix-portal-host-proxy.worker.js",
    compatibility_date: "2026-01-01",
  }),
);
form.append(
  "phoenix-portal-host-proxy.worker.js",
  new Blob([script], { type: "application/javascript+module" }),
  "phoenix-portal-host-proxy.worker.js",
);

await cf(`/accounts/${accountId}/workers/scripts/${scriptName}`, {
  method: "PUT",
  body: form,
});

const routePattern = "portal.phoenixfireplace.ca/*";
const existingRoutes = await cf(`/zones/${zoneId}/workers/routes`);
const prior = existingRoutes.find((route) => route.pattern === routePattern);

if (prior) {
  await cf(`/zones/${zoneId}/workers/routes/${prior.id}`, { method: "DELETE" });
}

await cf(`/zones/${zoneId}/workers/routes`, {
  method: "POST",
  body: JSON.stringify({
    pattern: routePattern,
    script: scriptName,
  }),
});

console.log(JSON.stringify({ ok: true, script: scriptName, route: routePattern }, null, 2));
