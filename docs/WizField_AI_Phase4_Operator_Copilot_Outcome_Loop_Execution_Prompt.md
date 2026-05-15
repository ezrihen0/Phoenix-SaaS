# WizField AI — Phase 4 Operator Copilot Outcome Loop V1 (Execution Prompt)

**Status:** **Implemented** in repo; enable with `AI_COPILOT_CUSTOMER_SMS_OUTCOME_TRACKING_ENABLED`.  
**Owner lock:** Phase 4 observes **whether a customer inbound SMS appears in the same thread after the Copilot-sent outbound row** — **temporal correlation only**, not causal attribution, not automation.  
**Date:** 2026-05-15

---

## 1. Product intent

After Phase 3’s human-confirmed send, Phase 4 answers one question for the operator in context: **“Did an inbound customer message arrive in this SMS thread after the Copilot-associated outbound logged here?”**

WizField **does not** auto-follow-up, **does not** learn autonomously, and **does not** mutate CRM based on replies. This is **observation + honesty** aligned with [`WizField_AI_Sales_Enablement_Risk_Register.md`](WizField_AI_Sales_Enablement_Risk_Register.md) (**F4** still forbids faux self-learning; **A6** allows measured outcomes stated with qualifiers).

---

## 2. Source-of-truth and scope boundaries

| Layer | Phase 4 contract |
|--------|-------------------|
| **`txt_messages`** | **Execution source of truth** for outbound/inbound rows, timestamps, `conversation_id`, `direction`. Do **not** redefine ownership or provider behavior. |
| **`ai_operator_drafts`** | **Copilot product lifecycle**: `status`, `outbound_txt_message_id` (Phase 3 FK). Phase 4 adds **no** new columns for outcomes — **derived only**. |
| **`ai_recommendation_runs`** | **Audit/generation ledger only**. Do **not** store outcome state or reply linkage here. |

---

## 3. Non-negotiables (no automation)

Implementers must **preserve** Phase 4 owner boundaries:

- No automatic follow-up send, second-message automation, sequences, drip, or retries triggered by outcomes.
- No AI-triggered outbound when there is no reply.
- No lead/job/invoice (or other CRM) mutation because a reply exists.
- No sentiment claims, causal ROI/conversion attribution, cross-org aggregates, or global dashboards here.
- **Do not** change Phase 3 send semantics (`POST …/sms-draft/:id/send`), **`TxtService.sendMessage`** behavior, Telnyx webhook ingestion shape, or `txt_messages` schema in Phase 4.
- **Outcome code path:** **read-only**. There must be **zero** invocation of **`TxtService.sendMessage`** / outbound send APIs from Phase 4 outcome derivation or hydration (verify via review + checklist).

---

## 4. Feature flags

| Env | Purpose |
|-----|---------|
| Existing Phase 0–3 gates | Unchanged (`AI_FOUNDATION_ENABLED` … `AI_COPILOT_CUSTOMER_SMS_GUARDED_SEND_ENABLED`) |
| **`AI_COPILOT_CUSTOMER_SMS_OUTCOME_TRACKING_ENABLED`** | When **false**: **omit outcome-related fields entirely** from draft DTOs (preserve current Phase 2/3 payloads and behavior). Parser: mirror [`resolveAiCopilotCustomerSmsGuardedSendEnabled`](backend/src/ai/ai-environment.ts) (`true` / `1` / `yes` / `on`). |

When outcome flag is **true**: hydrate outcome fields subject to **`calls.view`** and existing Copilot gates (same entry points as today’s SMS draft read paths).

---

## 5. Deterministic outcome derivation (canonical)

Implement **derived-at-read-time** queries when presenting a draft and the outcome flag is **on**.

### 5.1 Outbound anchor row

Resolved by **`ai_operator_drafts.outbound_txt_message_id`** → `txt_messages.id` (**outbound row**).

If `outbound_txt_message_id` is **null** (e.g. `ON DELETE SET NULL`) or the row is missing → outcome **`unknown`** (see §6).

### 5.2 Thread binding

