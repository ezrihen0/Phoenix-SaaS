/**
 * Part 3 deployment orchestrator.
 * Run: npm run part3:deployment-check --workspace backend
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

type StepStatus = "PASS" | "FAIL" | "SKIP";
type StepResult = { name: string; status: StepStatus; detail?: string };

const backendRoot = join(__dirname, "..", "..");
const repoRoot = join(backendRoot, "..");
const results: StepResult[] = [];
const skipDb = ["1", "true", "yes", "on"].includes((process.env.PART3_SKIP_DB ?? "").trim().toLowerCase());

function runStep(name: string, command: string, cwd = backendRoot) {
  try {
    execSync(command, {
      cwd,
      stdio: "pipe",
      env: process.env,
    });
    results.push({ name, status: "PASS" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    throw error;
  }
}

function skipStep(name: string, detail: string) {
  results.push({ name, status: "SKIP", detail });
}

try {
  runStep("backend:build", "npm run build", backendRoot);

  if (existsSync(join(repoRoot, "frontend", "package.json"))) {
    runStep("frontend:build", "npm run build", join(repoRoot, "frontend"));
  } else {
    skipStep("frontend:build", "frontend workspace not found");
  }

  runStep("part3:checkpoint", "npm run part3:checkpoint", backendRoot);
  runStep("part2:checkpoint", "npm run part2:checkpoint", backendRoot);
  runStep("auth:operational-access:check", "npm run auth:operational-access:check", backendRoot);
  runStep("billing:plan-catalog:check", "npm run billing:plan-catalog:check", backendRoot);
  runStep("billing:webhook-contract-check", "npm run billing:webhook-contract-check", backendRoot);
  runStep("production-config:check", "npm run production-config:check", backendRoot);
  runStep("security:secrets-check", "npm run security:secrets-check", backendRoot);

  if (skipDb) {
    skipStep("schema:verify", "PART3_SKIP_DB enabled");
    skipStep("billing:lifecycle:smoke", "PART3_SKIP_DB enabled");
    skipStep("billing:activation:smoke", "PART3_SKIP_DB enabled");
    skipStep("billing:multi-org:smoke", "PART3_SKIP_DB enabled");
    skipStep("operational-access:isolation:smoke", "PART3_SKIP_DB enabled");
  } else {
    runStep("schema:verify", "npm run schema:verify", backendRoot);
    runStep("billing:lifecycle:smoke", "npm run billing:lifecycle:smoke", backendRoot);
    runStep("billing:activation:smoke", "npm run billing:activation:smoke", backendRoot);
    runStep("billing:multi-org:smoke", "npm run billing:multi-org:smoke", backendRoot);
    runStep("operational-access:isolation:smoke", "npm run operational-access:isolation:smoke", backendRoot);
  }
} catch {
  // results already recorded
}

const summary = {
  ok: results.every((step) => step.status === "PASS" || step.status === "SKIP"),
  skipDb,
  results,
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) {
  process.exit(1);
}

console.log("part3:deployment-check passed");
