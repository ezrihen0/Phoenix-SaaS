/**
 * Repository secret-safety scan (no network, no secret values printed).
 * Run: npm run security:secrets-check --workspace backend
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..");
const errors: string[] = [];
const warnings: string[] = [];

const ignoredDirectories = new Set([
  ".git",
  ".next",
  "node_modules",
  "dist",
  "coverage",
  "uploads",
  ".cursor",
]);

const ignoredFileNames = new Set([
  "package-lock.json",
]);

const secretPatterns: Array<{ code: string; pattern: RegExp; message: string; severity: "error" | "warning" }> = [
  {
    code: "stripe_secret_key",
    pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{8,}\b/,
    message: "Stripe secret key pattern detected in committed source.",
    severity: "error",
  },
  {
    code: "stripe_webhook_secret",
    pattern: /\bwhsec_[A-Za-z0-9]{8,}\b/,
    message: "Stripe webhook secret pattern detected in committed source.",
    severity: "error",
  },
  {
    code: "private_key_block",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    message: "Private key block detected in committed source.",
    severity: "error",
  },
  {
    code: "jwt_like_secret",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    message: "JWT-like token detected in committed source.",
    severity: "warning",
  },
];

const unsafeExamplePatterns: Array<{ file: string; pattern: RegExp; message: string }> = [
  {
    file: "backend/.env.example",
    pattern: /\bSTRIPE_SECRET_KEY=sk_(?:live|test)_/,
    message: "backend/.env.example must not contain a concrete Stripe secret key value.",
  },
  {
    file: "backend/.env.example",
    pattern: /\bSTRIPE_WEBHOOK_SECRET=whsec_/,
    message: "backend/.env.example must not contain a concrete Stripe webhook secret value.",
  },
  {
    file: "frontend/.env.example",
    pattern: /\bNEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_(?:live|test)_/,
    message: "frontend/.env.example should avoid concrete live/test publishable keys unless intentionally documented.",
  },
];

function shouldScanFile(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (ignoredFileNames.has(normalized.split("/").pop() ?? "")) {
    return false;
  }
  if (normalized.endsWith(".png") || normalized.endsWith(".jpg") || normalized.endsWith(".jpeg") || normalized.endsWith(".webp")) {
    return false;
  }
  if (normalized.endsWith(".pdf") || normalized.endsWith(".zip") || normalized.endsWith(".woff") || normalized.endsWith(".woff2")) {
    return false;
  }
  return (
    normalized.endsWith(".ts")
    || normalized.endsWith(".tsx")
    || normalized.endsWith(".js")
    || normalized.endsWith(".jsx")
    || normalized.endsWith(".json")
    || normalized.endsWith(".md")
    || normalized.endsWith(".env.example")
    || normalized.endsWith(".yml")
    || normalized.endsWith(".yaml")
  );
}

function walk(directory: string, visitor: (filePath: string) => void) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) {
      continue;
    }

    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, visitor);
      continue;
    }

    const relativePath = relative(repoRoot, fullPath);
    if (shouldScanFile(relativePath)) {
      visitor(fullPath);
    }
  }
}

function scanFile(fullPath: string) {
  const relativePath = relative(repoRoot, fullPath).replace(/\\/g, "/");
  if (relativePath === ".env" || relativePath.endsWith("/.env")) {
    errors.push(`${relativePath}: committed .env file detected.`);
    return;
  }

  const source = readFileSync(fullPath, "utf8");
  for (const rule of secretPatterns) {
    if (rule.pattern.test(source)) {
      const target = rule.severity === "error" ? errors : warnings;
      target.push(`${relativePath}: ${rule.message}`);
    }
  }
}

for (const rule of unsafeExamplePatterns) {
  const fullPath = join(repoRoot, rule.file);
  try {
    const source = readFileSync(fullPath, "utf8");
    if (rule.pattern.test(source)) {
      warnings.push(`${rule.file}: ${rule.message}`);
    }
  } catch {
    warnings.push(`${rule.file}: example env file missing for safety review.`);
  }
}

walk(repoRoot, scanFile);

if (warnings.length) {
  console.warn("security:secrets-check warnings:");
  for (const warning of warnings) {
    console.warn(`  - ${warning}`);
  }
}

if (errors.length) {
  console.error("security:secrets-check failed:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log("security:secrets-check passed");
