# WizField AI — Phase 1.5B Live Voice Intake (Telnyx AI Assistants)

**Status:** Planning (not implementation)  
**Builds on:** Closed Phase 0, Phase 1 Business Brain V1, Phase 1.5A Voice Intake Foundation (`call_intake.*` contract, `ai_recommendation_runs`, dry-run envelope)  
**Does not reopen:** Phase 0, Phase 1, or Phase 1.5A semantics (extend only; no competing intake schema)

---

## Alignment (mandatory reading)

- `docs/WizField_Master_Source_of_Truth.md`
- `docs/WizField_Engineering_Closeout_and_Verification.md`
- `docs/WizField_AI_Phase0_Foundation_Execution_Prompt.md`
- `docs/WizField_AI_Brain_V1_Home_Intelligence_SPEC.md`
- `docs/WizField_AI_Sales_Enablement_Risk_Register.md`
- `docs/WizField_Growth_Center_Source_of_Truth.md`
- `docs/WizField_Language_Store_Source_of_Truth.md`
- `docs/AI_WORKFLOW_RULES.md`
- `docs/OWNER_FEATURE_CHECKLIST_EN.md`

---

## 1. Locked owner decisions

### 1.1 Product channel — phone AI only

**In scope**

- Inbound phone calls answered by a **Telnyx AI Assistant**

**Out of scope for Phase 1.5B**

- Website embed / widget, browser mic assistant, web chat, floating assistant UX (Telnyx widget may be later)

### 1.2 Live runtime — Telnyx AI Assistants (native)

Preferred flow:

```text
Inbound call
→ existing WizField Telnyx webhook flow
→ DID resolves active organization
→ WizField checks live voice pilot eligibility
→ assigned Voice Flow for inbound owned number (per catalog assignment)
→ Voice Flow Catalog lookup (flow_id → telnyx_assistant_id)
→ Telnyx Assistant ID resolution
→ WizField starts Telnyx AI Assistant on the active call (ai_assistant_start)
→ Telnyx Assistant handles conversation
→ Telnyx webhooks / tools return outcome data
→ WizField normalizes into existing Phase 1.5A call_intake.* contract
```

**Attach path (spike vs canonical):** The **product path** is **`answer` if required → `ai_assistant_start`** with **`assistant.id`** + **`assistant.dynamic_variables`** (see §5). **Original spike PASS:** **`answer`** with embedded **`assistant`**. **`ai_assistant_start` parity (micro-test B):** owner-recorded **PASS** (runbook header)—canonical Call Control step is **spike-validated** alongside the sibling **`answer`** path; **option A** not required.

**Do not** default to a custom speak/gather conversation engine, **OpenAI Realtime** as default, or a second telephony provider voice stack.

### 1.3 Autonomy — availability signal only, not booking

**Allowed:** intake, clarifying questions, **`get_availability`** tool, **non-binding** language (“possible availability… team will confirm”).

**Forbidden:** confirmed appointments, reserved slots, guaranteed times, job create/reschedule/cancel in CRM, finalized bookings on the call.

### 1.4 Storage — text-first

Prioritize: transcript text (if available via assistant/insights), summary, structured intake, availability-check outcome, Telnyx conversation IDs, normalized `call_intake.*`, AI audit trace.

Default **not** to store raw audio in WizField; provider recording references are metadata only unless explicitly approved later.

### 1.5 CRM — lead-ready handoff without polluting CRM

**Policy — hybrid (recommended):**

1. **Auto-create a Lead** only when capture satisfies existing **[`parseCreateLeadPayload`](backend/src/crm/validation.ts)** semantics **without** fake placeholders (address, postal, service type, etc.).
2. **Otherwise** persist a **reviewable voice intake artifact** on the call (`recent_calls` AI fields + `ai_recommendation_runs.tool_trace_json` + `recent_call_activity_events`), for staff to complete a Lead cleanly.

