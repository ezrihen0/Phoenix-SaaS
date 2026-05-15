# Phase 1.5B — Execution Prompt (Telnyx AI Assistant Bridge)

**Status:** Implementation execution spec (for coding agents / engineers).  
**Builds on:** [Phase 1.5B Live Voice Intake Plan](WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md), [Telnyx Spike Runbook](WizField_AI_Phase1.5B_Telnyx_Spike_Runbook.md), repo bridge plan (Cursor plan, not edited here).

---

## Locked product direction

Phone-only; Telnyx AI Assistants native runtime; canonical attach: org/DID → pilot gate → Voice Flow catalog → `answer` if required → `ai_assistant_start` with `assistant.dynamic_variables` → signed tool → post-call ingest → `call_intake.*` → hybrid CRM; no booking / no jobs / no dirty leads; classic telephony fallback when pilot off or AI attach fails.

---

## Completed P1 in repo (this delivery)

- Migration + entities: `voice_flows`, `owned_phone_numbers.voice_flow_id`, Amber catalog seed.
- Feature flags + allowlists wired in [`LiveVoicePilotService`](backend/src/telephony/live-voice-pilot.service.ts).
- Canonical attach path in [`TelnyxLiveVoiceAttachService`](backend/src/telephony/telnyx-live-voice-attach.service.ts); webhook skips classic [`executeInitialCallFlow`](backend/src/telephony/telnyx-webhook.service.ts) when attach returns `attached`.

---

## Decisions (formerly blockers)

### 1. `AiRecommendationRunEntity.actor_profile_id` (webhook / system-driven runs) — **locked owner direction**

**P1:** No change — webhook-driven `ai_recommendation_runs` persistence remains **P3**.

**P3 (locked implementation truth):**

- **Migration:** Make **`actor_profile_id` nullable** on `ai_recommendation_runs` so webhook/system-driven runs do **not** require a `profiles` row.
- **Human-triggered runs** (e.g. staff dry-runs): Continue to set a **real** `actor_profile_id` from the authenticated session.
- **Webhook / system runs:** Set **`actor_profile_id` to `NULL`**; do **not** use a fake dedicated system profile, do **not** route through env-based synthetic profile IDs, and do **not** add a parallel audit table.
- **Distinction:** Human vs webhook/system is carried by **explicit metadata** already on the model (e.g. **`source_channel`**, **`feature_key`**, status/error fields) — not by inventing a synthetic user identity.

### 2. Voice Flow catalog DDL

**Chosen:**

- Table **`voice_flows`**: `id` (UUID PK), `flow_id` (unique), `telnyx_assistant_id` (nullable; fallback env below), `title`, `is_active`, timestamps.
- **`owned_phone_numbers.voice_flow_id`** nullable FK → `voice_flows.id`.
- Seed row: **`amber_schedule_availability_intake`** (assistant id may be null; use **`VOICE_FLOW_AMBER_TELNYX_ASSISTANT_ID`** env for Amber until DB is filled).

**Migration:** `1778820000000-voice-flow-catalog-phase15b`.

---

## Environment variables (P1)

| Variable | Purpose |
|----------|---------|
| `AI_VOICE_INTAKE_LIVE_PILOT_ENABLED` | Live pilot master switch (with foundation flags). |
| `AI_VOICE_INTAKE_LIVE_PILOT_OWNED_PHONE_IDS` | Comma-separated `owned_phone_numbers.id` allowlist (**required non-empty** for any AI attach when pilot on — default deny). |
| `AI_VOICE_INTAKE_LIVE_PILOT_ORGANIZATION_IDS` | Optional org UUID allowlist; when set, `matchOrganizationId` must match. |
| `VOICE_FLOW_AMBER_TELNYX_ASSISTANT_ID` | Telnyx Amber assistant id when `voice_flows.telnyx_assistant_id` is null. |

P3 webhook audit rows use **nullable `actor_profile_id`** per Decisions §1 — **no** env var for a synthetic webhook profile.

---

## Code map (P1)

