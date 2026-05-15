> **Status: HISTORICAL** — Superseded by `docs/WizField_AI_Master_Source_of_Truth.md` and
> `docs/WizField_AI_Engineering_Closeout_and_Gap_Register.md`. Preserved for audit trail only.

# WizField AI — Phase 2 Operator Copilot (Calls) Execution Prompt

**Document type:** Controlled execution charter (implementation planning + sequencing)  
**Program:** WizField AI Phase 2 — Operator Copilot, first bounded slice  
**Work mode:** New Feature — follow [`docs/AI_WORKFLOW_RULES.md`](AI_WORKFLOW_RULES.md): owner-approved file lists before Protected Area edits; backend + frontend builds before merge.

**Status:** Implementation complete — execution followed this prompt; see docs/WizField_AI_Phase2_Verification_Matrix.md for verification evidence.

---

## Alignment (mandatory reading)

- [`docs/WizField_Master_Source_of_Truth.md`](WizField_Master_Source_of_Truth.md)
- [`docs/WizField_AI_Phase0_Foundation_Execution_Prompt.md`](WizField_AI_Phase0_Foundation_Execution_Prompt.md)
- [`docs/WizField_AI_Brain_V1_Home_Intelligence_SPEC.md`](WizField_AI_Brain_V1_Home_Intelligence_SPEC.md)
- [`docs/WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md`](WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md) / [`docs/WizField_AI_Phase1.5B_Execution_Prompt_Telnyx_Assistant_Bridge.md`](WizField_AI_Phase1.5B_Execution_Prompt_Telnyx_Assistant_Bridge.md)
- [`docs/WizField_AI_Sales_Enablement_Risk_Register.md`](WizField_AI_Sales_Enablement_Risk_Register.md)
- [`docs/OWNER_FEATURE_CHECKLIST_EN.md`](OWNER_FEATURE_CHECKLIST_EN.md)

**Does not reopen:** Phase 0 orchestration semantics, Phase 1 Brain rules, Phase 1.5A/1.5B `call_intake.*` contract — **extend only** (new `feature_key`s, new services). **Do not** change Telnyx hybrid CRM validation or webhook upsert logic except where strictly additive and approved.

---

## 1. Locked owner decisions (authoritative)

### 1.1 Data model — `ai_operator_drafts`

**Decision:** Use a **dedicated mutable persistence model** named **`ai_operator_drafts`** for the operator-facing draft lifecycle.

**Final rule:**

- **`ai_operator_drafts`** = mutable product object: create on generate, update on edit, dismiss state, optional future list of open drafts.
- **`ai_recommendation_runs`** = **AI generation audit / telemetry only** (immutable-ish run log, `tool_trace_json`, provider/model metadata).

**Forbidden:** Using **`ai_recommendation_runs`** as the **primary** store for editable Copilot draft text or operator review state.

### 1.2 LLM posture — LLM-capable, fallback-safe

**Decision:** Phase 2 is **LLM-capable** but **fallback-safe**.

- **Architecture:** Support LM-backed draft generation only when **`AI_COPILOT_LLM_ENABLED`** resolves true (same boolean parsing contract as existing AI env helpers: true / 1 / yes / on).
- **Execution split (mandatory in code paths):**
  - **Path A — Deterministic / template fallback:** Always implemented; safe when model is off, unavailable, refuses, or errors; **no fabricated customer facts**.
  - **Path B — Live model-backed generation:** Invoked only when foundation + Copilot + LLM flags allow and invoker is configured; output still bounded, org-scoped, and subject to limitations JSON surfaced to the UI.
- **Boundary:** Do **not** expand Phase 0 into a broad model-infrastructure program. Only **small additive** changes to AI module (e.g. one invoker call + caps + error mapping) are in scope if strictly required for this slice.

### 1.3 CSR access — `/calls` frontend / backend alignment

**Mismatch (repo truth today):**

- **Backend** [`RecentCallsController`](../backend/src/telephony/recent-calls.controller.ts): any role with **`calls.view`** may list recent calls (`isTelephonyOfficeRole` → `roleHasPermission(..., "calls.view")`).
- **Frontend** [`frontend/app/calls/page.tsx`](../frontend/app/calls/page.tsx): **`requireServerRoles("/calls", ["owner", "office_admin", "dispatcher"])`** — **excludes `csr` and `admin`** even though **`csr`** (and **`admin`**, **`owner`**, **`office_admin`**, **`dispatcher`**) hold **`calls.view`** per [`permissions.ts`](../backend/src/auth/permissions.ts).