**Never:** create Jobs in 1.5B; weaken CRM validation to force Leads.

---

## 2. Executive verdict

- **Bounded package — yes:** Inbound path, Call Control client, `recent_calls`, and Phase 1.5A envelope keys already exist in repo.
- **Telnyx spike mandatory before coding:** Raw payloads for conversation `ended` / **insights generated**, transcript location (`ended.messages[]` vs optional Messages API vs insights), **`ai_assistant_start` parity**, `client_state` behavior, and webhook-tool signing were captured from the real account prior to Phase 1.5B code — ticket holds detail; repo holds summaries in [`docs/WizField_AI_Phase1.5B_Telnyx_Spike_Runbook.md`](WizField_AI_Phase1.5B_Telnyx_Spike_Runbook.md).
- **Spike closeout (owner-recorded):** **Micro-test B** (**`ai_assistant_start`** parity) **PASS**; **LLM key handling** (Amber: Integration Secret vs account default, operational posture) **PASS** — runbook §14 checklist / header rollup (`LLM key handling`).
---

## 3. Current repo truth (summary)

| Area | Grounding |
|------|-----------|
| Inbound | `TelnyxWebhookService.processWebhook` — `call.initiated` → `recent_calls`, `resolveRecentCallSource`, then `executeInitialCallFlow` → `TelephonyExecutionService.runInitialFlow` |
| Call Control | `TelephonyExecutionService.executeCallControlAction` → `POST https://api.telnyx.com/v2/calls/{call_control_id}/actions/{action}` (supports `ai_assistant_start`) |
| Twilio in repo | Messaging webhook only — not inbound voice orchestration |
| `recent_calls` | `ai_*` columns, `voicemail_transcription`, `raw_payload_snapshot`, `inbound_owned_phone_number_id`, lifecycle timestamps |
| Telemetry | `recent_call_activity_events` table (used from telephony) |
| Phase 1.5A | `RESERVED_VOICE_INTAKE_AI_EVENT_KEYS`, `buildCallIntakeEnvelopeSectionsV0`, `ai_recommendation_runs`, `resolveAiVoiceIntakeFoundationEnabled` |
| Gap | After `call.initiated`, non-init events such as **`call.conversation.*`** are not first-class (today many become `unsupported_event_type`); no `get_availability` API yet; no packaged scheduling “free slot” engine (only `jobs` + business hours heuristics) |
| Audit | `AiRecommendationRunEntity.actor_profile_id` is **required** — webhook runs need an owner decision (nullable + rules, service actor, or alternate store) |

---

## 4. Product definition (one paragraph)

Phase 1.5B is **phone-only**: on **allowlisted** inbound DIDs, after **authoritative** DID→org resolution, WizField resolves the **assigned Voice Flow** for that owned number from the **Voice Flow Catalog** (plan-gated), **starts** the mapped **Telnyx AI Assistant**, runs **bounded intake** with optional **non-binding** **`get_availability`**, ingests **text-first** Telnyx outcomes, maps to **existing `call_intake.*` sections** (bump normalizer/trace versions when needed), applies **hybrid CRM** (clean auto-Lead only when validation passes; else reviewable artifact), and **falls back** to the **classic** telephony path when pilot is off or assistant start fails.

### 4.1 Voice Flow Catalog (product model)

WizField’s voice product is **catalog-driven**, not “one magic assistant id in config” as the long-term model.

