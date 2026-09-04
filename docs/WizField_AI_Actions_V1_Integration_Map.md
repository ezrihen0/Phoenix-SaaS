# WizField AI Actions V1 — Integration Map

**Status:** Implemented (framework layer)  
**Parent doc:** [`WizField_AI_Master_Source_of_Truth.md`](./WizField_AI_Master_Source_of_Truth.md)

Home AI V1 (`/api/ai/home/*`, read-only tools, persisted conversations) is current conversational truth in the AI Master SoT. This map remains the Actions framework layer and must not be read as adding AI write actions.

---

## Purpose

AI Actions V1 adds a **provider-ready, measurable action layer** without changing Phase 0–4 endpoint behavior. The owner enables backend env flags and optionally adds `DEEPSEEK_API_KEY` — no frontend secrets, no autonomy, no CRM mutations without human confirmation.

---

## Current AI baseline (unchanged)

| Capability | Legacy endpoint | `feature_key` | OpenAI? |
|---|---|---|---|
| Brain V1 home brief | `GET /api/ai/brain/home-brief` | `brain_v1_home` | No |
| Call intake dry-run | `POST /api/ai/intake/call-envelope/dry-run` | `call_intake_envelope_v0` | No |
| Copilot SMS draft | `POST /api/ai/copilot/calls/sms-draft/generate` | `operator_copilot_calls_sms_v1` | Optional (DeepSeek) |
| Voice post-call finalize | Telnyx webhook pipeline | `call_intake_voice_telnyx_v1` | No |

Audit ledger: `ai_recommendation_runs` via `AiAuditService.persistRun()`.

---

## V1 unified API

| Method | Path | Auth | Gate |
|---|---|---|---|
| `POST` | `/api/ai/actions/:actionKey/run` | Session | `AI_ACTIONS_V1_ENABLED` + per-action flags |
| `GET` | `/api/ai/usage/summary` | Session (owner / `billing.manage`) | Same foundation stack |

### Run response shape

```json
{
  "actionKey": "home_brain_brief",
  "status": "ok | disabled | provider_not_configured | not_implemented | error",
  "summary": "...",
  "actions": [{ "title": "...", "href": "...", "severity": "..." }],
  "runId": "uuid",
  "costEstimate": 0
}
```

---

## Action registry (8 actions)

| `action_key` | Status | Surface | Permission | Feature flags | Handler V1 |
|---|---|---|---|---|---|
| `home_brain_brief` | existing | `/home` | `dashboard.office.view` | Foundation + Brain | Wraps Brain brief |
| `sms_followup_draft` | existing | `/calls` | `calls.view` | Copilot draft chain | Wraps SMS draft generate |
| `missed_call_summary` | existing | `/calls` | `calls.view` | Voice intake foundation | Wraps intake dry-run |
| `unpaid_invoice_recovery` | planned | `/home`, `/invoices` | `dashboard.office.view` | `AI_ACTIONS_V1_ENABLED` | `not_implemented` |
| `stale_estimate_followup` | planned | `/home`, `/estimates` | `dashboard.office.view` | `AI_ACTIONS_V1_ENABLED` | `not_implemented` |
| `customer_history_summary` | planned | `/customers` | `customers.view` | `AI_ACTIONS_V1_ENABLED` | `not_implemented` |
| `job_next_step` | planned | `/jobs` | `jobs.view` | `AI_ACTIONS_V1_ENABLED` | `not_implemented` |
| `growth_opportunity_draft` | planned | `/marketing` | Marketing office role | `AI_ACTIONS_V1_ENABLED` | `not_implemented` |

Registry source: `backend/src/ai/ai-action-registry.ts`

---

## Provider / env setup (backend only)

```text
AI_FOUNDATION_ENABLED=true
AI_BRAIN_V1_ENABLED=true
AI_OPERATOR_COPILOT_ENABLED=true
AI_COPILOT_CALLS_SURFACE_ENABLED=true
AI_COPILOT_CUSTOMER_SMS_DRAFT_ENABLED=true
AI_COPILOT_LLM_ENABLED=true          # optional LLM drafts
AI_VOICE_INTAKE_FOUNDATION_ENABLED=true
AI_ACTIONS_V1_ENABLED=true           # new V1 gate
DEEPSEEK_API_KEY=<owner adds locally>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_CHAT_MODEL=deepseek-v4-flash
AI_CHAT_ENABLED=true                   # WizField AI Chat agent
```

**Hard rules:** no `NEXT_PUBLIC_*` DeepSeek vars; no key in frontend; missing key never crashes the app.

DeepSeek boundary: `backend/src/ai/ai-deepseek-provider.service.ts`  
Copilot delegate: `backend/src/ai/ai-copilot-deepseek-client.service.ts`  
First agent: see [`WizField_AI_Agents_V1.md`](./WizField_AI_Agents_V1.md)

---

## Permission / flag model

1. `AI_ACTIONS_V1_ENABLED` — parent gate for unified run endpoint.
2. Per-action `feature_flag` list in registry (all must be on).
3. `required_permission` enforced via `requirePermission` (or marketing office role for Growth Center draft).
4. Usage panel: `billing.manage` (owner-only, matches Settings billing pattern).

---

## Measurement model

### New DB columns (`ai_recommendation_runs`)

`action_key`, `provider`, `input_tokens`, `output_tokens`, `estimated_cost_usd`, `latency_ms`, `clicked_action`, `outcome_key`

Migration: `1778900000000-ai-recommendation-runs-action-telemetry.ts`

### Telemetry service

`AiActionTelemetryService.recordActionRun()` — dual-write on unified runs; **does not modify** legacy dedicated endpoint audit writes.

### Usage aggregates

`GET /api/ai/usage/summary` — month-to-date:

- Total runs (rows with `action_key` or mapped legacy `feature_key`)
- Top action key
- Sum `estimated_cost_usd`
- Success / failed counts
- `businessOutcomesTracked: 0` (placeholder)

Settings panel: `/settings?topic=ai-usage` (owner-only nav)

---

## No-autonomy boundaries

- No auto-send SMS/email
- No auto-schedule jobs
- No CRM mutations without explicit human confirmation
- Planned actions return `not_implemented` with no side effects
- Copilot guarded send path unchanged (Phase 3)

---

## Implementation status matrix

| Component | Status |
|---|---|
| Action registry | Done |
| `AI_ACTIONS_V1_ENABLED` | Done |
| OpenAI provider boundary | Done |
| Unified run endpoint | Done (3 existing wrappers + 5 planned stubs) |
| Usage summary endpoint | Done |
| Telemetry service + migration | Done |
| Settings AI Usage panel | Done |
| Outcome / click tracking | Placeholder only |
| Planned action handlers | Not started |

---

## Next recommended package

1. Implement `unpaid_invoice_recovery` + `stale_estimate_followup` as deterministic Brain-rule extensions (no OpenAI required).
2. Wire `clicked_action` from Brain action card analytics.
3. Implement `customer_history_summary` with bounded CRM context + optional OpenAI narrative.
4. Add `PATCH /api/ai/actions/runs/:runId/outcome` linking Copilot Phase 4 `outcome_key`.
