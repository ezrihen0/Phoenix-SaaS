/**
 * Repository secret-safety scan (no network, no secret values printed).
 * Run: npm run security:secrets-check --workspace backend
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import {
  findCredentialExposureInEnvExample,
  findCredentialExposureInSource,
  findUnsafeDefaultsInLocalEnv,
  isScannableRepoFile,
  normalizeRepoPath,
} from "./credential-exposure.policy";

const repoRoot = join(__dirname, "..", "..", "..");
const errors: string[] = [];
const warnings: string[] = [];

function listTrackedFiles(): string[] {
  try {
    const output = execSync("git ls-files", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    if (!output) {
      return [];
    }

    return output.split(/\r?\n/).filter(Boolean);
  } catch {
    warnings.push("git ls-files unavailable; falling back to no tracked-file scan.");
    return [];
  }
}

function scanTrackedFile(relativePath: string) {
  const normalizedPath = normalizeRepoPath(relativePath);
  if (normalizedPath === ".env" || normalizedPath.endsWith("/.env")) {
    errors.push(`${normalizedPath}: tracked .env file detected.`);
    return;
  }

  if (!isScannableRepoFile(normalizedPath)) {
    return;
  }

  const fullPath = join(repoRoot, relativePath);
  if (!existsSync(fullPath)) {
    return;
  }

  const source = readFileSync(fullPath, "utf8");

  if (normalizedPath.endsWith(".env.example")) {
    errors.push(...findCredentialExposureInEnvExample(normalizedPath, source));
    return;
  }

  errors.push(...findCredentialExposureInSource(normalizedPath, source));
}

function scanLocalBackendEnv() {
  const relativePath = "backend/.env";
  const fullPath = join(repoRoot, relativePath);
  if (!existsSync(fullPath)) {
    return;
  }

  const source = readFileSync(fullPath, "utf8");
  for (const issue of findUnsafeDefaultsInLocalEnv(source)) {
    errors.push(`${relativePath}: ${issue}`);
  }
}

for (const trackedFile of listTrackedFiles()) {
  scanTrackedFile(trackedFile);
}

scanLocalBackendEnv();

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
