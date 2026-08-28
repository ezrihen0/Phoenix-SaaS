/**
 * Part 2 P2.10 — Growth Center visible capability alignment (static contract).
 * Run: npm run growth-center:visible-check --workspace backend
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..");
const errors: string[] = [];

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

const sections = readRepo("frontend/components/marketing/marketing-sections.ts");
const foundation = readRepo("frontend/components/marketing/marketing-foundation-workspace.tsx");
const contentStudio = readRepo("frontend/components/marketing/marketing-content-studio.tsx");
const channels = readRepo("frontend/components/marketing/marketing-channels-panel.tsx");
const automations = readRepo("frontend/components/marketing/marketing-automations-panel.tsx");
const campaigns = readRepo("frontend/components/marketing/marketing-campaigns-panel.tsx");
const publishDispatcher = readRepo("backend/src/marketing/marketing-publish-dispatcher.service.ts");
const marketingService = readRepo("backend/src/marketing/marketing.service.ts");

expectExcludes(sections, "full Growth Center stack is live", "Hero copy must not claim the full stack is live.");
expectExcludes(foundation, "Program complete", "Hero eyebrow must not claim program complete.");
expectIncludes(sections, "never auto-publish", "Automations must document draft-only behavior.");
expectIncludes(automations, "auto-create draft", "Automations panel must describe draft-only actions.");
expectIncludes(automations, "suggest-only", "Automations panel must document suggest-only mode.");

expectIncludes(contentStudio, "can_enqueue_publishing", "Content Studio must gate publishing on capability flag.");
expectIncludes(contentStudio, "Enqueue schedule", "Scheduled publish must describe enqueue semantics.");
expectIncludes(contentStudio, "Publishing requires connected OAuth channels", "Approved drafts must explain when publishing is unavailable.");

expectIncludes(channels, "Disconnected", "Channels panel must surface disconnected state.");
expectIncludes(channels, "OAuth paused", "Channels panel must surface OAuth/provider errors.");

expectIncludes(campaigns, "never auto-publishes", "Campaigns panel must deny auto-publish.");
expectIncludes(campaigns, "explicit publish jobs", "Campaigns must reference explicit publish jobs.");

expectIncludes(publishDispatcher, "MARKETING_PUBLISH_DISPATCHER_ENABLED", "Publish dispatcher must respect disable flag.");
expectIncludes(publishDispatcher, "dispatcherEnabled()", "Publish dispatcher must short-circuit when disabled.");

expectIncludes(marketingService, "can_enqueue_publishing", "Marketing foundation must expose honest publish capability.");

if (errors.length) {
  console.error("growth_center_visible_alignment_fail:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log("growth_center_visible_alignment_check: ok");
