import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const policyPath = resolve(__dirname, "../lib/navigation/shell-nav-policy.ts");
const source = readFileSync(policyPath, "utf8");

const callsRoleSetMatch = source.match(/const ROLES_CALLS_VIEW:[\s\S]*?new Set\(\[([\s\S]*?)\]\);/);

if (!callsRoleSetMatch) {
  throw new Error("ROLES_CALLS_VIEW role set was not found.");
}

const actualRoles = [...callsRoleSetMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const expectedVisible = ["owner", "admin", "office_admin", "dispatcher", "csr"];
const expectedHidden = ["technician", "viewer"];

for (const role of expectedVisible) {
  if (!actualRoles.includes(role)) {
    throw new Error(`/calls should be visible for ${role}.`);
  }
}

for (const role of expectedHidden) {
  if (actualRoles.includes(role)) {
    throw new Error(`/calls should remain hidden for ${role}.`);
  }
}

console.log("shell-nav-policy: /calls role affordance check passed");
