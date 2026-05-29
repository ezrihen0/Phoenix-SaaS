/**
 * Strict structural check for the Field Copilot runtime safety QA appendix.
 * This check is local-only and does not call AI, APIs, or runtime tools.
 */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

type QaRow = {
  lineNumber: number;
  id: string;
  trade: string;
  surface: string;
  prompt: string;
  expected: string;
  forbidden: string;
  escalation: string;
  severity: string;
};

const REPO_ROOT = resolve(__dirname, "../../../..");
const APPENDIX_PATH = join(
  REPO_ROOT,
  "docs",
  "field-knowledge",
  "runtime",
  "field-copilot-runtime-safety-and-voice-qa-appendix-v1.md",
);
const GENERATOR_PATH = join(
  REPO_ROOT,
  "docs",
  "field-knowledge",
  "runtime",
  "_generate-qa-appendix.mjs",
);

const REQUIRED_COLUMNS = [
  "ID",
  "Trade",
  "Surface",
  "Prompt",
  "Expected",
  "Forbidden",
  "Escalation",
  "Severity",
] as const;

const TRADES = ["chimney", "gas-fireplace", "garage-door", "doors-windows"] as const;
const TRADE_CODES: Record<string, string> = {
  CH: "chimney",
  GF: "gas-fireplace",
  GD: "garage-door",
  DW: "doors-windows",
};
const SEVERITIES = new Set(["S0", "S1", "S2", "S3"]);

const VOICE_SUFFIXES = [
  ...suffixRange("B"),
  ...suffixRange("M"),
  ...suffixRange("E"),
  ...suffixRange("T"),
];
const TEXT_SUFFIXES = [
  ...suffixRange("P"),
  ...suffixRange("J"),
  ...suffixRange("R"),
  ...suffixRange("D"),
];

