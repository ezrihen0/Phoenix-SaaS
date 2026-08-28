/**
 * Lightweight unit assertions for general_ai_chat mode + smart output (no DB).
 * Run: npm run general-ai-chat:unit-check --workspace backend
 */
import assert from "node:assert/strict";

import type { AiChatSmartContextV1 } from "./ai-chat-context.types";
import { AI_CHAT_CONTEXT_SCHEMA_VERSION } from "./ai-chat-context.types";
import { detectAiChatMode } from "./ai-chat-mode";
import { AiChatSmartOutputEngine, isAllowedChatTargetHref } from "./ai-chat-smart-output.engine";

const engine = new AiChatSmartOutputEngine();

function emptyContext(overrides?: Partial<AiChatSmartContextV1>): AiChatSmartContextV1 {
  return {
    schema_version: AI_CHAT_CONTEXT_SCHEMA_VERSION,
    as_of: new Date().toISOString(),
    organization: { display_name: "Test Org" },
    actor: {
      role: "owner",
      can_view_financials: true,
      can_view_jobs: true,
      can_view_calls: true,
      can_view_leads: true,
    },
    dashboard_summary: {
      new_leads: 0,
      contacted_leads: 0,
      active_jobs: 0,
      jobs_scheduled_today: 0,
      unpaid_invoices: 0,
    },
    unpaid_invoices: [],
    stale_estimates: [],
    todays_jobs: [],
    recent_leads: [],
    recent_and_missed_calls: [],
    data_limits: { max_per_category: 5, note: "test" },
    ...overrides,
  };
}

assert.equal(detectAiChatMode("What should I focus on today?"), "daily_focus");
assert.equal(detectAiChatMode("Who owes me money?"), "money_recovery");
assert.equal(detectAiChatMode("Which estimates need follow-up?"), "estimate_followup");
assert.equal(detectAiChatMode("Do I have missed calls?"), "call_recovery");
assert.equal(detectAiChatMode("Hello"), "general_question");

assert.equal(isAllowedChatTargetHref("/invoices"), true);
assert.equal(isAllowedChatTargetHref("/estimates/abc-123"), false);
assert.equal(isAllowedChatTargetHref("https://evil.example"), false);

const noDataRecs = engine.buildRecommendations(emptyContext(), "general_question");
assert.equal(noDataRecs.length, 0);

const unpaidContext = emptyContext({
  dashboard_summary: {
    new_leads: 0,
    contacted_leads: 0,
    active_jobs: 0,
    jobs_scheduled_today: 0,
    unpaid_invoices: 5,
  },
});

const moneyRecs = engine.buildRecommendations(unpaidContext, "money_recovery");
assert.ok(moneyRecs.length > 0);
assert.equal(moneyRecs[0].targetHref, "/invoices");
assert.ok(!moneyRecs[0].reason.includes("@"));
assert.ok(!/\d{3}[-.]?\d{3}[-.]?\d{4}/.test(moneyRecs[0].reason));

const grounding = engine.buildGrounding(unpaidContext, "money_recovery");
assert.ok(grounding.some((g) => g.label.includes("5 unpaid")));
assert.ok(grounding.every((g) => !g.label.includes("@")));

console.log("general-ai-chat-unit-check: ok");