Outbound row **`txt_messages.conversation_id`** identifies the **`txt_conversations`** thread. Candidate replies share **that** **`conversation_id`**.

### 5.3 Timestamps

Let **`T_anchor`** and **`Ti`** use **instant semantics** comparable in the DB/driver:

- **`T_anchor = COALESCE(outbound.sent_at, outbound.created_at)`**
- **`Ti = COALESCE(inbound.received_at, inbound.created_at)`**

If integrity checks fail (e.g. cannot load outbound, missing `conversation_id`, org/thread mismatch §8) → **`unknown`**.

### 5.4 Qualifying “customer reply”

An inbound row **qualifies** when:

- `direction = 'inbound'`
- **`Ti > T_anchor`** (**strict inequality** — inbound **before or at** anchor **does not** count)

### 5.5 First qualifying reply selection

Among qualifying inbound rows:

```text
ORDER BY Ti ASC, id ASC
LIMIT 1
```

This is **stable** and **deterministic** for multiple replies.

### 5.6 Optional latency

When outcome status is **`customer_replied`** and `T_anchor`/`Ti` are valid:

- Expose **`replyAfterSeconds`** as a non-negative integer: **whole seconds between `T_anchor` and first reply `Ti`** (implementer: use a single consistent definition — e.g. `Math.floor((Ti.getTime() - T_anchor.getTime()) / 1000)` in application code, or DB `TIMESTAMPDIFF` equivalent — **document the chosen rule in code comment only if non-obvious**).

---

## 6. Outcome status enum (exact set)

| `outcomeStatus` | When |
|-----------------|------|
| **`not_applicable`** | Draft **`status !== 'sent'`** (active or dismissed) — no post-send observation applies. |
| **`waiting_for_reply`** | Draft **`sent`**, anchor integrity **OK**, **no** qualifying inbound (`Ti > T_anchor`). |
| **`customer_replied`** | Draft **`sent`**, anchor integrity **OK**, at least one qualifying inbound; first per §5.5. |
| **`unknown`** | Draft **`sent`** but safe observation is impossible (missing FK/row, integrity failure, unusable timestamps). |

**When `AI_COPILOT_CUSTOMER_SMS_OUTCOME_TRACKING_ENABLED` is false:** **do not** include `outcomeStatus` or related fields (Phase 3 JSON shape preserved).

**When flag is true:**

- For **`not_applicable`**: set `outcomeStatus` only; **`firstReplyTxtMessageId`** and **`replyAfterSeconds`** must be **`null`** (or omitted if your API standard prefers omission — **pick one** and match frontend).
- For **`waiting_for_reply`** / **`unknown`**: `firstReplyTxtMessageId` and `replyAfterSeconds` **null**.
- For **`customer_replied`**: set **`firstReplyTxtMessageId`** to the chosen inbound **`txt_messages.id`**; set **`replyAfterSeconds`** per §5.6.

---

## 7. GET draft resolution after send (required behavior)

**`GET /api/ai/copilot/calls/sms-draft?recentCallId=`** must return **one** draft row for the operator panel:

1. If an **`active`** draft exists for **`organization_id` + `recentCallId` + `AI_DRAFT_TYPE_CUSTOMER_SMS_FOLLOWUP_V1`**, return it.
2. **Else** if any **`sent`** draft exists for the same triple, return the **latest** **`sent`** row ordered by:
   - **`updated_at DESC`**
   - **`created_at DESC`** (tie-breaker)

**Do not** build multi-draft history UI, aggregate lists, or reporting in Phase 4.

**Note:** `POST …/sms-draft/generate` today only short-circuits on **`active`**; multiple **`sent`** rows per call remain possible historically. Decision 3 **locks** GET behavior **only**.

---

## 8. Org / thread integrity (no leakage)

Before trusting the anchor outbound and any inbound reply:

1. **`ai_operator_drafts.organization_id`** must match the authenticated actor org (already required).
2. **Outbound:** joined row must belong to **`draft.outbound_txt_message_id`** exactly.
3. **Customer/thread alignment (recommended canonical check):**  
   Prefer verifying that **`txt_conversations.customer_id`** (when present) maps to **`customers.id`** where **`customers.organization_id = draft.organization_id`**. If this check fails → **`unknown`** (do not expose inbound body or IDs that imply cross-org data).

