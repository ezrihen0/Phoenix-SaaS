import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const messageDir = path.resolve(scriptDir, "..", "messages");
const localeFiles = ["en.ts", "es.ts", "he.ts", "uk.ts", "pl.ts"];

function loadCatalog(fileName) {
  const absolutePath = path.join(messageDir, fileName);
  const source = fs.readFileSync(absolutePath, "utf8");
  const executableSource = source
    .replace(/^const messages = /, "globalThis.__messages = ")
    .replace(/\s+as const;\s*export default messages;\s*$/s, ";");

  const context = { globalThis: {} };
  vm.runInNewContext(executableSource, context, { filename: absolutePath });
  return context.globalThis.__messages;
}

function flattenKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return flattenKeys(nestedValue, nextPrefix);
  });
}

const catalogs = Object.fromEntries(
  localeFiles.map((fileName) => [fileName.replace(/\.ts$/, ""), loadCatalog(fileName)]),
);

const referenceKeys = new Set(flattenKeys(catalogs.en).sort());
const failures = [];

for (const [locale, catalog] of Object.entries(catalogs)) {
  const localeKeys = new Set(flattenKeys(catalog).sort());
  const missing = [...referenceKeys].filter((key) => !localeKeys.has(key));
  const extra = [...localeKeys].filter((key) => !referenceKeys.has(key));

  if (missing.length || extra.length) {
    failures.push({ locale, missing, extra });
  }
}

if (failures.length) {
  for (const failure of failures) {
    if (failure.missing.length) {
      console.error(`[i18n] Missing keys in ${failure.locale}:`);
      for (const key of failure.missing) {
        console.error(`  - ${key}`);
      }
    }

    if (failure.extra.length) {
      console.error(`[i18n] Extra keys in ${failure.locale}:`);
      for (const key of failure.extra) {
        console.error(`  - ${key}`);
      }
    }
  }

  process.exit(1);
}

console.log(`[i18n] Catalog parity OK across ${localeFiles.length} locales.`);