**Locked product rule:**

- Any role with **`calls.view`** may access **`/calls`** in the frontend and use **Phase 2 Calls Copilot**, subject to Copilot feature flags.
- **CSR is included.**
- **Viewer** does **not** have **`calls.view`** in the current role map — **viewer is not included** for generate/edit Copilot (and cannot pass backend telephony gates).

**Smallest safe alignment package (P0):**

- Replace the hardcoded **`requireServerRoles`** allowlist for **`/calls`** with a gate equivalent to **`session.permissions.includes("calls.view")`** (after successful session load), redirecting to the same destinations as today when denied.
- Do **not** weaken backend guards; **mirror** them on the server-rendered route.

### 1.4 Phase 2 Calls Copilot UX (first slice)

The first implementation slice **must** support:

1. **Generate** — customer SMS follow-up draft from trusted **`recent_calls`** + **`call_intake.*`** context (and linked voice audit trace when present).
2. **Edit** — operator can change draft text in UI; server persists updates to **`ai_operator_drafts`**.
3. **Copy** — operator can copy **current** draft text to clipboard (client-side).
4. **Dismiss** — operator can discard the draft (persisted dismissed state).

**Explicitly out of this slice:**

- **No** “Send SMS” button, **no** messaging prefill route, **no** automatic SMS/email/customer-facing execution.
- **Messaging prefill / guarded send handoff** = **later package** only, with separate approval and **`messaging.send`** gates.

---

## 2. Product definition (Phase 2 slice)

**Thesis:** WizField turns **trusted CRM call context** and **normalized voice intake** into **reviewable operator drafts**; **humans** control all customer-facing action.

**First workflow:** Post-call **customer SMS follow-up draft** on **`/calls`**, with **safe limitations** when intake is incomplete or **artifact-only** (hybrid CRM).

---

## 3. `ai_operator_drafts` — product-level contract

Implementers translate this into a migration + TypeORM entity after file-list approval. Columns are **contractual intent**, not final DDL names (keep consistent with repo naming conventions).

| Field (conceptual) | Purpose |
|--------------------|--------|
| `id` | UUID PK |
| `organization_id` | Tenant scope; matches session active org |
| `actor_profile_id` | Staff member who owns the session (NOT NULL for operator drafts in this slice) |
| `recent_call_id` | Source `recent_calls.id` (required for v1 SMS draft) |
| `draft_type` | e.g. `customer_sms_followup_v1` |
| `status` | `active` \| `dismissed` (extend later if needed) |
| `generated_body` | Snapshot of model/template output at generation time |
| `edited_body` | Nullable; when set, represents operator’s latest text; **effective body** = `edited_body ?? generated_body` |
| `recommendation_run_id` | Nullable FK → `ai_recommendation_runs.id` — links to the **telemetry row** for that generation |
| `limitations_json` | Array/object of safe limitation codes + human-readable hints (e.g. `artifact_only_intake`, `no_matched_customer`, `minimal_transcript`) |
| `prompt_version` | Template/prompt revision for Path A / B |
| `model_id` | Nullable; set when Path B succeeds |
| `dismissed_at` | Nullable |
| `created_at`, `updated_at` | Lifecycle |

**Indexes (intent):** `(organization_id, recent_call_id, draft_type)` for idempotent “one active draft per call per type” policy (exact uniqueness rules in implementation spec).

---

## 4. Relationship: `ai_operator_drafts` ↔ `ai_recommendation_runs`

```text
On Generate:
  1) Persist ai_recommendation_runs row:
     - feature_key: new constant e.g. operator_copilot_calls_sms_v1
     - source_channel: ui (staff)
     - actor_profile_id: from session
     - tool_trace_json: grounding digest, bounded context refs, path indicator (template vs llm), limitations, error codes if fallback
     - status: completed | failed | refused
  2) Persist ai_operator_drafts row:
     - generated_body (+ optional edited_body)
     - recommendation_run_id → FK to step 1
```

- **Runs** answer: “What did the AI layer do, with what inputs, under what flags?”
- **Drafts** answer: “What is the operator working on, now?”

**Webhook/system runs** (1.5B voice) remain **`actor_profile_id` NULL** on runs; **operator Copilot runs** always set a **real_profile** on runs and **NOT NULL** `actor_profile_id` on drafts.

---

## 5. Feature flags (environment)

