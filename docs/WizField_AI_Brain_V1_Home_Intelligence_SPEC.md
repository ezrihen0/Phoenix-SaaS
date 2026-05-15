# WizField AI — Business Brain V1 (Home Intelligence) Product Spec

**Phase:** 1 (follows Phase 0 foundation)  
**Primary surface:** Authenticated [`/home`](../frontend/app/home/page.tsx) for **office roles** (owner, admin, office_admin, dispatcher, viewer per current home gating)  
**North star:** Translate **deterministic** CRM dashboard truth into a **grounded daily brief** and **ranked action list** — no autonomous execution in V1.

---

## Out of scope (V1)

- Voice answering (**Phase 1.5** Voice Intake Pilot per master program)
- SMS/email send, portal magic link mint triggered by AI (**Phase 2+**)
- Growth Center publish, draft approval automation, or Instagram
- “Self-learning” claims without outcome logging
- Pricing or dispatch **execution** (narrate/diagnose only)

---

## Audience and permissions

| Audience | V1 behavior |
|----------|-------------|
| Owner / admin | Full brief + top actions + drill-through |
| office_admin / dispatcher / viewer | Same data class as today’s `GET /api/dashboard` permission — **must reuse** `dashboard.office.view` semantics; product may later narrow copy for dispatcher |

**Technician role:** Not in scope for Brain V1 strip (technician home remains [`TechnicianHomeBoard`](../frontend/components/home/technician-home-board.tsx)); optional later “field brief” is a separate epic.

---

## Deterministic data sources (single source of truth)

### Primary: Office dashboard API

- **Endpoint:** `GET /api/dashboard`
- **Backend:** [`CrmController.getDashboard`](../backend/src/crm/crm.controller.ts)
- **Frontend shape:** [`OfficeDashboardResponse`](../frontend/lib/crm/home-dashboard-types.ts) (+ **extend** frontend types for full parity with API)

Payload elements Brain V1 **must** consume:

| Bucket | Fields | Product use |
|--------|--------|-------------|
| `summary` | `newLeads`, `contactedLeads`, `activeJobs`, `jobsScheduledToday`, `unpaidInvoices` | Headline counts, “health” tiles (already on home) |
| `controls.quotesWaitingApproval` | Up to 4 quotes with `status: sent` | **Stale estimate / awaiting decision** narrative — *note: `OfficeDashboardResponse` type today omits this; align types with API for Brain* |
| `controls.unpaidInvoices` | Up to 4 unpaid | **Money at risk** — named drill-down |
| `controls.followUpsNeeded` | Jobs in `contacted` | **Pipeline follow-up** |
| `controls.todaysScheduledJobs` | Today’s schedule slice | **Operational focus today** |
| `controls.recentCompletedJobs` | Recent completed/paid | **Positive momentum** / optional social proof internally |
| `leads` | Recent non-converted (12) | **Unattended / aging lead** heuristics (rule-based in V1) |
| `jobs`, `technicians`, `services` | Lists | Context density caps for LM; optional V1.0 is summary-only without LM |

### Secondary (optional V1.1): Call reporting window

- **Endpoint:** `GET /api/call-reporting/summary`  
- **Backend:** [`CallReportingController`](../backend/src/telephony/call-reporting.controller.ts)  
- **Use:** Enrich brief with **missed/voicemail** and recovery-style KPIs **when** office role has telephony access — do not block Brain V1 on this path.

---

## UX layout (MVP)

### Placement

Insert an **Intelligence strip** below the hero / above existing “Today Focus” cards on `/home`:

1. **`IntelligenceBrief`** — collapsible summary (LM-generated **only** when Phase 0 + provider exists; otherwise **template + numbers** fallback).
2. **`TopActions`** — max **5** cards; each card = one diagnosed issue with:
   - Title (e.g. “$X across N unpaid invoices”)
   - **Grounding line** (e.g. “Oldest issued 12 days ago” — from real fields)
   - **Primary CTA** → deep link (`/invoices`, `/estimates/{id}`, `/leads`, `/jobs/{id}` as applicable)
3. **Disclaimer row** (persistent, subtle):  
   > “Summaries are generated from your WizField data in this workspace. They are not financial or legal advice. Verify before acting.”

### Interaction

- Clicking an action never auto-mutates; opens target module.
- Optional **“Explain”** drawer: shows **structured bullets** listing which dashboard keys supported the claim (no raw JSON to end users).

### Loading / error

- If dashboard load fails, **hide** AI strip (match current `loadError` pattern).
- If LM fails but dashboard ok, show **deterministic-only** brief (no error wall).

---

## Rule-based diagnosis (V1 minimum)

Implement **before** or **in parallel** with LM narrative — keeps product honest when model is off.

| Rule id | Condition (conceptual) | Severity | CTA default |
|---------|------------------------|----------|-------------|
| `unpaid_invoices` | `summary.unpaidInvoices > 0` or controls list non-empty | High | `/invoices` |
| `quotes_waiting` | `controls.quotesWaitingApproval.length > 0` | High | `/estimates/{id}` (first/oldest by `sent_at`) |
| `stale_leads` | Any lead in `leads` with `created_at` older than **N days** (config constant) | Medium | `/leads` |
| `follow_up_jobs` | `followUpsNeeded.length > 0` | Medium | `/jobs` |
| `heavy_day` | `jobsScheduledToday` above org-relative threshold (optional V1.1) | Low | `/schedule` |

Ranking: default sort = **unpaid + quote waiting** first, then leads age, then follow-ups.

---

## LM narrative layer (when enabled)

- **Input:** Bounded JSON derived from dashboard + rule outputs (hashed for audit from Phase 0).
- **Output:** Short brief (≤ ~120 words) + **must not introduce facts** not present in input (evaluation rubric: “unsupported claim”).
- **Copy discipline:** Forbidden to mention portal analytics, autopublish, autopilot scheduling, voice as live feature (Voice is Phase 1.5).
- **Voice disclaimer (product copy reserve):** If marketing mentions roadmap voice, use:  
  > “Voice Intake is available as a **separate pilot** for eligible businesses — not included in the standard Brain experience.”

---

## Telemetry (align with Phase 0 audit)

- Log `feature_key: brain_v1` runs.
- Track **action card clicks** (analytics event) — feeds future learning loop without claiming ML.

---

## Demo “wow moment” (acceptance)

Scripted path from master program:

1. Open `/home` — metrics match CRM.
2. Intelligence strip shows **$ outstanding** consistent with unpaid control list.
3. User opens explain drawer — sees **citations** (invoice ages, quote sent dates).
4. No autonomous side effects.

---

## Engineering dependencies

1. **Phase 0** `ai_recommendation_runs` / tool execution path (or temporary inline service if owner sequences differently — prefer Phase 0 completion first).
2. Frontend: shared types for dashboard **including** `quotesWaitingApproval` (sync with [`jobs-workspace`](../frontend/app/jobs/jobs-workspace.tsx) local types if needed).
3. Optional: dedicated `GET /api/ai/brain/brief` that returns `{ rules, narrative, actions }` — keeps `/home` thin.

---

## References

- Master program plan (strategic context): product owner’s **WizField AI Master Program Plan** (Cursor plan artifact — not edited in repo)
- [WizField_AI_Phase0_Foundation_Execution_Prompt.md](WizField_AI_Phase0_Foundation_Execution_Prompt.md)
- [WizField_AI_Sales_Enablement_Risk_Register.md](WizField_AI_Sales_Enablement_Risk_Register.md)
