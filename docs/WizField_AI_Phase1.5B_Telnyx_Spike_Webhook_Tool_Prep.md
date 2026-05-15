# Phase 1.5B Telnyx spike — §6 Webhook tool validation (execution prep)

**Type:** Owner execution preparation only — **no WizField product implementation**, no CRM, no new endpoints in this repo.

**Locked product posture:** [WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md](WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md) (`get_availability` v0 semantics, hybrid CRM HOLD rules, Voice Flow Catalog).

**Canonical runbook:** [WizField_AI_Phase1.5B_Telnyx_Spike_Runbook.md](WizField_AI_Phase1.5B_Telnyx_Spike_Runbook.md) §6.

---

## 0. Prerequisite status

| Prerequisite | Status |
|--------------|--------|
| **§5 Dynamic variables A/B** | **Closed PASS** — see runbook §5.8 |
| **§6 Webhook tool validation** | **Closed PASS** — see §6.1 |

---

## 1. Objective

Prove **Telnyx AI Assistant webhook tools** are usable for Phase 1.5B before any WizField bridge work:

1. **Stable request shape** Telnyx sends to a configured tool URL (method, path, JSON fields, correlation to the live call / conversation).
2. **Authentication / signing** you can verify on the server side (document algorithm, headers, secret handling — no secrets in the repo).
3. **Timeout and retry** behavior compatible with safe availability heuristics (operator-tunable; 1.5B is read-only stub).
4. **Response body** the assistant actually consumes (fixed JSON stub is enough for the spike).
5. **Safety:** stub returns **no booking**, **no CRM** — aligns with [plan §7](WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md) conceptual output shape.

---

## 2. Evidence policy (unchanged)

- **Do not commit** raw webhook JSON, full wire `ai_assistant_start` bodies, `conversation_id`s, or PII to this repository.
- Store full artifacts in **owner/ticket** storage; the repo may record only **PASS / HOLD / PARTIAL**, redacted field **paths**, and **non-sensitive** procedural notes.

---

## 3. Spike tool (Telnyx side)

Configure a **single dummy webhook tool** on Amber (name suggestion: **`wizfield_spike_availability_ping`**):

- **HTTPS URL** you control (RequestBin-class collector, serverless worker, or tunnel) — must be reachable from Telnyx.
- **Purpose:** exercise an HTTP round-trip only; **no** scheduling systems and **no** WizField API.

**Stub response** (return this JSON from your handler; it mirrors Phase 1.5B v0 signal fields conceptually):

```json
{
  "availability_signal": "likely_open",
  "coarse_hints": ["weekday mornings"],
  "disclaimer": "Non-binding; team confirms.",
  "data_source": "spike_stub_v0",
  "bookable_slots": []
}
```

Instruct Amber (prompt) so that during the test call the assistant **invokes this tool** once (e.g. after the caller asks about availability), without claiming confirmed bookings.

---

## 4. Owner execution sequence

1. **Create** the public HTTPS stub endpoint; log **incoming** method, full URL, headers, raw body (ticket only).
2. **Attach** the webhook tool to Amber in Telnyx Portal per their AI Assistant tool editor; save **screenshots** of URL, method, and any auth/signing options Telnyx exposes (ticket only if they contain secrets).
3. **Place one or two** live test calls using the same inbound path already used for DV PASS (`ai_assistant_start` + **`assistant.dynamic_variables`** as needed).
4. **Trigger** the tool during the call (scripted prompt).
5. In the ticket, archive:
   - **Request shape** summary (field paths, not raw IDs if avoidable).
   - **Signature / auth headers** present and how you verified them (telnyx-doc-linked).
   - **Latency** from Telnyx’s perspective if visible; note any timeouts or assistant retries.
   - Whether the assistant **speaks** consistent non-binding language after the tool returns.
6. **Optional:** second call to see if request shape is **deterministic** across invocations.

---

## 5. PASS / HOLD criteria (aligns with runbook §6)

| Area | PASS | HOLD |
|------|------|------|
| Request stability | Repeatable structure; correlation fields identifiable | Chaotic or missing correlation to conversation |
| Auth | Verifiable signing or acceptable auth hook documented | Cannot prove request authenticity |
| Timeouts | Acceptable for stub; assistant degrades safely | Hard failures / hung assistant |
| Response use | Model uses returned fields coherently | Ignores body or errors loop |
| Safety | No external CRM/scheduling side effects | Unexpected mutations or leaks |

**HOLD** on any security ambiguity → [plan §17](WizField_AI_Phase1.5B_Live_Voice_Intake_Telnyx_Assistant_Plan.md) blocks implementation until resolved.

---

## 5.1 Recorded evidence (summary only)

| Item | Result |
|------|--------|
| Request shape | **PASS** |
| Auth/signing headers | **PASS** |
| Assistant used response correctly | **PASS** |
| Correlation field present | **PASS** |
| Timeout issue observed | **No** |

**§6 overall:** **PASS** — proceed per **§8** below.

---

## 6. Ticket result template (paste back; do not commit raw logs)

```
§6 Webhook tool validation
Date:
Telnyx Portal / API notes:

Tool name in Telnyx:
Stub URL host (redacted): e.g. https://*****.ngrok-free.app/…

Request method/path observed: 
Correlation fields identified (names only): 

Signature/auth headers present: yes/no — verification approach:
Telnyx doc link used:

Typical latency ms (range): 
Timeout/retry observed: yes/no — notes:

Assistant behavior after tool: PASS/FAIL — notes:

Verdict: PASS / PARTIAL / HOLD
Ready for §7 post-call insight/ended capture (or parallel): yes/no
```

---

## 7. Explicit non-goals

- No NestJS controllers, no `TelnyxWebhookService` edits, no DB migrations.
- No real **`get_availability`** implementation against `jobs` / CRM.
- No multi-tenant isolation test here unless combined with a second call (optional); **§10** in the runbook remains the formal isolation bar when you run it.

---

## 8. After §6 PASS

- **Recorded:** §6 closed **PASS** (see **§5.1** summary); full artifacts in ticket only.
- Proceed to **§7–§8** of the main runbook (post-call webhooks, transcript/mapping) per owner schedule — **still spike-only** until the Phase 1.5B execution prompt is approved.
- Implementation readiness gates remain in [runbook §12](WizField_AI_Phase1.5B_Telnyx_Spike_Runbook.md).

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-15 | Recorded §6 PASS summary (§5.1); prerequisite table updated |
| 2026-05-15 | Initial §6 webhook tool spike execution prep (post–DV A/B PASS) |
