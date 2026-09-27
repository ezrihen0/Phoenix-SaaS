import { execSync } from "node:child_process";
import { join } from "node:path";

import type { SmokeOutcome } from "./estimate-invoice-conversion-smoke.harness";

type SuiteCase = {
  name: string;
  script: string;
};

type SuiteResult = {
  name: string;
  outcome: SmokeOutcome;
  database: string;
  detail?: unknown;
};

const backendRoot = join(__dirname, "..", "..");

const CASES: SuiteCase[] = [
  { name: "integration", script: "estimate-invoice-conversion:smoke" },
  { name: "pricebook-drift", script: "estimate-invoice-conversion:pricebook-drift:smoke" },
];

function parseSmokeJson(output: string) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not parse smoke JSON output.");
  }

  return JSON.parse(output.slice(start, end + 1)) as {
    outcome?: SmokeOutcome;
    ok?: boolean;
    database?: string;
    errors?: string[];
    results?: Array<{ name: string; status: string; detail?: unknown }>;
  };
}

function runCase(testCase: SuiteCase): SuiteResult {
  try {
    const output = execSync(`npm run ${testCase.script}`, {
      cwd: backendRoot,
      encoding: "utf8",
      env: process.env,
    });
    const parsed = parseSmokeJson(output);
    const outcome: SmokeOutcome =
      parsed.outcome ?? (parsed.ok ? "PASS" : output.includes('"status": "SKIP"') ? "SKIP" : "FAIL");

    return {
      name: testCase.name,
      outcome,
      database: parsed.database ?? "unknown",
      detail: parsed.errors?.length ? parsed.errors : undefined,
    };
  } catch (error) {
    const execErr = error as { stdout?: string; stderr?: string; status?: number };
    const combined = `${execErr.stdout ?? ""}${execErr.stderr ?? ""}`;
    try {
      const parsed = parseSmokeJson(combined);
      const outcome: SmokeOutcome = parsed.outcome ?? "FAIL";
      return {
        name: testCase.name,
        outcome,
        database: parsed.database ?? "unknown",
        detail: parsed.errors?.length ? parsed.errors : combined.trim(),
      };
    } catch {
      return {
        name: testCase.name,
        outcome: "FAIL",
        database: "unknown",
        detail: combined.trim() || String(error),
      };
    }
  }
}

function summarize(results: SuiteResult[]) {
  if (results.some((result) => result.outcome === "FAIL")) {
    return "FAIL" as const;
  }
  if (results.some((result) => result.outcome === "SKIP")) {
    return "SKIP" as const;
  }
  return "PASS" as const;
}

function main() {
  const results = CASES.map(runCase);
  const suiteOutcome = summarize(results);

  const report = {
    suite: "estimate-invoice-conversion",
    configuredDatabaseMode: process.env.FINANCE_SMOKE_USE_CONFIGURED_DATABASE === "true"
      || process.env.FINANCE_SMOKE_USE_CONFIGURED_DATABASE === "1",
    outcome: suiteOutcome,
    results,
  };

  console.log(JSON.stringify(report, null, 2));

  if (suiteOutcome !== "PASS") {
    process.exitCode = 1;
  }
}

main();