Silent failure mode: **`unknown`** — never return another tenant’s identifiers in draft payloads.

---

## 9. DTO additions (Additive — when outcome flag ON)

Extend SMS draft payloads returned by:

- `POST /api/ai/copilot/calls/sms-draft/generate`
- `GET /api/ai/copilot/calls/sms-draft`
- `PATCH /api/ai/copilot/calls/sms-draft/:draftId`
- `POST /api/ai/copilot/calls/sms-draft/:draftId/send`

**Suggested TypeScript-facing names** (align with [`OperatorCopilotSmsDraftDto`](backend/src/ai/ai-operator-copilot.service.ts)):

```ts
outcomeTrackingEnabled: boolean; // mirrors env for client clarity; optional if you prefer deriving client-side — if added, gate UI on this OR presence of outcomeStatus

outcomeStatus: "not_applicable" | "waiting_for_reply" | "customer_replied" | "unknown";

firstReplyTxtMessageId: string | null;

replyAfterSeconds: number | null; // required only when outcomeStatus === "customer_replied"; otherwise null
```

**Implementation choice:** Omit `outcomeTrackingEnabled` from JSON if redundant; minimally **`outcomeStatus`** (+ nullable satellite fields) is sufficient when flag is **on**.

**Permissions:** Observation uses same **`calls.view`** path as SMS draft reads. **Do not** require **`messaging.send`** merely to display outcome.

---

## 10. Frontend — Calls Copilot SMS panel only

**File:** [`frontend/app/calls/calls-copilot-sms-draft.tsx`](frontend/app/calls/calls-copilot-sms-draft.tsx)

### 10.1 Surfaces **not** in Phase 4

**Do not** add: calls list badges, messaging thread badges, dashboards, exports, or aggregates.

### 10.2 Status display (semantic mapping)

Only when hydrated (flag **on**) and **`draft.status === 'sent'`** (otherwise UI may show nothing extra beyond existing “Sent…” line):

| `outcomeStatus` | Recommended operator-facing headline |
|-----------------|--------------------------------------|
| `waiting_for_reply` | Waiting for a customer reply in this SMS thread. |
| `customer_replied` | A customer reply was detected in this SMS thread after this message was sent. |
| `unknown` | Could not verify thread reply status from messaging records right now. |

**Forbidden copy pattern:** ~~“Customer replied to your Copilot SMS.”~~ (causal overclaim.)

**Supporting line (recommended):** For `customer_replied`, optionally append humanized **`replyAfterSeconds`** (e.g. “First reply ~18 minutes later.”). Phrase **time**, not certainty of intent.

**Honesty microcopy:** A short tertiary line is acceptable (e.g. “Based on timestamps in Messaging — replies may be unrelated to this specific text.”) — keep unobtrusive.

### 10.3 Collapsed panel / reload

Once GET returns **sent** draft (Decision 3 — GET resolution), expanding the panel reloads persisted **waiting/replied** state without requiring the client-only post-send stash.

---

## 11. Implementation packages (sequenced)

### Package P4.1 — Environment + gate

- Add `resolveAiCopilotCustomerSmsOutcomeTrackingEnabled` in [`backend/src/ai/ai-environment.ts`](backend/src/ai/ai-environment.ts).
- Wire read through private merge pattern already used in [`AiOperatorCopilotService`](backend/src/ai/ai-operator-copilot.service.ts).

### Package P4.2 — GET draft resolution

- **`getSmsDraftForRecentCall`**: **`active`** first; else latest **`sent`** with **`updated_at DESC`**, tie-break **`created_at DESC`** (same draft type + `recentCallId` + org).

**Post-implementation grep:** `sendMessage` appears only in **`executeGuardedSmsSend`** within [`ai-operator-copilot.service.ts`](backend/src/ai/ai-operator-copilot.service.ts).

### Package P4.3 — Derived outcome hydration

