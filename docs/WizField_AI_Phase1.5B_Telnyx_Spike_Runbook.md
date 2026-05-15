# WizField AI — Phase 1.5B Telnyx Spike Runbook

**Purpose:** Owner-executable **pre-coding capability validation** for Phase 1.5B live voice intake (Telnyx AI Assistants). Not implementation.

**Locked alignment:** [`docs/WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md`](WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md) — Voice Flow Catalog, Amber only in 1.5B, text-first, availability-only tool semantics, hybrid CRM posture.

**Non-goals:** No WizField code changes in this spike; no CRM writes from the spike tool; no booking logic; no multi-flow expansion beyond documenting Amber’s catalog mapping evidence.

### Recorded spike status (summary; ticket holds raw evidence)

| Spike item | Verdict |
|------------|---------|
| **Transcript / Messages retrieval** | **PASS** |
| **Dynamic variables A/B** | **PASS** — details: §5.8 |
| **Webhook tool validation** | **PASS** — details: §6.1 |
| **Micro-test B (`ai_assistant_start` parity)** | **PASS** — header § Micro-test B; ticket holds raw evidence |
| **LLM key handling (Amber)** | **PASS** — ticket one-liner / Portal posture; no secrets in repo |

### Attach path evidence (Telnyx spike truth vs canonical)

**Proven live (Voice API Application inbound path):**

- **`POST /v2/calls/{call_control_id}/actions/answer`** with request body embedding **`assistant.id`** and **`assistant.dynamic_variables`** (`assistant` nesting per Telnyx schema).

Under that attach path the spike validated: dynamic variables A/B (**§5.8**), webhook stub tool (**§6.1**), post-call **insights / ended**, and transcript/messages evidence (header rollup).

**`ai_assistant_start` parity (micro-test B):** Owner live run recorded **PASS** — same stack as prod intent, **`POST …/actions/ai_assistant_start`** with **`assistant.id`** + **`assistant.dynamic_variables`** after **`answer`**; DV, tool hit, **insights** + **ended** correlated (ticket detail).

**Canonical Phase 1.5B product path** ([plan §5 step 3](WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md)): **`answer`** if required, then **`POST /v2/calls/{call_control_id}/actions/ai_assistant_start`** with **`assistant.id`** + **`assistant.dynamic_variables`**. Both **`answer`**+embedded **`assistant`** (original spike) and **`ai_assistant_start`** (**micro-test B**) now have live **PASS** on the owner stack; **option A** doc shift is **not** required for closeout.

### Micro-test B — `ai_assistant_start` parity (owner; ticket-only raw evidence)

**Status:** **PASS** — owner completed the live steps below; ticket holds raw evidence. This section remains the procedure reference.

1. Same Voice API Application / inbound pilot stack as prod intent.
2. **`answer`** the call per Telnyx requirements.
3. **`POST …/actions/ai_assistant_start`** with **`assistant.id`** + **`assistant.dynamic_variables`** (smoke with known-good Amber payload).
4. Confirm dynamic variables audible, invoke stub webhook tool once, capture **insights** + **ended** webhooks correlate.
5. Record **PASS / HOLD** + notes in ticket; repo may receive **one-line** outcome only (no payloads/IDs).

**Formal Telnyx spike closeout** under **unchanged** plan canonical (`ai_assistant_start`): **met** with **B = PASS** (this rollup + ticket).

---

## 1. Executive Verdict

### Why spike before coding

