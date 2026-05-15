/**
 * Phase 2 — assert Operator Copilot service does not import SMS send paths.
 * Run: npm run operator-copilot:contract-check --workspace backend
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = __dirname;
const target = join(root, "ai-operator-copilot.service.ts");
const source = readFileSync(target, "utf8");

const forbidden = ["TxtService", "sendCustomerText", "txt.service", "telnyx-webhook.service"];
const hits = forbidden.filter((token) => source.includes(token));

if (hits.length > 0) {
  console.error("operator_copilot_contract_fail:", hits.join(", "));
  process.exit(1);
}

console.log("operator_copilot_contract_check: ok");