- **Official assets in Telnyx:** Eden / WizField operators create and maintain **approved** Telnyx AI Assistants (and any Telnyx-side flow/workflow configuration) in the WizField Telnyx account.
- **Customer-facing abstraction:** WizField exposes these as **approved Voice Flows** in product copy and tenant configuration—not raw Telnyx assistant IDs shown as the primary UX.
- **Entitlement:** Using live voice is **plan-gated** (see §10 rollout gates); customers with the right plan may assign a Voice Flow to a number.
- **Selection + assignment:** A customer chooses a **Voice Flow** for an **owned inbound phone number**. That assignment resolves **server-side** to a **`telnyx_assistant_id`** at `ai_assistant_start`.
- **Tenant customization:** Customer-specific instructions and configuration are injected **only** through **`dynamic_variables`** and **approved runtime overrides** (e.g. per-call `instructions`/`greeting` where policy allows)—never by giving tenants ad hoc access to Telnyx assistant consoles.
- **Ownership split:** **Telnyx** owns the assistant/flow **runtime and workflow engine**. **WizField** owns **entitlement**, the **Voice Flow Catalog**, **org/number assignment**, **variables and override policy**, the **tool bridge**, and **post-call CRM sync**.

**First catalog entry (Phase 1.5B):**

| Internal `flow_id` | Customer-facing title | Phase 1.5B |
|--------------------|----------------------|------------|
| `amber_schedule_availability_intake` | **Amber — Schedule / Availability Intake** | **Only active Voice Flow** (additional rows may exist later; data model and code paths must be **catalog-ready**) |

Phase 1.5B **may ship with a single selectable flow**, but implementation must follow **`flow_id` → assistant mapping + per-number assignment**, not a one-off hardcoded integration path that bypasses the catalog.

**Customer boundary (explicit):**

- Customers **do not** create their own Telnyx assistants.
- Customers **do not** need Telnyx accounts to use WizField Voice Flows.
- **WizField centrally manages** the approved Voice Flow catalog and which Telnyx assistant each catalog entry maps to.

---

## 5. Runtime architecture

1. **`call.initiated`** — unchanged verification and `recent_calls` create.
2. Pilot **off** → `executeInitialCallFlow` (existing IVR/voicemail).
3. Pilot **on** → `answer` if required → resolve **assigned Voice Flow** for the inbound owned number (and eligibility) → resolve **`telnyx_assistant_id`** from **Voice Flow Catalog** for that flow → **`ai_assistant_start`** with **`assistant.id`**, **`assistant.dynamic_variables`** (per Telnyx `CallAssistantStartRequest` / `CallAssistantRequest`; not a root-level `dynamic_variables` field), and optional per-call `instructions`/`greeting` overrides built **only** from resolved org + customer configuration server-side; optional **`client_state`** for webhook/tool correlation (**spike defines encoding**).

   **Telnyx spike parity:** Live **PASS** on **`POST .../actions/answer`** with embedded **`assistant`** (original spike) **and** on **`ai_assistant_start`** after **`answer`** (**micro-test B — PASS**, runbook). **`ai_assistant_start`** remains the canonical §5 step; both paths validated on owner stack.

4. **`get_availability`** — Telnyx webhook tool → WizField signed endpoint bound to **`recent_call_id`/org**.
5. **Post-call:** handle **`call.conversation_insights.generated`** (rich payload — **summary** path confirmed in spike; do not assume full verbatim transcript lives only in insights) and **`call.conversation.ended`** (lifecycle; spike observed **full `messages[]`** in webhook); idempotent ingestion; normalize to `call_intake.*` + `ai_recommendation_runs`; hybrid CRM outcome. **Conversation Messages API** remains a validated **parallel / reconciliation** channel; spike does **not** assert a follow-up GET is **strictly required** when **`ended.messages[]`** suffices.

**Fallbacks**

- **`ai_assistant_start` fails** → log → `executeInitialCallFlow`.
- **Insights delayed/missing** → partial persist + reason codes in `handoff` (policy from spike).

---

## 6. Voice Flow Catalog resolution, assistant identity, and dynamic variables

**Catalog mapping:** The **Voice Flow Catalog** stores **`flow_id` → `telnyx_assistant_id`** (and metadata as needed). Operators capture the Telnyx assistant id when Eden provisions the assistant; WizField is the system of record for which id each approved flow uses.