Telnyx AI Assistants expose **versioned webhook payloads**, **conversation lifecycle ordering**, **transcript placement**, and **tool HTTP semantics** that must not be guessed from docs alone. Phase 1.5B **plans** **`ai_assistant_start`** ([Telnyx Start AI Assistant](https://developers.telnyx.com/api-reference/call-commands/start-ai-assistant)) with **`assistant.dynamic_variables`** after **`answer`** when required. Spike proved DV, tools, and post-call events on **`answer`** with embedded **`assistant`**, then **`ai_assistant_start` parity** (**micro-test B — PASS**, header). Wrong assumptions still force rework in [`TelnyxWebhookService`](../backend/src/telephony/telnyx-webhook.service.ts), Call Control helpers, and the voice normalizer if implementation drifts from ticket-locked JSON paths.

### Risks removed by PASS

- Incorrect JSON paths for `call_intake.*` normalization against [`ai.constants.ts`](../backend/src/ai/ai.constants.ts) (§9 spike locks in locked Phase 1.5B plan).
- **Insights vs ended** ordering gaps and idempotency keys (`provider_event_id`, `(conversation_id, event_type)`).
- **`call.conversation.ended`** may include **full `messages[]`** at webhook ingest (observed spike); Conversation Messages API is a validated **alternate** retrieval path—in implementation, a follow-up GET is an **engineering choice** for redundancy, **not strictly proven mandatory** here if `messages[]` suffices.
- Tool requests **cannot be authenticated** or timeout unpredictably → **HOLD** per locked plan §17.
- **`client_state`** encoding for correlating tools to `recent_call_id`/org remains undefined until spike proves payload surfaces.

---

## 2. Spike Preconditions

### Telnyx (must exist)

- WizField-controlled Telnyx account with **AI Assistants** enabled and permission to create/edit **Amber** (`amber_schedule_availability_intake` mapped assistant).
- **Programmable Voice / Call Control** path usable on a **test DID** (or documented equivalent that yields `call_control_id` on inbound).
- **Webhook URL** reachable from Telnyx for **conversation** events (insights + ended) — dev tunnel acceptable for spike only.
- Optional but strongly recommended: **API access** (personal/API key) to **retrieve** conversation detail if webhook payloads omit transcript.

### Test phone / call

- Ability to place **two sequential inbound test calls** (same or different originating numbers acceptable).
- Quiet environment or labeled recordings so transcripts are distinguishable.

### WizField not required for spike

- No app deploy, DB migration, or [`get_availability`](WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md) endpoint implementation. Use **standalone dummy HTTPS endpoints** for tool capture only.

---

## 3. Amber Flow Evidence Checklist

Record into internal ops notes / ticket (not customer-visible):

| Field | Record |
|------|--------|
| Internal Voice Flow key | `amber_schedule_availability_intake` |
| Customer-facing title | **Amber — Schedule / Availability Intake** |
| Telnyx Assistant `id` | UUID/string exactly as shown in Telnyx UI or API |
| Where it lives | Portal path + workspace/account name; link or id |
| Version / revision | Any “version”, “published”, or “assistant revision” Telnyx exposes |
| Voice / model settings | Enough to reproduce (STT/TTS/model family) if UI shows it |
| Tool list attached to assistant | Names/ids of tools (including spike dummy tool) |
| Instruction / greeting | Note whether baseline is static or relies on variables |

**Catalog intent (1.5B):** Evidence above is what WizField will store as **`flow_id` → `telnyx_assistant_id`** for Amber, even if the row is initially seeded from env/migration.

---

## 4. Test Call Procedure

**Goal:** Validate **assistant attach** + **identifiers returned**.

**Staging:** Run **§5 Dynamic variables — A/B validation** first (no dependency on §6 tool spike). Optional: trigger dummy tool during §4 only if already configured.

1. **Prepare Call Control:** Start from a flow that yields an **active call** with **`call_control_id`** (mirror production: inbound → answer if required per locked Phase 1.5B plan §5). **Original spike:** **`answer`** with embedded **`assistant`**. **Micro-test B — PASS:** **`ai_assistant_start`** after **`answer`** (header).
2. **Invoke `POST /v2/calls/{call_control_id}/actions/ai_assistant_start`** with body per Telnyx **`AIAssistantStartRequest`**, at minimum:
   - **`assistant.id`** = Amber’s Telnyx id
   - **`assistant.dynamic_variables`** = variable map (see §5 for A/B payloads — **not** a root-level `dynamic_variables` field on the request)
   - Optional: **`client_state`** = Base64 opaque test token to see if echoed on later webhooks
3. **During call:** Speak a short script: name, service need, preferred time window; optionally trigger **dummy tool** once (§6).
4. **Immediately capture** from Telnyx **API response + any Telnyx logs**:
   - `assistant_id` (if echoed)
   - `conversation_id` (or equivalent canonical id)
   - `call_control_id` linkage if present on start response or subsequent event
5. **End call** normally; wait until **insights** and **ended** events received (§7).

**PASS (start path):** Amber runs on live call; **`conversation_id`** is obtained reliably; linkage to **`call_control_id`** is documented (field path or “not exposed”).

**FAIL / HOLD:** Start fails intermittently vs answer state; no stable `conversation_id`; cannot attach assistant at all.

---

## 5. Dynamic variables — A/B validation (owner spike)

**Objective:** Prove Amber is **conditioned by runtime variables** suitable for the Voice Flow Catalog model: same assistant id, two disjoint payloads, obvious transcript/audio difference, no cross-context leakage.

### 5.0 Telnyx official dynamic-variable paths (inbound)

Telnyx documents multiple mechanisms in [Dynamic Variables](https://developers.telnyx.com/docs/inference/ai-assistants/dynamic-variables). The **outbound** TeXML example uses **`AIAssistantDynamicVariables`** on `POST /v2/texml/ai_calls/{texml_app_id}` — **not** the same as Call Control `ai_assistant_start`.

**Inbound Call Control:** [Start AI Assistant](https://developers.telnyx.com/api-reference/call-commands/start-ai-assistant) defines **`assistant`** (`CallAssistantRequest`) with **`dynamic_variables`** — i.e. **`assistant.dynamic_variables`** on the `ai_assistant_start` JSON body.

**Precedence** (when multiple sources exist): per Telnyx — channel-specific API injection, SIP `X-*` headers → snake_case variable names, **`dynamic_variables_webhook_url`** (`assistant.initialization` → response with `dynamic_variables` within **1s**), Assistant builder defaults.

**This spike — primary path:** **`assistant.dynamic_variables` on `ai_assistant_start`.** **Fallback** if nested injection fails: **Dynamic Variables Webhook**; SIP headers are mainly transfer/trunk scenarios.

**Execution boundary:** This repository cannot place Telnyx calls; owner captures evidence. **Do not** advance to **§6 Webhook tool validation** until §5 verdict is **PASS** (or owner accepts **PARTIAL** with documented gaps).

### 5.1 Prerequisite — Amber prompt / greeting

Variables only affect speech if Amber’s **instructions / greeting / tools** template uses **`{{variable_name}}`** (confirm exact syntax in Portal).

Force audible differentiation, e.g.:

- `{{organization_display_name}}`
- `{{service_areas_short}}`
- `{{assistant_identity}}`
- `{{availability_scope_intake_blurb}}`
- `{{callback_followup_policy}}`

If Amber does **not** reference a key, injecting it proves nothing → **PARTIAL/FAIL** until prompt updated.

### 5.2 How variables are attached (wire JSON)

```json
{
  "assistant": {
    "id": "assistant-<Amber_UUID>",
    "dynamic_variables": {
      "<keys from §5.4>": "<values>"
    }
  }
}
```

- Archive full **successful** wire body (redact secrets). SDKs may use `dynamicVariables` (camelCase) — prove what Telnyx accepted.
- If **`422`** or rejection: capture error; try **DV webhook** fallback (`assistant.initialization` response per Telnyx doc, `<1s`).

### 5.3 Canonical keys (Voice Flow Catalog alignment)

| Concept | JSON key |
|---------|----------|
| Business name | `organization_display_name` |
| Service area | `service_areas_short` |
| Agent / identity | `assistant_identity` |
| Scope blurb | `availability_scope_intake_blurb` |
| Callback policy | `callback_followup_policy` |

Also use Phase 1.5B §6 keys where useful: `business_hours_human_summary`, `bookability_policy_strict`, `approved_service_types_hint`, `escalation_safety_clause`, `availability_language_script`.

### 5.4 Exact variable maps (inner object only)

Paste each entire object into **`assistant.dynamic_variables`**.

**Variant A — Phoenix-style**

```json
{
  "organization_display_name": "Phoenix Premier Chimney and Fireplace LLC",
  "service_areas_short": "Scottsdale, Mesa, Gilbert—metro Phoenix corridor",
  "assistant_identity": "Jordan, scheduling coordinator for Phoenix Premier Chimney",
  "availability_scope_intake_blurb": "This call gathers your chimney request and rough availability only—we cannot lock a definite appointment today.",
  "callback_followup_policy": "Same-business-day SMS from Phoenix Premier, or emergency callback—not emergency dispatch promises.",
  "business_hours_human_summary": "Monday through Friday seven to six; Saturdays by booked inspection only.",
  "bookability_policy_strict": "No confirmed booking commitments on this call.",
  "approved_service_types_hint": "Sweeping, inspections, firebox masonry, liner installs—no restaurant hood work.",
  "escalation_safety_clause": "If smoke or imminent hazard, we flag the team—you still need certified emergency responders for true emergencies.",
  "availability_language_script": "Possible openings are estimates your tech will verify."
}
```

**Variant B — clearly different**

```json
{
  "organization_display_name": "Thunder Ridge Garage Doors Co.",
  "service_areas_short": "Louisville fringe—Prospect, Jeffersontown, Shepherdsville",
  "assistant_identity": "Sam, Thunder Ridge dispatcher",
  "availability_scope_intake_blurb": "Garage door intake window only—we gauge possible openings; spring and opener work stays human-confirmed afterward.",
  "callback_followup_policy": "Thunder Ridge ownership or lead tech returns your call inside two weekday business hours—same company name every time.",
  "business_hours_human_summary": "Weekdays seven to seven; Thursdays close at noon for shop inventory.",
  "bookability_policy_strict": "Confirmed time slots forbidden on this call.",
  "approved_service_types_hint": "Tune-ups, spring swaps, keypad programming—we do not do commercial rollup doors.",
  "escalation_safety_clause": "If a cable or spring snaps mid-call instructions, technician callback only—never self-repair prompts.",
  "availability_language_script": "Non-binding weekday windows—we note interest for the dispatcher."
}
```

Unique literals (“Phoenix Premier”, “Thunder Ridge”, “Shepherdsville”, “spring and opener”) should appear in **audio + transcript**.

### 5.5 Calls to run

1. **Call 1:** `ai_assistant_start` with **`assistant`: `{ id, dynamic_variables: <Variant A> }`** — caller script: chimney/Phoenix context; probe booking guarantee → expect **`bookability_policy_strict`**-aligned refusal.
2. Retrieve **transcript** (path already PASS’d by owner).
3. **Call 2:** New session; **`assistant.dynamic_variables`** = **Variant B** — script: garage-door context; confirm **no** Phoenix/Chimney hallmark strings from A.

Keep **`conversation_id`** aligned with each payload in notes.

### 5.6 Verdict criteria

| Verdict | Meaning |
|---------|---------|
| **Dynamic Variables PASS** | Telnyx accepts both maps; transcript/audio quotes **unique strings** per variant; **B has zero** leaked A literals. |
| **Dynamic Variables PARTIAL** | Partial effect (e.g. greeting only) or some keys ignored — document which; may proceed only with owner-accepted mitigation. |
| **Dynamic Variables FAIL** | Ignored variables, stale cross-call values, or unstable start. |

### 5.7 Evidence capture (paste to ticket)

1. Work performed (dates, Amber id, dial path, call count).
2. Exact **wire JSON** for both starts (full `assistant` object).
3. Attachment path: nested `assistant.dynamic_variables` vs DV webhook fallback (archive `assistant.initialization` logs if used).
4. Variant A: `conversation_id` + short observations.
5. Variant B: same.
6. Transcript excerpts proving injected literals per variant.
7. Verdict: PASS / PARTIAL / FAIL.
8. Blockers (size limits, truncation, timeout).
9. Ready for **§6 Webhook tool**? yes/no — **when DV PASS recorded, see §5.8.**

### 5.8 Recorded evidence — dynamic variables A/B

Owner-captured results (Telnyx spike):

| Evidence item | Result |
|---------------|--------|
| **Dynamic variables — verdict** | **PASS** |
| **Context A** (Phoenix Premier Chimney and Fireplace LLC) | **PASS** |
| **Context B** (Thunder Ridge Garage Doors Co.) | **PASS** |
| **Cross-context leakage** | **None observed** |
| **Transcript / messages evidence** | **PASS** |
| **Conversation Messages API retrieval** | **PASS** |

**Gate:** Dynamic-variables sub-spike **closed PASS**. Next runbook item: **§6 Webhook tool validation** (unless a later spike changes this record).

---

## 6. Webhook Tool Validation

**Execution prep (checklist, ticket template, evidence policy):** [`docs/WizField_AI_Phase1.5B_Telnyx_Spike_Webhook_Tool_Prep.md`](WizField_AI_Phase1.5B_Telnyx_Spike_Webhook_Tool_Prep.md) — start after **§5.8** dynamic variables **PASS**.

### Dummy tool (spike-only)

- Name: e.g. **`wizfield_spike_availability_ping`**
- Behavior: HTTP POST to owner-controlled URL (RequestBin-like collector, tiny worker, or tunnel).
- Handler returns **fixed JSON** exercising fields Phase 1.5B cares about conceptually (no real scheduling):

```json
{
  "availability_signal": "likely_open",
  "coarse_hints": ["weekday mornings"],
  "disclaimer": "Non-binding; team confirms.",
  "data_source": "spike_stub_v0",
  "bookable_slots": []
}
```

### Capture

- Full **HTTP method, URL, headers** (especially any `Signature`, `Telnyx-*`, `Authorization`, or `X-*` documented for tools).
- **Raw body** Telnyx sends (JSON shape, nesting, correlation ids: `conversation_id`, `call_control_id`, `client_state`, tool `call_id`, etc.).
- **Timeout / retry** behavior from Telnyx UI or observed failures (e.g. slow 5s vs 30s response).

### PASS / FAIL

| Criterion | PASS | FAIL |
|-----------|------|------|
| Request shape stable | Repeatable JSON; documented path to conversation correlation | Different shape per retry with no idempotency |
| Auth | Documented verification steps (secret, HMAC, header names) | None or cannot validate origin |
| Assistant use of response | Model speaks/acts consistently with returned fields | Errors, loops, or ignores body |
| Safety | Tool cannot be invoked to mutate CRM (by design) | Any unexpected side channel |

If **FAIL** on auth or correlation → **HOLD** per locked plan §17 (webhook tools cannot be secured).

### 6.1 Recorded evidence — webhook tool (stub)

Owner-captured results (Telnyx spike):

| Evidence item | Result |
|---------------|--------|
| **Request shape** | **PASS** |
| **Auth / signing headers** | **PASS** |
| **Assistant used response correctly** | **PASS** |
| **Tool argument / body parameter passing** | **PASS** |
| **Correlation field present** | **PASS** |
| **Timeout issue** | **No** |

**Evidence note:** `wizfield_spike_availability_ping` was invoked with structured arguments from the conversation (example: **`requested_window` = `"tomorrow morning"`**); the stub response was **consumed correctly in speech**. This supports the future **`get_availability`** bridge (AI→structured tool input, not only webhook execution/signing).

**Gate:** **§6 Webhook tool validation — closed PASS.** Next runbook focus: **§7 Post-call webhook / insight validation** (and §8 transcript as applicable). Raw payloads and identifiers remain ticket-only.

---

## 7. Post-Call Webhook / Insight Validation

**Trigger:** Normal call hangup after §4.

### Events to archive

Record **exact strings** from Telnyx (may differ slightly by API version):

- **`call.conversation_insights.generated`** (or equivalent **insights generated** event)
- **`call.conversation.ended`** (or equivalent **conversation ended** event)

### Save for each event

- Raw **webhook JSON** (file: `insights_<conversation_id>_<timestamp>.json`, `ended_...json`)
- **HTTP headers** received (signature headers if any)
- **Event id** / delivery id fields for dedupe design
- **Timestamps** (Telnyx `occurred_at` or HTTP date)
- **`conversation_id`**, **`assistant_id`**, **`call_control_id`** if present

### Normalization pre-check (for future WizField)

- Identify JSON paths for: **summary**, **intent** labels, **structured fields** (entities), **handoff / outcome** codes, **tool traces**.
- Note **ordering:** can **ended** arrive before **insights**? (Locked plan expects out-of-order support.)

### 7.1 Recorded evidence — post-call webhooks (summary)

Ticket-backed observations (proven first on **`answer`**+assistant path; **micro-test B PASS** confirms **`ai_assistant_start`** parity on owner stack):

| Item | Spike conclusion |
|------|------------------|
| **`call.conversation_insights.generated`** | Observed live; **`conversation_id`**, **`call_control_id`**, **summary** text present |
| **`call.conversation.ended`** | Observed live; **`conversation_id`**, **`call_control_id`**, **full `messages[]`**, duration/model metadata |

Raw JSON stays **ticket-only**. **Micro-test B PASS:** spot-check ticket if **`ai_assistant_start`** payloads differ from the original **`answer`**+assistant traces (owner already recorded overall **PASS**).

---

## 8. Transcript Validation

### Questions to answer

1. Is **full transcript text** present in **insights** webhook payload? If yes: **path** to string or array. (Spike default: **do not** treat insights as full verbatim thread unless ticket proves it.)
2. Is the **message thread** present in **`call.conversation.ended`** as **`messages[]`**? If yes: record path; this is the **primary in-webhook** source for text-first persistence (spike: **observed**).
3. Beyond (2), is **Conversation Messages API** (or portal export) still needed for gaps? Spike summary: **GET is not asserted strictly mandatory** when `ended.messages[]` is complete; Messages API remains a **parallel / reconciliation** choice.

### Capture

- Redacted excerpt + path, or screenshot of portal panel if webhook lacks text.
- See **§8.1** for recorded spike conclusion (**webhook versus optional GET**).

### 8.1 Recorded evidence — transcript / messages

| Source | Spike conclusion |
|--------|-------------------|
| **`call.conversation.ended` payload — `messages[]`** | **Observed**: full conversation messages delivered in-ended webhook (**primary** webhook source for persistence design). |
| **Conversation Messages API** | **PASS** independently—**alternate / reconciliation** path (not asserted as only because webhook “failed”). |
| **Follow-up GET strictly required** | **Not asserted** by spike summary: **`ended.messages[]` may suffice**; Messages API fetch is optional hardening **implementation may choose**. |
| Insights-only full transcript | **Not claimed** unless ticket shows verbatim thread in insights. |

---

## 9. Mapping Evidence Required for WizField

| WizField target | Telnyx evidence needed |
|-----------------|-------------------------|
| `call_intake.summary` | Insights (or transcript-derived) JSON path for short summary; fallback if only long-form transcript exists |
| `call_intake.intent` | Path to intent label(s) or model classification; enumerate allowed values if fixed set |
| `call_intake.structured_capture` | Paths to extracted slots (name, phone, service, window, address fragments); note nullability |
| `call_intake.handoff` | Paths to status, reason codes, escalation flags, partial-completion markers, CRM-outcome hints |

If any target **lacks** a stable path → record **HOLD** gap and whether **LLM-free** normalization is still acceptable.

### 9.1 Spike-closeout mapping judgment (sources proven vs deferred)

| Source for normalizer | Telnyx spike status |
|------------------------|---------------------|
| **`call_intake.summary`** anchor | **Proven**: insights webhook carries **summary** text (ticket path detail). |
| **Transcript / message thread** | **Proven**: **`ended`** includes **`messages[]`**; Conversation Messages API **PASS** as parallel source. |
| **Tool traces** (**`get_availability`**) | **Proven stub path**: webhook tool + structured args (**§6.1**). |
| **Correlation** (`conversation_id`, `call_control_id`) | **Proven** on insights + ended. |
| **`call_intake.intent`**, **`structured_capture`**, **`handoff`** | **Not spike-closed as stable provider-native fields**—fixture/ticket JSON path locking + **Phase 1.5B execution** normalizer version. |

---

## 10. Two-Org Isolation PASS Criteria

**Definition of done (Amber reuse safety)**

Same **one** Telnyx assistant id (Amber catalog entry); **two** calls; **non-overlapping** `dynamic_variables` (§5).

**PASS if all true**

1. No **literal** leakage of Context A into Context B speech.
2. Tool request bodies (§6) carry **only** correlation for the active call (no stale org fields if variables are echoed).
3. Post-call payloads (§7) are **`conversation_id`-scoped**; no cross-conversation merge in same delivery.

**Otherwise:** HOLD — multi-tenant reuse of Amber is **not** proven safe for Phase 1.5B.

---

## 11. Spike Result Template

Owner may paste completed form into ticket / execution prompt:

```
Spike date: 
Telnyx API / portal version notes: 

Assistant ID (Amber): 
Human title on record: 
Catalog flow_id: amber_schedule_availability_intake

Conversation ID (Test A): 
Conversation ID (Test B): 

Call Control linkage documented: yes/no — notes:

Tool request captured: yes/no
Tool auth captured: yes/no — mechanism:
Tool timeout observed: 

Dynamic variables — verdict: PASS / PARTIAL / FAIL
Dynamic variables — Context A PASS: PASS/FAIL
Dynamic variables — Context B PASS: PASS/FAIL
Cross-context leakage: yes/no — details:

Transcript / messages in `ended`: yes/no — `messages[]` noted:
Insights carry full verbatim thread: yes/no (default no unless ticket proves)
Optional Messages API / follow-up fetch used: yes/no — endpoint (engineering choice, not spike-mandatory):

Insights payload captured: yes/no — file ref:
Conversation ended payload captured: yes/no — file ref:
Event names used (exact): 

JSON path notes:
- summary: 
- intent: 
- structured_capture: 
- handoff: 
- transcript: 

Main anomalies: 

Final spike verdict: PASS / HOLD
```

---

## 12. Final Implementation Readiness Rule

- If **PASS:** next artifact is **`Phase 1.5B Execution Prompt — Telnyx AI Assistant Bridge`** (routing, catalog resolution, `ai_assistant_start`, tool bridge, ingest, normalizer version bump, flags, verification per locked Phase 1.5B plan §16).

  **Formal closeout under unchanged plan §5 (`ai_assistant_start` canonical):** **Satisfied** — **micro-test B** recorded **PASS** (header rollup + ticket). Remaining spike **HOLD** reasons are only ordinary §11 / §17 items (payload ambiguity elsewhere, insecure tools in prod wiring, unstable start regressions), not unanswered **`ai_assistant_start`** parity.

- If **HOLD** (payload ambiguity, insecure tools, unstable start, insufficient transcript source, or isolation failure): **no Phase 1.5B coding start** until gaps are resolved or scope explicitly narrowed with owner sign-off.

---

## References (behavioral alignment)

- Risk honesty / voice qualifiers: [`docs/WizField_AI_Sales_Enablement_Risk_Register.md`](WizField_AI_Sales_Enablement_Risk_Register.md)
- Evidence-first gates: [`docs/AI_WORKFLOW_RULES.md`](AI_WORKFLOW_RULES.md)
- Reserved envelope keys origin: [`docs/WizField_AI_Phase0_Foundation_Execution_Prompt.md`](WizField_AI_Phase0_Foundation_Execution_Prompt.md)

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-15 | **Telnyx spike formal closeout (canonical path):** **micro-test B** (`ai_assistant_start` parity) **PASS**; **LLM key handling (Amber)** **PASS** — header rollup, §§1 / 7.1 / 12, **Attach path evidence** |
| 2026-05-15 | Rollup: transcript/messages, DV A/B, §6 webhook tool — all PASS (header table) |
| 2026-05-15 | Closeout audit alignment: executive verdict + §8 questions/template; §12 formal closeout vs **micro-test B** / option **A**; attach-path truth vs `ai_assistant_start` canonical |
| 2026-05-15 | §6 webhook tool recorded PASS (§6.1): request shape, auth, correlation, assistant response; no timeout issue |
| 2026-05-15 | §6 webhook tool spike execution prep doc: [`WizField_AI_Phase1.5B_Telnyx_Spike_Webhook_Tool_Prep.md`](WizField_AI_Phase1.5B_Telnyx_Spike_Webhook_Tool_Prep.md) |
| 2026-05-15 | Recorded DV A/B evidence (§5.8): PASS both contexts, no cross-context leakage; Conversation Messages API PASS |
| 2026-05-15 | Dynamic variables A/B sub-spike (§5): `assistant.dynamic_variables` on `ai_assistant_start`, Telnyx doc links, VARIANT A/B payloads, gate before §6 tools |
| 2026-05-15 | Initial Telnyx spike runbook (pre-1.5B implementation) |