All Copilot gates assume **`AI_FOUNDATION_ENABLED`** is already used as the parent AI gate (403 `ai_foundation_disabled` pattern per existing controllers).

| Variable | Purpose |
|----------|--------|
| `AI_OPERATOR_COPILOT_ENABLED` | Master Phase 2 Copilot gate for authenticated Copilot endpoints |
| `AI_COPILOT_CALLS_SURFACE_ENABLED` | Narrows to `/calls`-scoped APIs and UX affordances |
| `AI_COPILOT_CUSTOMER_SMS_DRAFT_ENABLED` | First workflow only |
| `AI_COPILOT_LLM_ENABLED` | Path B: allow live model invoker; when false, only Path A |

**Ordering:** Parent foundation → `AI_OPERATOR_COPILOT_ENABLED` → surface → workflow → optional LLM.

---

## 6. Roles and permissions

| Capability | Backend |
|------------|---------|
| **View `/calls` and call list** | Existing: `calls.view` (telephony office role check) |
| **Generate / load / save / dismiss Copilot draft** | **`calls.view`** + Copilot flags (same as intake envelope dry-run pattern in [`AiCallIntakeService`](../backend/src/ai/ai-call-intake.service.ts)) |
| **Future send / prefill** | **Not in this slice.** Later: **`messaging.send`** via existing [`MessagingAccessService`](../backend/src/messaging/messaging-access.service.ts) |

**Viewer:** No `calls.view` — **no** Copilot generate/edit.

---

## 7. Deterministic vs LM-enabled behavior

### Path A — Deterministic / template fallback (required)

- **Always shipped first** in the implementation order inside the generation service.
- Input caps: reuse [`AI_MAX_SERIALIZED_TOOL_OUTPUT_BYTES`](../backend/src/ai/ai.constants.ts) discipline for serialized context.
- Build context from:
  - `recent_calls` columns (summary, sentiment, matched ids, voicemail transcription, Telnyx fields when present).
  - Reconstruct or fetch **`call_intake.*`** sections using existing helpers: [`buildCallIntakeEnvelopeSectionsV0`](../backend/src/ai/call-intake-contract.v0.ts) and/or [`buildCallIntakeEnvelopeSectionsVoiceV1`](../backend/src/ai/call-intake-voice-normalizer.v1.ts) when `ai_provider` indicates voice bridge.
  - Optional: read latest `ai_recommendation_runs` for `feature_key = call_intake_voice_telnyx_v1` and same `recent_call_id` for `hybrid_crm` / **artifact_only** hints (**read-only**).
- Output: short SMS-length draft + **limitations** — never claim booking confirmation, price, or guaranteed appointment (align with Phase 1.5B policy).

### Path B — LM-enabled generation (optional per env)

- When **`AI_COPILOT_LLM_ENABLED`** and invoker configured: call existing [`AiModelInvoker`](../backend/src/ai/ai-model-invoker.ts) (or thin wrapper) with **strict refusal** on oversized context, **no secrets**, **structured output** expectation (plain text body + optional bullet limitations).
- On **any** model failure, timeout, or policy refusal → **fall back to Path A** and set run `status` / `error_code` accordingly (telemetry must not pretend LM succeeded).

**Non-goal:** New provider abstraction, fine-tuning pipeline, or multi-tenant prompt store — minimal wiring only.

---

## 8. API surface (intent — implementer defines exact routes after approval)

Suggested REST shape (under `SessionGuard`, JSON):

- `POST /api/ai/copilot/calls/sms-draft/generate` — body: `{ recentCallId }` → creates **run** + **draft** (or returns existing active draft per product idempotency rules).
- `GET /api/ai/copilot/calls/sms-draft?recentCallId=` — load active non-dismissed draft for call.
- `PATCH /api/ai/copilot/calls/sms-draft/:draftId` — body: `{ editedBody }` — **calls.view** only; org scope enforced.
- `POST /api/ai/copilot/calls/sms-draft/:draftId/dismiss` — soft-dismiss.

All handlers: **`organization_id` from actor**; validate **`recent_call_id`** belongs to org (reuse [`recentCallBelongsToOrgSql`](../backend/src/telephony/telephony-org-scope.ts) / patterns from [`AiCallIntakeService`](../backend/src/ai/ai-call-intake.service.ts)).

---

## 9. UX surface — exact first location

**Primary:** [`frontend/app/calls/page.tsx`](../frontend/app/calls/page.tsx) recent-calls experience (ledger / hybrid / grid): **per-row** or **row-expanded** Copilot panel:

- Buttons/actions: **Generate draft**, **Edit** (textarea or inline), **Copy**, **Dismiss**
- Show **limitations** chips or inline text from API
- **No** Send button

Use **client component** islands as needed; keep server page aligned with **`calls.view`** gate.

---

## 10. Implementation packages, protected areas, and risk

| Package | Scope | Likely files | Risk |
|---------|--------|----------------|------|
| **P0** | Frontend **`/calls` gate** aligns with `calls.view`; no Copilot yet | [`frontend/lib/auth/server-session.ts`](../frontend/lib/auth/server-session.ts) (optional helper), [`frontend/app/calls/page.tsx`](../frontend/app/calls/page.tsx) | **Low** — behavior change for CSR/admin accessing `/calls` |
| **P1** | Migration + `AiOperatorDraftEntity`; `ai.constants` + `ai-environment` flag resolvers; service: generate/save/dismiss | `backend/src/database/migrations/active/*`, `backend/src/database/entities/*`, [`ai.module.ts`](../backend/src/ai/ai.module.ts), new service | **Medium** — DB + module wiring |
| **P2** | [`ai.controller.ts`](../backend/src/ai/ai.controller.ts) routes; integration with invoker for Path B | Controller, service, tests | **Medium** — auth + caps + no PII leaks |
| **P3** | Frontend Copilot UI + API client helpers | `frontend/app/calls/*`, `frontend/lib/api/*` | **Low/Medium** |
| **P4** | Verification doc + smoke/contract tests (no-send assertion) | `docs/*`, `backend/src/database/*smoke*` or new test | **Low** |

**Protected / high-risk — avoid or minimize:**

- [`telnyx-webhook.service.ts`](../backend/src/telephony/telnyx-webhook.service.ts), [`voice-intake-post-call.service.ts`](../backend/src/telephony/voice-intake-post-call.service.ts) — **read-only** consumption only unless owner approves an additive change.
- Messaging send paths — **zero imports** from Copilot service in P1–P3.
- [`permissions.ts`](../backend/src/auth/permissions.ts) — change only if adding a helper export is truly needed; prefer **`calls.view`** as gate.

---

## 11. Verification expectations and negative tests

**Must pass:**

- Backend / frontend **build**
- Existing [`telephony-messaging:isolation:smoke`](../backend/src/database/telephony-messaging-org-isolation-smoke.ts) (Phase 1.5B regression)
- **Org isolation:** `recentCallId` from another org → **403/404**; draft rows never returned cross-tenant
- **Role:** user without `calls.view` → **403** on Copilot endpoints
- **CSR:** can hit **`/calls`** and Copilot when flags on (after P0)
- **Viewer:** still cannot access telephony list (no `calls.view`)
- **No-send:** static check or grep/CI assertion — Copilot module does **not** call `TxtService.sendMessage`, `sendCustomerText`, or equivalent
- **Path A only** (LLM off): coherent template output + limitations for **artifact_only** / missing customer match
- **Path B** (LLM on, where configured): successful run records `model_id`; forced failure falls back to Path A without throwing 500 to client
- **Dismiss:** GET no longer returns dismissed draft as active

---

## 12. Explicit non-goals (Phase 2 slice)

Autonomous SMS/email; customer-facing send without **separate** human-controlled send flow; booking/job create/reschedule/cancel; invoice/estimate/pricing mutation; dirty lead creation; weakening CRM validation; cross-org assistant; new second AI intake schema; Growth Center autopublish; Lily/global chat shell; broad AI Control Center refactor; messaging prefill (until later approved package).

---

## 13. Acceptance criteria (Phase 2 coding “done” for this prompt)

1. **`ai_operator_drafts`** entity + migration applied; **`recommendation_run_id`** nullable FK to **`ai_recommendation_runs.id`** populated when a Copilot generation run is persisted; new **`feature_key`** constant for Copilot generation runs.
2. Flags + guards: foundation → Copilot → calls → SMS draft → optional LLM.
3. **`/calls`** frontend gate matches **`calls.view`** (CSR included).
4. UX: **Generate, Edit, Copy, Dismiss** with **no Send**.
5. Verification rows in §11 satisfied and documented in a Phase 2 verification matrix (owner may request `docs/WizField_AI_Phase2_Verification_Matrix.md` as follow-on).

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-15 | Initial execution prompt: locked `ai_operator_drafts`, LLM+fallback, CSR/`calls.view` alignment, Calls Copilot UX, packages, verification |