function suffixRange(prefix: string): string[] {
  return Array.from({ length: 10 }, (_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`);
}

function splitMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseRows(markdown: string, failures: string[]): QaRow[] {
  const rows: QaRow[] = [];
  const seenIds = new Set<string>();
  const lines = markdown.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!/^\|\s+(?:VOICE|TEXT)-/.test(line)) {
      return;
    }

    const cells = splitMarkdownRow(line);
    if (cells.length !== REQUIRED_COLUMNS.length) {
      failures.push(`Line ${index + 1}: expected ${REQUIRED_COLUMNS.length} columns, found ${cells.length}.`);
      return;
    }

    const [id, trade, surface, prompt, expected, forbidden, escalation, severity] = cells;
    if (seenIds.has(id)) {
      failures.push(`Line ${index + 1}: duplicate prompt ID ${id}.`);
    }
    seenIds.add(id);

    rows.push({
      lineNumber: index + 1,
      id,
      trade,
      surface,
      prompt,
      expected,
      forbidden,
      escalation,
      severity,
    });
  });

  return rows;
}

function assertEqual(actual: unknown, expected: unknown, label: string, failures: string[]): void {
  if (actual !== expected) {
    failures.push(`${label}: expected ${String(expected)}, found ${String(actual)}.`);
  }
}

function assertSetExact(
  actual: Iterable<string>,
  expected: readonly string[],
  label: string,
  failures: string[],
): void {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = [...expectedSet].filter((value) => !actualSet.has(value));
  const extra = [...actualSet].filter((value) => !expectedSet.has(value));

  if (missing.length > 0 || extra.length > 0) {
    failures.push(
      `${label}: missing [${missing.join(", ") || "none"}], extra [${extra.join(", ") || "none"}].`,
    );
  }
}

function idParts(id: string): { prefix: "VOICE" | "TEXT"; code: string; suffix: string } | null {
  const match = /^(VOICE|TEXT)-(CH|GF|GD|DW)-([A-Z]\d{2})$/.exec(id);
  if (!match) {
    return null;
  }

  return {
    prefix: match[1] as "VOICE" | "TEXT",
    code: match[2]!,
    suffix: match[3]!,
  };
}

function isClearlyLowRiskEmergencyTrap(row: QaRow): boolean {
  const text = `${row.expected} ${row.severity}`.toLowerCase();
  return row.severity === "S3"
    || /\bnon[-\s]?emergency\b/.test(text)
    || /\blow[-\s]?risk\b/.test(text)
    || /\bhairline\b/.test(text)
    || /\bsmall crack\b/.test(text)
    || /\bminor\b/.test(text);
}

function checkHeaders(markdown: string, failures: string[]): void {
  const header = `| ${REQUIRED_COLUMNS.join(" | ")} |`;
  const headerLines = markdown
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("| ID |"));

  if (headerLines.length === 0) {
    failures.push("Required table header was not found.");
    return;
  }

  headerLines.forEach((line) => {
    if (line.trim() !== header) {
      failures.push(`Unexpected table header: ${line.trim()}`);
    }
  });
}

function checkAppendixStructure(markdown: string, rows: QaRow[], failures: string[]): void {
  if (!markdown.includes("## QA Design Note")) {
    failures.push("QA Design Note section was not found.");
  }

  checkHeaders(markdown, failures);
  assertEqual(rows.length, 320, "Total prompts", failures);

  for (const row of rows) {
    const parts = idParts(row.id);
    if (!parts) {
      failures.push(`Line ${row.lineNumber}: invalid prompt ID ${row.id}.`);
      continue;
    }

    const expectedTrade = TRADE_CODES[parts.code];
    if (row.trade !== expectedTrade) {
      failures.push(`Line ${row.lineNumber}: ${row.id} trade should be ${expectedTrade}, found ${row.trade}.`);
    }

    if (!SEVERITIES.has(row.severity)) {
      failures.push(`Line ${row.lineNumber}: invalid severity ${row.severity}.`);
    }

    if (row.severity === "S0" && row.forbidden.trim() === "") {
      failures.push(`Line ${row.lineNumber}: S0 prompt ${row.id} has no forbidden behavior.`);
    }

    if (parts.prefix === "VOICE" && row.surface !== "ai_voice_phone") {
      failures.push(`Line ${row.lineNumber}: voice prompt ${row.id} must use ai_voice_phone surface.`);
    }

    if (parts.prefix === "VOICE" && /^E\d{2}$/.test(parts.suffix)) {
      const escalation = row.escalation.toLowerCase();
      if (escalation !== "yes" && !isClearlyLowRiskEmergencyTrap(row)) {
        failures.push(
          `Line ${row.lineNumber}: ${row.id} has Escalation=${row.escalation}, but is not clearly documented as low-risk/non-emergency.`,
        );
      }
    }
  }

  assertSetExact(new Set(rows.map((row) => row.trade)), TRADES, "Trades", failures);

  for (const trade of TRADES) {
    const tradeRows = rows.filter((row) => row.trade === trade);
    const voiceRows = tradeRows.filter((row) => row.id.startsWith("VOICE-"));
    const textRows = tradeRows.filter((row) => row.id.startsWith("TEXT-"));

    assertEqual(tradeRows.length, 80, `${trade} prompt count`, failures);
    assertEqual(voiceRows.length, 40, `${trade} voice prompt count`, failures);
    assertEqual(textRows.length, 40, `${trade} text prompt count`, failures);

    assertSetExact(
      voiceRows.map((row) => idParts(row.id)?.suffix ?? ""),
      VOICE_SUFFIXES,
      `${trade} voice suffixes`,
      failures,
    );
    assertSetExact(
      textRows.map((row) => idParts(row.id)?.suffix ?? ""),
      TEXT_SUFFIXES,
      `${trade} text suffixes`,
      failures,
    );
  }
}

function checkGeneratorDrift(markdown: string, failures: string[]): void {
  if (!existsSync(GENERATOR_PATH)) {
    failures.push("QA appendix generator file was not found.");
    return;
  }

  const tempDir = mkdtempSync(join(tmpdir(), "wizfield-qa-appendix-"));
  const tempGeneratorPath = join(tempDir, "_generate-qa-appendix.mjs");
  const tempAppendixPath = join(tempDir, "field-copilot-runtime-safety-and-voice-qa-appendix-v1.md");

  try {
    copyFileSync(GENERATOR_PATH, tempGeneratorPath);
    const result = spawnSync(process.execPath, [tempGeneratorPath], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });

    if (result.status !== 0) {
      failures.push(
        `QA appendix generator failed in temp mode: ${(result.stderr || result.stdout || "").trim()}`,
      );
      return;
    }

    if (!existsSync(tempAppendixPath)) {
      failures.push("QA appendix generator did not produce temp appendix output.");
      return;
    }

    const generated = readFileSync(tempAppendixPath, "utf8");
    if (generated !== markdown) {
      failures.push("QA appendix generator output differs from the checked-in appendix.");
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function summarize(rows: QaRow[]): string[] {
  const lines = [`total=${rows.length}`];
  for (const trade of TRADES) {
    const tradeRows = rows.filter((row) => row.trade === trade);
    lines.push(
      `${trade}: total=${tradeRows.length}, voice=${tradeRows.filter((row) => row.id.startsWith("VOICE-")).length}, text=${tradeRows.filter((row) => row.id.startsWith("TEXT-")).length}`,
    );
  }
  return lines;
}

function main(): void {
  const failures: string[] = [];

  if (!existsSync(APPENDIX_PATH)) {
    failures.push("QA appendix file was not found.");
    printResult([], failures);
    return;
  }

  const markdown = readFileSync(APPENDIX_PATH, "utf8");
  const rows = parseRows(markdown, failures);

  checkAppendixStructure(markdown, rows, failures);
  checkGeneratorDrift(markdown, failures);
  printResult(rows, failures);
}

function printResult(rows: QaRow[], failures: string[]): void {
  for (const line of summarize(rows)) {
    console.log(line);
  }

  if (failures.length > 0) {
    console.error("field-knowledge:qa-appendix-check failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log("field-knowledge:qa-appendix-check: ok");
}

main();
