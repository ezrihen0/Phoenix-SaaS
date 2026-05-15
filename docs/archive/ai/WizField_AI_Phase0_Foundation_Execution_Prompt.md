> **Status: HISTORICAL** — Superseded by `docs/WizField_AI_Master_Source_of_Truth.md` and
> `docs/WizField_AI_Engineering_Closeout_and_Gap_Register.md`. Preserved for audit trail only.

# WizField AI — Phase 0 Foundation Execution Prompt

**Document type:** Controlled execution charter (implementation planning slice)  
**Program:** WizField / PhoenixOS AI Phase 0 only  
**Work mode:** New Feature → **foundation slice** — follow [`docs/AI_WORKFLOW_RULES.md`](AI_WORKFLOW_RULES.md): owner-approved file lists before Protected Area edits, backend + frontend builds before merge.

---

## Purpose

Establish the **narrowest safe vertical** for AI in WizField:

- authenticated AI orchestration boundary in NestJS
- **approved tool registry** (whitelist only — no arbitrary DB from models)
- **context builder** caps and org isolation identical to CRM/Growth norms
- **proposal + audit persistence** suited to Brain/Copilot/Voice (**Voice-ready**, no realtime audio in Phase 0)
- **no product UX completion** obligation (Brains V1 consumes this in Phase 1)

Phase 0 is **architectural readiness + plumbing**, not Brain UI polish.

---

## Non-goals (must not creep)

| Non-goal | Rationale |
|----------|-----------|
| Realtime Voice, AI phone answering, streamed audio ingest | Scheduled for **Phase 1.5** pilot per master program |
| Telnyx/OpenAI Realtime/WebRTC coupling in repo | Allowed **only** if a discrete follow-on artifact proves a **minimal vendor-neutral** transport abstraction is unavoidable; default is **defer** |
| LLM narratives on `/home` (Business Brain UI) | **Phase 1** |
| Automated SMS/email send from AI | Phase 2+ with confirmation gates |
| Growth Center outbound publish automation | Forbidden by [Growth Center SoT](WizField_Growth_Center_Source_of_Truth.md) |
| Cross-tenant training, embeddings over raw tenant payloads | Forbidden |
| Bypassing SessionGuard / `dashboard.office.view` / CRM permission equivalents | Forbidden — see tenant truth in [WizField_Master_Source_of_Truth.md](WizField_Master_Source_of_Truth.md) |

---

## Locked architecture principles

1. **Org scope** from **`request.actor.organization_id`** (session truth) — never trust client-supplied org ids for AI context (Growth Center precedent).
2. **Tools call domain logic** implemented or reused inside existing Nest services/repositories behind the same filters as controllers — AI layer does not own new “god queries.”
3. **Writes:** Phase 0 may persist **audit/proposal/reco** rows only unless owner explicitly expands scope; production CRM mutations stay behind Phase 2+ gates.
4. **Voice-ready contract:** tooling and audit schemas accept `source_channel` (e.g. `ui \| api \| voice_pilot_future`) so Phase 1.5 does not require audit redesign.

---

## Proposed Nest module boundary (implementer fills exact paths post-approval)

| Concern | Responsibility |
|---------|----------------|
| `AiModule` (name TBD) | Imports `AuthModule`, registers controller(s), providers |
| `AiOrchestrationService` | Validates actor, caps context, invokes tool registry, invokes model provider adapter (stub ok in Phase 0) |
| `AiToolRegistry` | Maps string tool names → injectable handlers; **deny unknown names** |
| `AiContextBuilder` | Assembles bounded JSON context from tool outputs; PII tiering by role (align with marketing office patterns where applicable) |
| `AiAuditService` | Writes recommendation / proposal / outcome rows |
| `AiModelProvider` | Interface + **no-op or mock** implementation for Phase 0 CI; real provider behind env in later slice |

**Protected areas per AI_WORKFLOW_RULES:** `app.module` wiring, new dependencies in `package.json`, auth/routing — require explicit file list approval.

---

## Initial approved tool whitelist (Phase 0 — read-only)

Tools are **internal service methods** or thin facades that **delegate** to code paths equivalent to these existing routes.

| Tool id | Maps to (authoritative behavior) | Permission mirror | Notes |
|---------|-----------------------------------|-------------------|--------|
| `crm.office_dashboard_snapshot` | `GET /api/dashboard` — [`CrmController.getDashboard`](../backend/src/crm/crm.controller.ts) | `dashboard.office.view` | Primary Brain V1 signal source: summary, controls (quotes waiting approval, unpaid invoices, follow-ups, today’s jobs, recent completed), leads/jobs/technicians/services |
| `crm.technician_dashboard_snapshot` | `GET /api/technician/dashboard` | technician actor rules | Optional Phase 0 — only if Brain extends to tech |
| `telephony.call_reporting_summary` | `GET /api/call-reporting/summary` — [`CallReportingController`](../backend/src/telephony/call-reporting.controller.ts) | office telephony role gate | Windowed KPIs; complements dashboard for “missed / recovery” narratives |
| `search.office_search` | `SearchController` patterns — [`SearchService`](../backend/src/search/search.service.ts) | existing search guards | **Strict query length + result caps**; optional in Phase 0 if timeboxed |

