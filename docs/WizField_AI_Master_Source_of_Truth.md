# WizField AI — Master Source of Truth

## Purpose

This is the **canonical product and architecture truth** for the WizField AI program **Phases 0–4** (shipped on `SaaS-master`). Read this before any AI discussion, enablement, or future phase planning.

**Companion docs:**

- Engineering evidence and verification: [`WizField_AI_Engineering_Closeout_and_Gap_Register.md`](WizField_AI_Engineering_Closeout_and_Gap_Register.md)
- Brain V1 UX and rules detail: [`WizField_AI_Brain_V1_Home_Intelligence_SPEC.md`](WizField_AI_Brain_V1_Home_Intelligence_SPEC.md)
- External messaging guardrails: [`WizField_AI_Sales_Enablement_Risk_Register.md`](WizField_AI_Sales_Enablement_Risk_Register.md)
- Execution process: [`AI_WORKFLOW_RULES.md`](AI_WORKFLOW_RULES.md)
- Production replay: [`WizField_Reverification_Runbook.md`](WizField_Reverification_Runbook.md) §6B

Historical phase execution prompts live under [`archive/ai/`](archive/ai/) for audit only — **not** authoritative.

---

## 1. Shipped scope (Phases 0–4)

| Phase | Product capability |
|-------|-------------------|
| **0** | AI foundation: tool registry, bounded context, `ai_recommendation_runs` audit, noop model path |
| **1** | Business Brain V1: deterministic home brief on `/home` |
| **1.5A** | Voice intake foundation: staff `call_intake.*` envelope dry-run over `recent_calls` |
| **1.5B** | Telnyx live voice pilot: AI attach, conversation ingest, post-call finalize, hybrid CRM |
| **2** | Operator Copilot: `/calls` SMS follow-up **drafts** (no send) |
| **3** | Guarded human-confirmed customer SMS send from Copilot |
| **4** | Copilot SMS outcome observation (thread reply after outbound; read-only) |

**Out of scope here:** Phase 5+ product work, autonomous send, drip/sequences, CRM mutation from outcomes, self-learning claims.

---

## 2. Data ownership

| Store | Role | Must not |
|-------|------|----------|
| `ai_recommendation_runs` | Generation / audit trail (`tool_trace_json`, provider metadata) | Hold editable draft text, send state, or outcome state |
| `ai_operator_drafts` | Mutable operator product lifecycle (`active` / `dismissed` / `sent`) | Replace messaging execution truth |
| `recent_calls` | Telephony + voice intake truth | Act as org boundary without scope SQL |
| `txt_messages` | Messaging execution truth (inbound/outbound rows) | Be written by Phase 4 outcome code |

**Copilot send proof:** `ai_operator_drafts.outbound_txt_message_id` → `txt_messages.id` (Phase 3).

**Outcome derivation (Phase 4):** Read-only at presentation time from `txt_messages` using outbound anchor + first inbound with `Ti > T_anchor` in the same `conversation_id`.

---

## 3. Feature flags

Enabling tokens (case-insensitive): `true`, `1`, `yes`, `on`. Non-enabling → feature off.

**Merge order:** non-empty `process.env` wins, else Nest `ConfigService`.

### Hierarchy

```text
AI_FOUNDATION_ENABLED
├── AI_BRAIN_V1_ENABLED                    → GET /api/ai/brain/home-brief
├── AI_VOICE_INTAKE_FOUNDATION_ENABLED
│   ├── POST /api/ai/intake/call-envelope/dry-run
│   └── AI_VOICE_INTAKE_LIVE_PILOT_ENABLED (+ allowlists) → live Telnyx AI attach only
└── AI_OPERATOR_COPILOT_ENABLED
    └── AI_COPILOT_CALLS_SURFACE_ENABLED
        └── AI_COPILOT_CUSTOMER_SMS_DRAFT_ENABLED
            ├── AI_COPILOT_LLM_ENABLED (optional; draft generation only)
            ├── AI_COPILOT_CUSTOMER_SMS_GUARDED_SEND_ENABLED (send + Send UX)
            └── AI_COPILOT_CUSTOMER_SMS_OUTCOME_TRACKING_ENABLED (read-only outcome fields)
```

### Environment variables

