/**
 * Phase 2+ — Operator Copilot must not import telephony customer SMS shortcuts.
 * Canonical outbound TXT is `TxtService` / `POST /api/messaging/txt/send` with `messaging.send`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = __dirname;
const target = join(root, "ai-operator-copilot.service.ts");
const source = readFileSync(target, "utf8");

const forbidden = ["sendCustomerText", "TelnyxWebhookService", "telnyx-webhook.service"];
const hits = forbidden.filter((token) => source.includes(token));

if (hits.length > 0) {
  console.error("operator_copilot_contract_fail:", hits.join(", "));
  process.exit(1);
}

if (!source.includes("TxtService")) {
  console.error("operator_copilot_contract_fail: missing canonical TxtService wiring for Phase 3 send handoff.");
  process.exit(1);
}

console.log("operator_copilot_contract_check: ok");