**Phase 1.5B bootstrap:** The catalog may be **seeded with a single row** (Amber). A **pilot** may load that mapping via migration, seed, or env **only as bootstrap**—the **documented product architecture** remains **catalog + per-number Voice Flow assignment**, not a permanent reliance on “one template assistant ID from env” as the source of truth.

**Per-call injection:** For the resolved flow, assemble **`assistant.dynamic_variables`** (nested on the **`ai_assistant_start`** body per Telnyx `CallAssistantRequest`) and any **approved** `instructions`/`greeting` overrides **server-side** from the resolved org and **customer-specific configuration** allowed for that flow (tenant-safe). **Spike truth:** nested **`assistant`** shape proven on **`answer`** (embedded) **and** on **`ai_assistant_start`** (**micro-test B PASS**).

**Minimal variable set (not exhaustive dump):**

- `organization_display_name`
- `business_hours_human_summary` (from call flow settings / org text)
- `service_areas_short`
- `bookability_policy_strict` (no confirmed booking on call)
- `availability_language_script` (safe phrasing)
- `escalation_safety_clause` (emergency → flag team; no dispatch claims)
- Optional `approved_service_types_hint` aligned with CRM enums

**Graduate later:** New behaviors or variants ship as **additional catalog entries** (or tightly scoped approved overrides)—not ad hoc **per-customer** Telnyx assistant sprawl outside the central catalog.

---

## 7. `get_availability` tool (v0)

**Purpose:** Read-only **heuristic** signal for the assistant — **never** book or return guaranteed slots.

**Inputs (conceptual):** Correlation to `recent_call`/org (from signed context, not caller); optional `service_type` enum; coarse `requested_window` (start/end ISO).

**Outputs (conceptual):**

- `availability_signal`: `unknown | likely_open | likely_busy | conflicting_data`
- `coarse_hints`: vague labels only (e.g. “weekday mornings”)
- `disclaimer`: mandatory non-binding string
- `data_source`: e.g. `jobs_scheduled_histogram_v0`
- **`bookable_slots`: []** (empty in 1.5B)

**Implementation note:** Use org-scoped **`jobs`** density + [`CallFlowSettingsService.evaluateActiveCallFlow`](backend/src/telephony/call-flow-settings.service.ts)-style **open/closed** context — not a real capacity optimizer.

---

## 8. Post-call webhook ingest

- **Add routing** in `TelnyxWebhookService` for conversation **insights** and **ended** before generic `unsupported_event_type`.
- **Insights** → anchor **summary** and rich fields (**spike:** summary present; **not** assumed as sole full verbatim transcript).
- **Ended** → lifecycle / status; **`messages[]` thread observed in spike** (primary in-webhook text source); may arrive before or after insights.
- **Conversation Messages API** → optional **parallel** retrieval for redundancy / reconciliation (spike **PASS**); **not** framed as mandatory solely because webhooks exist.
- **Dedupe:** Telnyx event id and/or `(conversation_id, event_type)` — mirror patterns used for `provider_event_id` uniqueness.
- **Ordering:** support out-of-order delivery; finalize normalization when minimum fields exist or on timeout policy (spike-driven).

---

## 9. Telnyx output → `call_intake.*` mapping

Reuse keys only: `call_intake.summary`, `call_intake.intent`, `call_intake.structured_capture`, `call_intake.handoff` ([`ai.constants.ts`](backend/src/ai/ai.constants.ts)).

Add a **voice-assistant normalizer** (new version bump) that fills the same keys with richer objects; **do not** introduce a parallel top-level envelope type.

**Spike locks:** exact JSON paths for **summary**, **`ended.messages[]`** (transcript/thread), **`conversation_id`**, tool traces; **intent** / structured / handoff paths remain normalizer/fixture unless ticket proves stable native fields.

---

## 10. Feature flags / rollout

Nested gates, **default deny:**