| Variable | Gates |
|----------|--------|
| `AI_FOUNDATION_ENABLED` | All `/api/ai/*` parent gate (`ai_foundation_disabled`) |
| `AI_BRAIN_V1_ENABLED` | Brain home brief (`ai_brain_v1_disabled`) |
| `AI_VOICE_INTAKE_FOUNDATION_ENABLED` | Staff intake dry-run; **post-call finalize** (see §4) |
| `AI_VOICE_INTAKE_LIVE_PILOT_ENABLED` | Live Telnyx AI attach on inbound calls |
| `AI_VOICE_INTAKE_LIVE_PILOT_OWNED_PHONE_IDS` | Comma-separated `owned_phone_numbers.id` allowlist (required non-empty when pilot on) |
| `AI_VOICE_INTAKE_LIVE_PILOT_ORGANIZATION_IDS` | Optional org UUID allowlist |
| `AI_OPERATOR_COPILOT_ENABLED` | Copilot master |
| `AI_COPILOT_CALLS_SURFACE_ENABLED` | `/calls` Copilot APIs |
| `AI_COPILOT_CUSTOMER_SMS_DRAFT_ENABLED` | SMS draft workflow |
| `AI_COPILOT_LLM_ENABLED` | Optional LLM draft path (falls back to template) |
| `AI_COPILOT_CUSTOMER_SMS_GUARDED_SEND_ENABLED` | `POST .../send` |
| `AI_COPILOT_CUSTOMER_SMS_OUTCOME_TRACKING_ENABLED` | Outcome fields on draft DTO |
| `OPENAI_API_KEY` | Required for LLM draft path when enabled |
| `OPENAI_COPILOT_MODEL` | Optional; defaults to `gpt-4o-mini` |
| `VOICE_FLOW_AMBER_TELNYX_ASSISTANT_ID` | Catalog fallback assistant id |

---

## 4. Voice intake: attach vs finalize (locked policy)

| Path | Required flags |
|------|----------------|
| **Live AI attach / routing** | `AI_FOUNDATION_ENABLED` + `AI_VOICE_INTAKE_FOUNDATION_ENABLED` + `AI_VOICE_INTAKE_LIVE_PILOT_ENABLED` + allowlists |
| **Post-call finalize** (`VoiceIntakePostCallService.maybeFinalizeFromTelnyxEvent`) | `AI_FOUNDATION_ENABLED` + `AI_VOICE_INTAKE_FOUNDATION_ENABLED` only |

**Finalize does not require live pilot.** Rationale: a call may have started while pilot was on; Telnyx `call.conversation.*` events may arrive after pilot is disabled. Finalize must still complete safely when foundation + voice intake foundation remain enabled.

**Telnyx `get_availability` tool:** Ed25519 signature verification; no additional AI product flags (infrastructure bridge).

---

## 5. API surface (`/api/ai`, session required)

| Method | Path | Permissions | Notes |
|--------|------|-------------|-------|
| POST | `tools/dry-run` | `dashboard.office.view` | Phase 0 |
| GET | `brain/home-brief` | `dashboard.office.view` | Phase 1 |
| POST | `intake/call-envelope/dry-run` | `calls.view` | Phase 1.5A |
| POST | `copilot/calls/sms-draft/generate` | `calls.view` | Phase 2 |
| GET | `copilot/calls/sms-draft?recentCallId=` | `calls.view` | Active draft first, else latest `sent` |
| PATCH | `copilot/calls/sms-draft/:draftId` | `calls.view` | |
| POST | `copilot/calls/sms-draft/:draftId/dismiss` | `calls.view` | |
| POST | `copilot/calls/sms-draft/:draftId/send` | `calls.view` + `messaging.send` | Phase 3; canonical send via `TxtService` |

**Frontend:** `/calls` requires `calls.view`; Send affordance requires `messaging.send`. `/home` Brain strip for office roles when Brain flags on.

---

## 6. Permissions summary

| Surface | Permission |
|---------|------------|
| Brain V1 | `dashboard.office.view` |
| Calls / Copilot read-edit-dismiss | `calls.view` |
| Copilot guarded send | `calls.view` + `messaging.send` |
| Outcome tracking | Same as Copilot read paths (`calls.view`); no extra permission |

Viewer role: excluded from `/calls` (no `calls.view`); may see Brain when office role includes dashboard access per Brain spec.

---

## 7. Tenant isolation

- Org scope from **`request.actor.organization_id`** — never trust client-supplied org ids for AI context.
- `recent_calls`: org via owned DID / matched customer / matched lead SQL (`recentCallBelongsToOrgSql`).
- Drafts, customers on send, and outcome hydration: `organization_id` checks on draft, customer, and conversation join.
- Copilot send: `TxtService.sendMessage` with `organizationIdForCustomerScope` = active org.

---

## 8. No-autonomy boundaries

- No auto-send, background send, drip, sequences, or retries triggered by AI outcomes.
- No CRM mutation from Phase 4 outcome observation.
- No telephony customer SMS bypass for Copilot (`TxtService` only; enforced by `operator-copilot:contract-check`).
- Hybrid voice CRM lead creation on webhook is **policy-bound intake**, not Copilot autonomy.
- Phase 4 outcome is **temporal correlation** in thread, not causal attribution or self-learning.

---

## 9. Commit anchors (SaaS-master)

| Commit | Scope |
|--------|--------|
| `69c18c8` | Phase 0, Brain, 1.5A/1.5B foundation |
| `a9054bc` | Phase 2 Copilot drafts |
| `d641438` | Phase 3 guarded send |
| `25495ff` | Phase 4 outcome loop |

---

## 10. Global platform alignment

- Tenant rules: [`WizField_Master_Source_of_Truth.md`](WizField_Master_Source_of_Truth.md)
- Gate 11–14 closeout unchanged; AI is additive program on same org/session model.
