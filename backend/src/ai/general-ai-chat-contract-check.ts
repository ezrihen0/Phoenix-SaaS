/**
 * general_ai_chat safety contract — static checks (no DB).
 * Run: npm run general-ai-chat:contract-check --workspace backend
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = __dirname;

function read(name: string): string {
  return readFileSync(join(root, name), "utf8");
}

const errors: string[] = [];

const contextService = read("ai-chat-context.service.ts");
const chatService = read("ai-chat.service.ts");
const controller = read("ai.controller.ts");
const engine = read("ai-chat-smart-output.engine.ts");
const types = read("ai-chat.types.ts");

if (!contextService.includes("organizationId.trim()") && !contextService.includes("organization_id")) {
  errors.push("ai-chat-context.service.ts must scope by organizationId");
}

if (!contextService.includes("actorOrgId !== activeOrgId")) {
  errors.push("ai-chat-context.service.ts must verify actor.organization_id matches organizationId");
}

if (!contextService.includes("recentCallBelongsToOrgSqlNamed")) {
  errors.push("ai-chat-context.service.ts must use telephony org-scope SQL for calls");
}

if (chatService.includes("body.organization") || chatService.includes("query.organization")) {
  errors.push("ai-chat.service.ts must not read organization_id from body/query");
}

if (!types.includes("AI_CHAT_ALLOWED_TARGET_HREFS")) {
  errors.push("ai-chat.types.ts must define AI_CHAT_ALLOWED_TARGET_HREFS");
}

if (!engine.includes("isAllowedChatTargetHref")) {
  errors.push("ai-chat-smart-output.engine.ts must validate targetHref via isAllowedChatTargetHref");
}

if (!controller.includes('@Post("chat")')) {
  errors.push("ai.controller.ts must expose POST chat");
}

if (!controller.includes('@Post("chat/:runId/feedback")')) {
  errors.push("ai.controller.ts must expose POST chat/:runId/feedback");
}

const promptBlock = chatService.slice(0, chatService.indexOf("export class AiChatService"));
const forbiddenInPromptSource = ["readFileSync", "readFile(", "DATABASE_URL"];
for (const token of forbiddenInPromptSource) {
  if (promptBlock.includes(token)) {
    errors.push(`ai-chat.service.ts prompt must not reference ${token}`);
  }
}

if (errors.length > 0) {
  console.error("general_ai_chat_contract_fail:");
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log("general_ai_chat_contract_check: ok");
