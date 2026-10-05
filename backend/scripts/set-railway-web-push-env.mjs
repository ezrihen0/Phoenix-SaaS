/**
 * Set Web Push env on phoenix-crm-backend (reads keys from repo-root _vapid_keys_temp.txt).
 * Does not print private key.
 */
import { execSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const keyFile = resolve(repoRoot, "_vapid_keys_temp.txt");
const raw = readFileSync(keyFile, "utf8");
const publicMatch = raw.match(/Public Key:\s*\n([^\n]+)/);
const privateMatch = raw.match(/Private Key:\s*\n([^\n]+)/);

if (!publicMatch?.[1]?.trim() || !privateMatch?.[1]?.trim()) {
  throw new Error("Could not parse VAPID keys from _vapid_keys_temp.txt");
}

const publicKey = publicMatch[1].trim();
const privateKey = privateMatch[1].trim();
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const service = "phoenix-crm-backend";

const sets = [
  ["WEB_PUSH_ENABLED", "true"],
  ["VAPID_PUBLIC_KEY", publicKey],
  ["VAPID_PRIVATE_KEY", privateKey],
  ["VAPID_SUBJECT", "mailto:service@phoenixfireplace.ca"],
];

for (const [key, value] of sets) {
  if (key === "WEB_PUSH_ENABLED") {
    continue;
  }
  execSync(`${npx} --yes @railway/cli variables --set ${key}=${value} --service ${service}`, {
    stdio: "inherit",
    cwd: repoRoot,
    env: process.env,
  });
}

console.log("Railway Web Push variables updated on phoenix-crm-backend (private key not logged).");

try {
  unlinkSync(keyFile);
} catch {
  // ignore
}
