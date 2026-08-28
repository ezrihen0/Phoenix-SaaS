/**
 * Part 2 P2.11 — Language Store scoped add-on contract (static, no DB).
 * Run: npm run language-store:part2-contract-check --workspace backend
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = __dirname;
const errors: string[] = [];

function read(name: string): string {
  return readFileSync(join(root, name), "utf8");
}

function expectIncludes(source: string, token: string, message: string) {
  if (!source.includes(token)) {
    errors.push(message);
  }
}

const translationService = read("customer-output-translation.service.ts");
const languageController = read("language-store.controller.ts");
const translationController = read("customer-output-translation.controller.ts");

expectIncludes(translationService, "assertTranslationGenerationAllowed", "Language Store generation must enforce entitlement gates.");
expectIncludes(translationService, "translation_record_already_finalized", "Finalized translation records must be immutable.");
expectIncludes(translationService, "translation_provider_not_configured", "Missing Gemini/provider must surface translation_provider_not_configured.");
expectIncludes(translationService, "translation_usage_exhausted", "Entitlement exhaustion must be explicit.");

expectIncludes(languageController, "OperationalAccessGuard", "Language Store controller must use OperationalAccessGuard.");
expectIncludes(translationController, "OperationalAccessGuard", "Customer output translation controller must use OperationalAccessGuard.");

if (errors.length) {
  console.error("language_store_part2_contract_fail:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log("language_store_part2_contract_check: ok");