1. `AI_FOUNDATION_ENABLED`
2. `AI_VOICE_INTAKE_FOUNDATION_ENABLED`
3. `AI_VOICE_INTAKE_LIVE_PILOT_ENABLED` (new)
4. **Per-org + per-owned-number allowlist** (e.g. env CSV of `inbound_owned_phone_number_id` or smallest DB field), with **each pilot number having an assigned Voice Flow from the catalog** (Phase 1.5B: effectively Amber once live pilot is enabled for that number).

Never route all inbound traffic to AI without explicit allowlist.

---

## 11. Storage / schema

- **Prefer:** `recent_calls` AI columns + `recent_call_activity_events` + `ai_recommendation_runs.tool_trace_json`
- **Migration:** only if payload size/indexing forces it (e.g. dedicated nullable JSON on `recent_calls`)
- **Audio:** not default in WizField

---

## 12. Minimal UX

- Backend-first is valid for first pass.
- **Recommend** a small **Calls / recent call** read-only panel for voice intake summary + `crm_outcome` when API already exposes or can expose `ai_summary` / trace pointers without large FE refactors.

---

## 13. Safety / script posture (Risk Register)

**May:** capture request, check possible availability, defer exact details to team, pass request along.  
**Must not:** “You are booked,” guaranteed slot, pricing/warranty/legal/safety guarantees, human impersonation.  
**Emergencies:** flag for team; do not act as emergency dispatch.

---

## 14. Telnyx spike checklist (before execution prompt)

See **`docs/WizField_AI_Phase1.5B_Telnyx_Spike_Runbook.md`** for spike procedure and evidence. **Recorded PASS (summary):** **`ended`** **`messages[]`**, Conversation Messages API (parallel), dynamic variables A/B, webhook tool — initial path **`answer`**+embedded **`assistant`**. **Micro-test B** (`ai_assistant_start` parity): **PASS**. **LLM key handling (Amber):** **PASS** (ticket; no secrets in repo).

1. Provision the Amber Telnyx assistant; record **`assistant.id`** and capture it in the **Voice Flow Catalog** mapping (**`amber_schedule_availability_intake` → Telnyx id**), even if the catalog is initially a single seeded row.
2. **`ai_assistant_start` parity — micro-test B:** **PASS** (owner live run; ticket evidence) — same criteria as runbook header (**DV**, tool hit, **insights** + **ended**).
3. Capture raw evidence (ticket): **`call.conversation.ended`**, **`call.conversation_insights.generated`** (exact event names per account/API version); **do not** commit raw payloads to repo.
4. Confirm **transcript/thread** sources: **`ended.messages[]`** (spike observed) vs insights-only vs Conversation Messages API (parallel optional hardening—not spike-mandatory if `messages[]` suffices).
5. Validate **`dynamic_variables`** at runtime (two-org isolation smoke).
6. Configure **webhook tool** to stub/safe endpoint; verify **auth/signature** headers and timeouts — procedure: [`docs/WizField_AI_Phase1.5B_Telnyx_Spike_Webhook_Tool_Prep.md`](WizField_AI_Phase1.5B_Telnyx_Spike_Webhook_Tool_Prep.md).
7. **LLM key** handling (**Integration Secret** vs **account default** for Amber): **PASS** — operational one-liner / Portal confirmation in **ticket**; **no secrets in repo**.

---

## 15. Files likely to change (if approved)

| Path | Purpose | Risk |
|------|---------|------|
| `backend/src/telephony/telnyx-webhook.service.ts` | Pilot branch; conversation/insights ingest | **high** |
| `backend/src/telephony/telephony-execution.service.ts` | `ai_assistant_start` / `stop` helpers | **high** |
| `backend/src/telephony/telephony.module.ts` | `forwardRef` AiModule; tool controller registration | **high** |
| New: Telnyx tool controller (e.g. `get_availability`) | Signed HTTP tool target | **high** |
| `backend/src/ai/*` | Flags, `feature_key`, `source_channel`, normalizer bridge | medium |
| Internal CRM helper | Hybrid Lead create (reuse validation) | medium |
| `frontend/app/calls/*` | Optional minimal intake panel | medium |
| Entity/migration + `schema-manifest.ts` | Only if DDL justified | medium |