**Explicitly out of Phase 0 whitelist:** marketing opportunity lists, messaging threads, portal mint — add only when Phase 1 scope demands and permissions are codified.

Implementers: each tool handler must accept `{ organizationId, actor }` derived from session and **refuse** if missing.

---

## Audit / proposal data model (sketch)

Author a migration + entities (owner-approved) following this intent:

### Table: `ai_recommendation_runs` (name TBD)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | |
| `organization_id` | UUID | tenant scope |
| `actor_profile_id` | UUID | who triggered |
| `source_channel` | enum/string | `ui`, `api`, reserved `voice` |
| `feature_key` | string | e.g. `brain_v1`, `copilot_draft` |
| `tool_trace_json` | JSON | ordered tool ids + version hashes / input summaries |
| `model_id` | string nullable | provider model label |
| `prompt_version` | string | template revision |
| `status` | enum | `completed`, `failed`, `refused` |
| `created_at` | timestamp | |

### Table: `ai_proposals` (name TBD)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | |
| `recommendation_run_id` | UUID FK | |
| `organization_id` | UUID | denormalized for safe listing |
| `proposal_kind` | string | `text_draft`, `action_card`, `voice_intake_placeholder` |
| `payload_json` | JSON | structured proposal (no secrets) |
| `grounding_refs_json` | JSON | entity ids + counts AI was allowed to see |
| `user_decision` | enum nullable | `accepted`, `rejected`, `edited_accepted`, `dismissed` |
| `decided_at` | timestamp nullable | |

**Voice-ready envelopes (Phase 0: schema + enums only, no runtime):**

Reserve `event_type` values for future append-only telephony AI events (separate table or JSON column), e.g.:

- `call_intake.summary`
- `call_intake.intent`
- `call_intake.structured_capture`
- `call_intake.handoff`

Document in entity comments; **do not implement ingest** in Phase 0.

---

## IAM parity checklist (must pass before merge)

- [ ] Every AI controller route uses `SessionGuard` (or stricter) consistent with CRM.
- [ ] `organization_id` resolved from actor; cross-org IDs in payloads rejected.
- [ ] Role matrix documented: Phase 0 operational testing as **dashboard-capable office roles only** unless expanded.
- [ ] Rate limit / abuse guard stub (middleware or interceptor) — can be no-op with TODO if owner accepts.

---

## Refusal & safety policy (orchestration)

- Refuse if org context missing.
- Refuse if tool not in registry.
- Refuse if estimated context payload exceeds caps (byte/token budget).
- Never return other organizations’ record bodies in error messages.
- Log failures to audit row with `status=failed` and safe error code (no stack to client in production).

---

## Rollout flags

- `AI_FOUNDATION_ENABLED` (or org-level feature flag table — owner choice in execution).
- Org kill-switch to force **tools-only deterministic health** endpoint without LM.

---

## Observability & minimum eval harness

- Structured log: `ai.run.start`, `ai.run.end`, `ai.tool.invoke` with org id + run id (no PII blobs).
- Directory e.g. `backend/src/ai/evals/` with **fixture JSON** (synthetic aggregates) + script that validates tool output shape **without** calling external LLM.
- Optional: contract test that tool outputs match Zod/type schemas shared with frontend later.

---

## Acceptance criteria (Phase 0 “done”)

1. Backend builds; migration applies; schema verify passes if entities added.
2. At least one authenticated endpoint (e.g. `POST /api/ai/health` or `/api/ai/tools/dry-run`) proves session + org + registry wiring.
3. Dry-run executes **whitelisted** tool(s) and persists an `ai_recommendation_runs` row (model may be mock).
4. Documentation: this file cross-linked from a one-line note in master SoT **only if** owner requests — default: keep AI docs as addendum set.

---

## Recommended implementation order (inside Phase 0)

1. Module skeleton + registry interface + mock model provider.
2. Single tool: `crm.office_dashboard_snapshot` wired to shared service logic (extract from controller if needed to avoid duplication).
3. Audit tables + write path.
4. Caps + refusals + logging.
5. Eval harness smoke (npm script optional).

---

## References

- [WizField_Master_Source_of_Truth.md](WizField_Master_Source_of_Truth.md)
- [WizField_Growth_Center_Source_of_Truth.md](WizField_Growth_Center_Source_of_Truth.md)
- [WizField_Language_Store_Source_of_Truth.md](WizField_Language_Store_Source_of_Truth.md) — confirmation / snapshot discipline
- [AI_WORKFLOW_RULES.md](AI_WORKFLOW_RULES.md)
- Customer portal staff mint (for future Copilot context only): [`CustomerPortalStaffController`](../backend/src/customer-portal/customer-portal.staff.controller.ts)
