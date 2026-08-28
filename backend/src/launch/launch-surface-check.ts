/**
 * Launch surface check: distinguishes engineering defects from owner blockers.
 * Run: npm run launch:surface:check --workspace backend
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..");
const errors: string[] = [];
const ownerBlockers: string[] = [];

function readRepo(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const terms = readRepo("frontend/app/(marketing)/terms/page.tsx");
const privacy = readRepo("frontend/app/(marketing)/privacy/page.tsx");
const contact = readRepo("frontend/app/(marketing)/contact/page.tsx");
const frontendEnv = readRepo("frontend/.env.example");

if (terms.includes("DRAFT") || terms.includes("LEGAL REVIEW REQUIRED")) {
  ownerBlockers.push("Terms of Service remain draft placeholders — owner/legal approval required before paid acquisition.");
}

if (privacy.includes("DRAFT") || privacy.includes("LEGAL REVIEW REQUIRED")) {
  ownerBlockers.push("Privacy Policy remains draft placeholder — owner/legal approval required before paid acquisition.");
}

if (contact.includes("support@example.com")) {
  ownerBlockers.push("Contact page falls back to support@example.com when NEXT_PUBLIC_SUPPORT_EMAIL is unset.");
}

if (!frontendEnv.includes("NEXT_PUBLIC_SUPPORT_EMAIL=")) {
  errors.push("frontend/.env.example must document NEXT_PUBLIC_SUPPORT_EMAIL.");
}

if (frontendEnv.includes("pk_live_")) {
  errors.push("frontend/.env.example must not contain live Stripe publishable keys.");
}

console.log(
  JSON.stringify(
    {
      ok: errors.length === 0,
      engineering_errors: errors,
      owner_blockers: ownerBlockers,
      paid_acquisition_ready: errors.length === 0 && ownerBlockers.length === 0,
    },
    null,
    2,
  ),
);

if (errors.length) {
  process.exit(1);
}

console.log("launch:surface:check passed (owner blockers may remain until launch activation).");
