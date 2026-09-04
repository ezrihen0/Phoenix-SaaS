/**
 * Smart V1 — AiChatContext serialization and privacy helpers (no DB).
 * Run: npm run ai-chat:context-check --workspace backend
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertWorkspaceContextJsonSafe,
  buildActorCapabilitySummary,
  sanitizeCallerDisplayLabel,
  sanitizePersonDisplayLabel,
  takeMax,
  looksLikePhone,
  looksLikeEmail,
} from "./ai-chat-context.sanitize";
import { AI_CHAT_CONTEXT_MAX_PER_CATEGORY } from "./ai-chat-context.types";

const root = __dirname;

assert.equal(sanitizeCallerDisplayLabel(null, null), "Unknown caller");
assert.equal(sanitizeCallerDisplayLabel("", null), "Unknown caller");
assert.equal(sanitizeCallerDisplayLabel("+1 (503) 555-0199", null), "Unknown caller");
assert.equal(sanitizeCallerDisplayLabel("+1 (503) 555-0199", "client-uuid"), "Known customer");
assert.equal(sanitizeCallerDisplayLabel("owner@example.com", null), "Unknown caller");
assert.equal(sanitizeCallerDisplayLabel("Rivera Residence", null), "Rivera Residence");

assert.equal(sanitizePersonDisplayLabel("5551234567", "Customer"), "Customer");
assert.equal(sanitizePersonDisplayLabel("sam@example.com", "Lead"), "Lead");
assert.equal(sanitizePersonDisplayLabel("Sam Taylor", "Lead"), "Sam Taylor");

assert.equal(looksLikePhone("+15035550199"), true);
assert.equal(looksLikeEmail("a@b.co"), true);

const capped = takeMax([1, 2, 3, 4, 5, 6], AI_CHAT_CONTEXT_MAX_PER_CATEGORY);
assert.equal(capped.length, 5);

const summary = buildActorCapabilitySummary({
  user: {} as never,
  profile: null,
  technician: null,
  memberships: [],
  membership: null,
  organization: null,
  membership_id: null,
  organization_id: "org-a",
  role: "owner",
  permissions: ["invoices.view", "jobs.view", "calls.view", "leads.view"],
  platform_capabilities: [],
});

assert.equal(summary.role, "owner");
assert.equal(summary.can_view_financials, true);
assert.equal(summary.can_view_jobs, true);
assert.equal(summary.can_view_calls, true);
assert.equal(summary.can_view_leads, true);
assert.equal("permissions" in summary, false);

const sampleContext = {
  schema_version: "smart_v1",
  organization: { display_name: "Acme Co" },
  actor: summary,
  recent_and_missed_calls: [
    {
      id: "call-1",
      call_status: "missed",
      is_missed: true,
      customer_label: sanitizeCallerDisplayLabel("+15551234567", null),
      source: "google",
      started_at: "2026-05-27T08:00:00.000Z",
      duration_seconds: null,
    },
  ],
  recent_leads: [
    {
      id: "lead-1",
      status: "new_lead",
      source: "website",
      customer_label: sanitizePersonDisplayLabel("5559876543", "Lead"),
      city_label: "Portland",
      created_at: "2026-05-27T08:00:00.000Z",
    },
  ],
};

const json = JSON.stringify(sampleContext);
assertWorkspaceContextJsonSafe(json);
assert.equal(json.includes("555"), false);
assert.equal(json.includes("@"), false);

const chatServiceSource = readFileSync(join(root, "ai-chat.service.ts"), "utf8");
assert.equal(chatServiceSource.includes("body.organization"), false);
assert.equal(chatServiceSource.includes("requireActiveOrganizationIdFromActor(request.actor?.organization_id)"), true);
assert.equal(chatServiceSource.includes('typeof body.message === "string"'), true);

const contextServiceSource = readFileSync(join(root, "ai-chat-context.service.ts"), "utf8");
assert.equal(contextServiceSource.includes("matched_client_display_name"), true);
assert.equal(contextServiceSource.includes("voicemail_transcription"), false);
assert.equal(contextServiceSource.includes("raw_payload_snapshot"), false);
assert.equal(contextServiceSource.includes("buildActorCapabilitySummary"), true);

console.log("ai-chat-context-unit-check: ok");
