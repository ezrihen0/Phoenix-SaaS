/**
 * Field knowledge loader safety contract — static checks (no DB).
 * Run: npm run field-knowledge:contract-check --workspace backend
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const aiRoot = join(__dirname, "..");
const errors: string[] = [];

function read(name: string) {
  return readFileSync(join(aiRoot, name), "utf8");
}

const knowledgeService = read("ai-field-knowledge.service.ts");
const copilotService = read("ai-field-copilot.service.ts");
const controller = readFileSync(join(aiRoot, "ai.controller.ts"), "utf8");

if (!knowledgeService.includes("GAS_FIREPLACE_TOPIC_FILES")) {
  errors.push("ai-field-knowledge.service must use GAS_FIREPLACE_TOPIC_FILES allowlist");
}

if (!knowledgeService.includes("ALBERTA_V1_KNOWLEDGE_FILES")) {
  errors.push("ai-field-knowledge.service must use ALBERTA_V1_KNOWLEDGE_FILES allowlist");
}

if (!knowledgeService.includes("FIELD_KNOWLEDGE_ALLOWLISTED_PATHS")) {
  errors.push("ai-field-knowledge.service must use FIELD_KNOWLEDGE_ALLOWLISTED_PATHS for reads");
}

if (!knowledgeService.includes("selectAlbertaV1KnowledgePacks")) {
  errors.push("ai-field-knowledge.service must use selectAlbertaV1KnowledgePacks for jurisdiction routing");
}

if (!knowledgeService.includes("field_knowledge_path_forbidden")) {
  errors.push("ai-field-knowledge.service must reject non-allowlisted paths");
}

if (knowledgeService.includes("readFile(") && !knowledgeService.includes("readFile(absolutePath")) {
  errors.push("ai-field-knowledge.service must only read allowlisted absolute paths");
}

if (copilotService.includes("readFileSync") || copilotService.includes("readFile(")) {
  errors.push("ai-field-copilot.service must not read arbitrary files");
}

if (!controller.includes('@Post("field-copilot")')) {
  errors.push("ai.controller must expose POST field-copilot");
}

if (copilotService.includes("body.organization") || copilotService.includes("query.organization")) {
  errors.push("field copilot must not read organization_id from client body/query");
}

const promptSection = copilotService.slice(0, copilotService.indexOf("export class AiFieldCopilotService"));
if (!promptSection.includes("Do not instruct unlicensed gas work")) {
  errors.push("field copilot system prompt must forbid unlicensed gas work");
}

if (errors.length > 0) {
  console.error("field_knowledge_contract_fail:");
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log("field-knowledge-contract-check: ok");
