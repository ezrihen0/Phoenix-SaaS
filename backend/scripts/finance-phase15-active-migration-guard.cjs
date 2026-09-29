/**
 * Phase 15 pre-flight — fail if Finance-excluded migrations are in the active glob path.
 */
const { readdirSync } = require("node:fs");
const { join } = require("node:path");

const activeDir = join(__dirname, "..", "src", "database", "migrations", "active");
const EXCLUDED_TIMESTAMPS = new Set(["1790000000000"]);
const FINANCE_CEILING = 1791000000000;

const files = readdirSync(activeDir).filter((name) => name.endsWith(".ts") || name.endsWith(".js"));
const violations = [];

for (const file of files) {
  const match = /^(\d{13})-/.exec(file);
  if (!match) continue;
  const ts = match[1];
  if (EXCLUDED_TIMESTAMPS.has(ts)) {
    violations.push({ file, reason: "explicitly excluded from Finance Phase 15 deploy" });
  }
  if (Number(ts) > FINANCE_CEILING) {
    violations.push({ file, reason: `timestamp above Finance ceiling ${FINANCE_CEILING}` });
  }
}

if (violations.length > 0) {
  console.error("finance-phase15-active-migration-guard FAIL");
  for (const row of violations) {
    console.error(`  ${row.file}: ${row.reason}`);
  }
  process.exit(1);
}

console.log("finance-phase15-active-migration-guard PASS");
console.log(JSON.stringify({ activeFinanceCeiling: FINANCE_CEILING, excluded: [...EXCLUDED_TIMESTAMPS] }));
