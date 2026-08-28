/**
 * Part 2 P2.9 — AI guardrails and intelligence fail-safe static contract.
 * Run: npm run ai-intelligence:failsafe-check --workspace backend
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const aiRoot = __dirname;
const repoRoot = join(__dirname, "..", "..", "..");
const errors: string[] = [];

function readAi(name: string): string {
  return readFileSync(join(aiRoot, name), "utf8");
}

function readRepo(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function expectIncludes(source: string, token: string, message: string) {
  if (!source.includes(token)) {
    errors.push(message);
  }
}

function expectExcludes(source: string, token: string, message: string) {
  if (source.includes(token)) {
    errors.push(message);
  }
}
const callsCopilotUi = readRepo("frontend/app/calls/calls-copilot-sms-draft.tsx");
const registry = readAi("ai-action-registry.ts");
const chatService = readAi("ai-chat.service.ts");
const copilotService = readAi("ai-operator-copilot.service.ts");
const auditService = readAi("ai-audit.service.ts");
const brainService = readAi("ai-brain-brief.service.ts");
const controller = readAi("ai.controller.ts");

expectIncludes(registry, 'mutation_policy: "none"', "Brain/missed-call actions must stay read-only.");
expectIncludes(registry, 'mutation_policy: "draft_only"', "Copilot SMS must remain draft-only until guarded send.");
const registryEntries = registry.slice(registry.indexOf("export const AI_ACTION_REGISTRY"));
expectExcludes(registryEntries, 'mutation_policy: "guarded_confirmed",', "No active registry entries may declare autonomous guarded_confirmed mutation.");

expectIncludes(chatService, "You cannot update CRM records, send messages, schedule jobs, change pricing, or take autonomous actions.", "AI chat must remain advisory only.");
expectExcludes(chatService, ".save(", "AI chat service must not persist CRM mutations.");

expectIncludes(copilotService, "executeGuardedSmsSend", "SMS Copilot must expose guarded send entry point.");
expectIncludes(copilotService, "generateSmsDraft", "SMS Copilot must create drafts before send.");
expectExcludes(copilotService, "sendCustomerText", "SMS Copilot must not use legacy autonomous customer SMS shortcuts.");

expectIncludes(auditService, "outcome_key: input.feedback", "AI audit feedback must only update telemetry outcome_key.");
expectExcludes(auditService, "customersRepository", "AI audit must not mutate CRM customers.");
expectExcludes(auditService, "jobsRepository", "AI audit must not mutate CRM jobs.");

expectExcludes(brainService, "customersRepository.save", "AI Brain must not save CRM customers.");
expectExcludes(brainService, "jobsRepository.save", "AI Brain must not save CRM jobs.");
expectExcludes(brainService, "invoicesRepository.save", "AI Brain must not save CRM invoices.");

expectIncludes(controller, "OperationalAccessGuard", "AI staff controller must use OperationalAccessGuard.");
expectIncludes(controller, "No CRM mutation or outbound side effects", "AI chat route must document read-only contract.");

expectIncludes(copilotService, "AI_COPILOT_CUSTOMER_SMS_OUTCOME_TRACKING_ENABLED", "Outcome observation must be feature-flagged.");
expectIncludes(copilotService, "hydrateSmsDraftOutcomeTracking", "Copilot outcome observation must hydrate read-only fields.");

expectIncludes(callsCopilotUi, "/send", "Calls Copilot UI must use guarded send endpoint.");
expectIncludes(callsCopilotUi, "confirmOpen", "Calls Copilot UI must require explicit human confirmation before send.");
expectIncludes(callsCopilotUi, "no automatic send", "Calls Copilot UI must document draft-only generation.");
expectExcludes(callsCopilotUi, "TxtService", "Calls Copilot UI must not import backend TXT send shortcuts.");

if (errors.length) {
  console.error("ai_intelligence_failsafe_fail:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log("ai_intelligence_failsafe_check: ok");