| Area | Location |
|------|----------|
| Live pilot gate | [`live-voice-pilot.service.ts`](backend/src/telephony/live-voice-pilot.service.ts) |
| Voice Flow resolve | [`voice-flow.service.ts`](backend/src/telephony/voice-flow.service.ts) |
| `answer` + `ai_assistant_start` | [`telnyx-live-voice-attach.service.ts`](backend/src/telephony/telnyx-live-voice-attach.service.ts) |
| Call Control (public) | [`telephony-execution.service.ts`](backend/src/telephony/telephony-execution.service.ts) `executeCallControlAction` |
| Webhook integration | [`telnyx-webhook.service.ts`](backend/src/telephony/telnyx-webhook.service.ts) after `call.initiated` save — if attach ≠ `attached`, classic `executeInitialCallFlow` |
| Pilot flag resolver | [`ai-environment.ts`](backend/src/ai/ai-environment.ts) `resolveAiVoiceIntakeLivePilotEnabled` |

Webhook response may include **`liveVoiceAiAttached: true`** when AI path attached.

---

## Packages (delivery status)

- **P1–P3:** Delivered per execution prompt and verification matrix.
- **P4:** See **§ P4 closeout** below.

---

## P4 closeout (Phase 1.5B — documentation + verification)

**Status:** Phase 1.5B is **implementation-complete** for the approved scope in this execution prompt and the [Live Voice Intake Plan](WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md) (non-goals unchanged).

| P4 item | Outcome |
|---------|--------|
| Optional **Conversation Messages API** | **Not implemented (N/A).** Spike + live plan §8: transcript comes from **`call.conversation.ended`** `messages[]` and ingest merge; the Messages API is optional hardening only if a future Telnyx behavior gap appears. |
| Optional **minimal Calls UI** | **Satisfied** with existing `/calls` AI summary + CRM badges; P4 adds a minimal **Telnyx voice hybrid CRM hint** line when `aiProvider` is `telnyx_ai_assistant` ([`frontend/app/calls/page.tsx`](../frontend/app/calls/page.tsx)). |
| **Verification matrix + closeout** | [**`docs/WizField_AI_Phase1.5B_Verification_Matrix.md`**](WizField_AI_Phase1.5B_Verification_Matrix.md) |

Primary regression bundle: `npm run build --workspace backend` · `npm run build --workspace frontend` · `cd backend && npm run telephony-messaging:isolation:smoke` (expect **9a–9d** PASS).

---

## Historical note — package checklist

Phase 1.5B P1–P4 are **delivered**; see [**Verification matrix**](WizField_AI_Phase1.5B_Verification_Matrix.md). The following was the original bounded backlog (kept for audit):

- **P2:** `call.conversation.*` ingest; signed **`get_availability`** HTTP tool + heuristic.
- **P3:** Nullable **`actor_profile_id`**; voice normalizer + **`ai_recommendation_runs`** for webhooks; hybrid CRM.
- **P4:** Optional Messages API (N/A); optional Calls UI + matrix (done per § P4 closeout).

---

## Verification (P1)

- Pilot off: identical classic path as before.
- Pilot on, empty allowlist: no AI attach.
- Pilot on, allowlisted owned number + `voice_flow_id` + `telnyx_assistant_id` or **`VOICE_FLOW_AMBER_TELNYX_ASSISTANT_ID`**: `answer` then `ai_assistant_start` (or Telnyx simulates when no API key).
- Non-allowlisted DID: classic path.
- **`npm run build --workspace backend`**

---

## Explicit non-goals

Same as locked plan: no booking engine, no job mutations, no IVR expansion as a product, no web widget, Amber-only foundation, no calendar redesign.

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-15 | P1 execution prompt + repo decisions (catalog DDL, deferred webhook actor to P3) |
| 2026-05-15 | Locked decision: P3 nullable `actor_profile_id` + metadata for webhook/system runs; no synthetic profile / no `AI_VOICE_INTAKE_WEBHOOK_ACTOR_PROFILE_ID` / no parallel audit table |
| 2026-05-15 | **P4 closeout:** verification matrix; Messages API N/A; minimal Calls hint; Phase 1.5B scope marked implementation-complete |