- In draft presentation helper (e.g. `presentSmsDraft`), when outcome flag **on** && draft **`sent`**: load outbound anchor; run **`first qualifying inbound`** query per §5; map to **`outcomeStatus`** / **`firstReplyTxtMessageId`** / **`replyAfterSeconds`**.
- When outcome flag **off**: **skip** hydration; **omit** Phase 4 fields.

### Package P4.4 — Frontend

- Extend local types + render outcome block **only when** Phase 4 fields present (`outcomeTrackingEnabled` and/or **`outcomeStatus`**).
- Respect copy rules §10.

### Package P4.5 — Verification

- Execute matrix §12 manually or automated integration tests **as available** — **minimum:** manual script in release notes until tests land.

---

## 12. Verification matrix

| ID | Scenario | Expected |
|----|----------|----------|
| M1 | **Sent**, no inbound with `Ti > T_anchor` | `waiting_for_reply` |
| M2 | Inbound **after** outbound (`Ti > T_anchor`) | `customer_replied`; first inbound by §5.5; optional `replyAfterSeconds` |
| M3 | Inbound **before** anchor OR `Ti === T_anchor` | Does **not** qualify; absent later replies → `waiting_for_reply` |
| M4 | **Multiple** qualifying replies | Stable **first** (`ORDER BY Ti ASC, id ASC`) |
| M5 | `outbound_txt_message_id` **null** or outbound row missing | `unknown`; no speculative linkage |
| M6 | **Cross-org** / integrity failure on thread-customer-org join | **`unknown`**; **no identifier leakage** |
| M7 | Phase 2 regressions (**generate/edit/dismiss/active**) with outcome flag **off** | Matches pre–Phase 4 behavior |
| M8 | Phase 3 **send** (flag off or on) | Same permissions + **`TxtService`** path; guarded send untouched |
| M9 | **No** **`sendMessage`** from outcome derivation | Verified by code review / grep checkpoint |

---

## 13. Likely file impact and protected areas

### Expected edits

| Area | Files |
|------|-------|
| AI copilot service | [`backend/src/ai/ai-operator-copilot.service.ts`](backend/src/ai/ai-operator-copilot.service.ts) |
| AI env helpers | [`backend/src/ai/ai-environment.ts`](backend/src/ai/ai-environment.ts) |
| Optional tests | Backend spec colocated with messaging or AI suites |
| Frontend | [`frontend/app/calls/calls-copilot-sms-draft.tsx`](frontend/app/calls/calls-copilot-sms-draft.tsx) |

### Protected areas (hands off Phase 4)

| Area | Reason |
|------|--------|
| [`backend/src/messaging/txt/txt.service.ts`](backend/src/messaging/txt/txt.service.ts) send + webhook pipelines | Messaging execution semantics |
| Telnyx provider integrations | Outside observation scope |
| Phase 3 `POST …/send` handler body | Locked send semantics |
| `ai_recommendation_runs` writers | Audit-only ledger |
| Schema / migrations | **Phase 4 adds none** |

---

## 14. Acceptance criteria snapshot

1. Derived outcome matches §5 deterministically across reloads.
2. GET resolves **active** vs **latest sent** per §7.
3. Flag **false** → byte-compatible Phase 3 draft JSON (minus intentional additive fields historically unused).
4. UI copy complies with §10.2 (**no causal overclaim**).
5. Verification matrix §12 passes.
6. **No** outbound send from Phase 4 code paths.

---

## References

- Phase 3 handoff — [`docs/WizField_AI_Phase3_Operator_Copilot_Action_Handoff_Execution_Prompt.md`](WizField_AI_Phase3_Operator_Copilot_Action_Handoff_Execution_Prompt.md)
- Phase 2 execution — [`docs/WizField_AI_Phase2_Operator_Copilot_Execution_Prompt.md`](WizField_AI_Phase2_Operator_Copilot_Execution_Prompt.md)
- Risk register — [`docs/WizField_AI_Sales_Enablement_Risk_Register.md`](WizField_AI_Sales_Enablement_Risk_Register.md)