---

## 16. Verification

- Spike fixtures archived in repo docs or ticket (payload JSON).
- Happy path: pilot DID → **assigned catalog Voice Flow** → mapped assistant → tool → insights → `call_intake.*` → audit row → hybrid CRM branch.
- Flag-off identical to baseline telephony path.
- Wrong-org / unmapped DID negative.
- Tool failure → safe `unknown` signal + wording.
- Idempotent duplicate insight events.
- `npm run build --workspace backend`; frontend/schema verify if touched.

---

## 17. Stop conditions (HOLD)

- Insights payloads insufficient for trustworthy normalization.
- Webhook tools cannot be secured against cross-org abuse.
- `ai_assistant_start` unreliable vs answer state → unsafe caller experience without proven fallback.
- Hybrid CRM would systematically create dirty Leads → restrict to artifact-only pending policy revision.

---

## 18. Next step

**Done (2026-05-15):** Execution prompt delivered end-to-end (P1–P4). Consolidated verification: [`WizField_AI_Phase1.5B_Verification_Matrix.md`](WizField_AI_Phase1.5B_Verification_Matrix.md) · execution prompt P4 closeout: [`WizField_AI_Phase1.5B_Execution_Prompt_Telnyx_Assistant_Bridge.md`](WizField_AI_Phase1.5B_Execution_Prompt_Telnyx_Assistant_Bridge.md).

---

## 19. Phase 1.5B implementation status (closeout)

For the **approved scope** in this plan (including §§6–11 non-goals), implementation is **complete**:

- **Transcript path:** `call.conversation.ended` `messages[]` + ingest (§8); optional **Conversation Messages API** call-out remains a future hardening-only item, not required for this phase (see verification matrix P4).
- **Office UX:** [`frontend/app/calls/page.tsx`](../frontend/app/calls/page.tsx) surfaces AI summary, CRM link badges, and a **minimal Telnyx voice hybrid CRM hint** (Phase 1.5B P4).
- **Regression bundle:** `npm run build --workspace backend` · `npm run build --workspace frontend` · `npm run telephony-messaging:isolation:smoke` (backend) — expect **9a–9d** PASS.

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-15 | **Phase 1.5B implementation closeout:** §§18–19, verification matrix link, P4 Calls UI hint reference |
| 2026-05-15 | **Telnyx spike formal closeout:** **micro-test B** **PASS**; **LLM key handling** **PASS** — §§1.2, 2, 5–6, 14 checklist |
| 2026-05-15 | Closeout audit: §1.2/§5/§6 attach-path spike vs **`ai_assistant_start`** canonical + **micro-test B**; §8 ingest (**`ended.messages[]`**, Messages API optional); §9 spike locks tightened; §14 checklist + LLM item 7; doc history cross-ref |
| 2026-05-15 | Spike rollup recorded: transcript/messages, DV A/B, webhook tool — all PASS (see runbook) |
| 2026-05-15 | Telnyx spike: §6 webhook tool validation recorded PASS (runbook §6.1) |
| 2026-05-15 | §6 webhook tool spike execution prep linked; DV A/B PASS unchanged |
| 2026-05-15 | Telnyx injection shape: `assistant.dynamic_variables` on `ai_assistant_start` (aligned with Telnyx Call Control OpenAPI) |
| 2026-05-15 | Voice Flow Catalog product model (`flow_id` → Telnyx assistant id, per-number assignment); Amber as first active flow; explicit customer boundary; replaced env-centric “single template assistant” framing |
| 2026-05-14 | Initial consolidated plan (Telnyx AI Assistants path, owner-locked scope) |
