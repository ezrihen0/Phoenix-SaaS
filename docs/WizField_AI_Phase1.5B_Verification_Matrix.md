# Phase 1.5B — Verification matrix (closeout)

**Scope:** Telnyx AI Assistant bridge (live voice intake), aligned with [Execution Prompt](./WizField_AI_Phase1.5B_Execution_Prompt_Telnyx_Assistant_Bridge.md) and [Live Voice Intake Plan](./WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md).  
**Status:** Matrix reflects repo verification as of Phase 1.5B P4 documentation closeout.

---

## Legend

| Result | Meaning |
|--------|---------|
| PASS | Automated or documented manual verification satisfies the row |
| N/A | Explicitly out of scope or not implemented by product decision |
| Manual | Requires human / Telnyx portal / staging dial (not automated in CI) |

---

## P1 — Pilot attach, Voice Flow catalog, webhook branch

| # | Check | How verified | Result |
|---|--------|----------------|--------|
| P1.1 | `voice_flows` + `owned_phone_numbers.voice_flow_id` present | Migrations + schema smoke | PASS |
| P1.2 | Pilot off → classic `executeInitialCallFlow` | Execution prompt §Verification P1 (manual / env) | Manual |
| P1.3 | Pilot on, empty allowlist → no AI attach | Execution prompt §Verification P1 | Manual |
| P1.4 | Pilot on, allowlisted DID + flow → `answer` + `ai_assistant_start` path | Live attach service + manual pilot | Manual |
| P1.5 | Non-allowlisted DID → classic path | Manual | Manual |
| P1.6 | Backend builds | `npm run build --workspace backend` | PASS |

---

## P2 — Conversation ingest, tool, ordering

| # | Check | How verified | Result |
|---|--------|----------------|--------|
| P2.1 | `call.conversation.*` webhooks update `recent_calls` (insights, ended) | `telephony-messaging:isolation:smoke` **9a** | PASS |
| P2.2 | Duplicate provider event id deduped | Smoke **9a** | PASS |
| P2.3 | Out-of-order: ended before insights merges both | Smoke **9b** | PASS |
| P2.4 | Signed `get_availability` HTTP tool + bounded response | Smoke **9c** | PASS |
| P2.5 | Migrations apply | Smoke migrations phase | PASS |

---

## P3 — Nullable actor audit, voice normalizer, hybrid CRM

| # | Check | How verified | Result |
|---|--------|----------------|--------|
| P3.1 | `ai_recommendation_runs` upsert from post-call finalization | Smoke **9d** | PASS |
| P3.2 | `actor_profile_id` NULL for webhook/system runs | Smoke **9d** | PASS |
| P3.3 | `source_channel` / `feature_key` Telnyx voice constants | Smoke **9d** (vs `ai.constants`) | PASS |
| P3.4 | `tool_trace_json.sections` contains `call_intake.*` keys | Smoke **9d** | PASS |
| P3.5 | Hybrid **artifact_only** when required CRM fields missing | Smoke **9d** (strip `preferred_service_type`) | PASS |
| P3.6 | Hybrid **lead_created** when `parseCreateLeadPayload` passes | Smoke **9d** | PASS |

---

## P4 — Optional Messages API, optional Calls UI, closeout docs

| # | Check | How verified | Result |
|---|--------|----------------|--------|
| P4.1 | **Telnyx Conversation Messages API** reconciliation in backend | Not implemented | **N/A** — [Live plan §8](./WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md): parallel optional hardening; **`call.conversation.ended` `messages[]`** + ingest merge sufficient for Phase 1.5B |
| P4.2 | **Minimal Calls UI** for voice intake + CRM signal | Existing `/calls` already surfaces `aiSummary`, Lead badge, AI fields; P4 adds a one-line **Telnyx voice hybrid hint** when `aiProvider === telnyx_ai_assistant` | PASS (minimal additive UI) |
| P4.3 | Documentation: Phase 1.5B implementation complete | Execution prompt + this matrix + live plan history | PASS |

---

## Aggregate commands (recommended regression bundle)

```bash
npm run build --workspace backend
npm run build --workspace frontend
cd backend && npm run telephony-messaging:isolation:smoke
```

Expected: backend/frontend build **PASS**; smoke **ok: true**, including **9a–9d** PASS.

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-15 | P4 closeout matrix: P1–P4 rows, Messages API N/A with rationale, Calls UI note |
