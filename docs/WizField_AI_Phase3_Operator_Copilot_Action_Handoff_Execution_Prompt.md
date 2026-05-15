# WizField AI — Phase 3 Operator Copilot Action Handoff (Execution Prompt)

**Status:** Implemented in repo; authoritative reference for flags, APIs, regression matrix, and release verification.  
**Plan lock:** Option B — guarded direct send from `/calls` Copilot; **canonical send path:** `TxtService.sendMessage` / `POST /api/messaging/txt/send` semantics with **`messaging.send`**.  
**Date:** 2026-05-15

---

## 1. Product intent

Operators complete the loop **Call → Copilot draft → explicit human confirmation → one outbound TXT** without leaving **`/calls`**. AI never sends; all sends require **`messaging.send`** and a deliberate confirm step.

---

## 2. Non-negotiables (recap)

- No auto-send, no AI-triggered send, no background send, bulk, drip, email, scheduling, retries, autonomous routing, CRM mutations triggered by send, or telephony **`POST /api/telephony/customers/:id/messages`** for Phase 3.
- **Org safety:** Recipient customer must belong to actor org (`customers.organization_id`); recent call must belong to org; draft must belong to org.
- **v1 recipient:** **`matched_client_id` only**. Lead-only or no-match → backend refuses send (`sendSurface.eligible=false`); operator may Copy and use Messaging manually.

---

## 3. Feature flags

| Env | Purpose |
|-----|---------|
| `AI_FOUNDATION_ENABLED` | Base AI gate |
| `AI_OPERATOR_COPILOT_ENABLED` | Copilot master |
| `AI_COPILOT_CALLS_SURFACE_ENABLED` | `/calls`-scoped APIs |
| `AI_COPILOT_CUSTOMER_SMS_DRAFT_ENABLED` | Draft generation/load (Phase 2) |
| **`AI_COPILOT_CUSTOMER_SMS_GUARDED_SEND_ENABLED`** | **Phase 3 send orchestration + Send UX** |

When guarded flag is false: `POST .../send` → **403** `ai_copilot_guarded_send_disabled`.

---

## 4. Permissions

| Action | Permission |
|--------|------------|
| Generate / load / patch / dismiss draft | `calls.view` |
| **Send from Copilot** | **`calls.view`** + **`messaging.send`** |

Frontend: mirror `session.permissions.includes("messaging.send")`; backend enforces both on send.

---

## 5. Backend API

### 5.1 Extended draft DTO (read paths)

SMS draft payloads returned by:

- `POST /api/ai/copilot/calls/sms-draft/generate`
- `GET /api/ai/copilot/calls/sms-draft?recentCallId=`
- `PATCH /api/ai/copilot/calls/sms-draft/:draftId`

Include **`sendSurface`** (additive):

```json
{
  "sendSurface": {
    "eligible": true,
    "reasonHint": null,
    "recipientLabel": "Jane Doe",
    "recipientPhoneLast4": "9936",
    "guardedSendEnabled": true,
    "hasMessagingSendPermission": true
  }
}
```

Semantic notes:

- **`eligible`** is true only when: guarded flag on, Phase 2 copilot gates on, **`matched_client_id`** present on bound `recent_call`, **`messaging.send`** for actor, draft **`active`**.
- **`reasonHint`** is short human-readable text when **`eligible`** is false.

### 5.2 Send execution

**`POST /api/ai/copilot/calls/sms-draft/:draftId/send`**  
Body: `{}` (no auto body from server).  
Uses **effective body** = `edited_body` if non-empty trim, else `generated_body`.

**403** cases: missing flags, lacking `calls.view` / `messaging.send`, guarded send disabled.  
**404** draft not active / not found in org.

**409** (`copilot_send_draft_already_sent`) if `status === 'sent'`.

Preflight validation:

- Draft `organization_id` = actor org, `status === 'active'`.
- Recent call scoped to org; **`BINARY recent_call.id = BINARY draft.recent_call_id`**.
- **`recent_call.matched_client_id`** non-null; BINARY-equal customer row under org with valid phone → build `conversationId: customer:${id}`.

Orchestration:

1. `TxtService.sendMessage({ conversationId, body, sentByUserId: actor.user.id, organizationIdForCustomerScope: orgId, outboundRawPayloadExtras: { ai_operator_draft_id, source: \"api/ai/copilot/calls/sms-draft/send\" } })`.
2. On success only: draft `status = 'sent'`, `outbound_txt_message_id = <txt_messages.id>`.

Response: enriched draft DTO (including `sendSurface` with **`eligible: false`** and hint that it was sent, or omit surface if finalized — implementation chooser: returning updated row with **`status: 'sent'`** is sufficient).

### 5.3 Messaging hardening

**`TxtController`** passes **`request.actor.organization_id`** into `TxtService.sendMessage` as **`organizationIdForCustomerScope`**.  
**`TxtService.resolveConversationTarget`** for `customer:` requires **`organization_id`** match when scope is provided (404 if wrong org).

---

## 6. Data model (`ai_operator_drafts`)

| Column | Change |
|--------|--------|
| `status` | Add allowed value **`sent`** (keep `active`, `dismissed`). |
| `outbound_txt_message_id` | Nullable FK → **`txt_messages.id`** (`ON DELETE SET NULL`). |

**`ai_recommendation_runs`:** unchanged — generation/audit only. No send traces there.

---

## 7. Frontend (`calls-copilot-sms-draft.tsx`)

- Consume **`sendSurface`** from GET/PATCH/generate responses.
- **Send** opens confirm modal:
  - Clear copy: outbound SMS commitment.
  - **Recipient**: `recipientLabel` + masked phone (last four).
  - **Body preview**: trimmed effective body.
  - Primary confirm + cancel.
  - Submitting disables controls to hinder double-send.
- If `!sendSurface.eligible`: disable Send / show **`reasonHint`**; keep Copy.
- Telemetry: **`CustomEvent`** `wizfield:copilot-sms-sent` with `{ draftId, recentCallId?, outboundTxtMessageId? }` on success (`detail` minimized).

[`CallsPage`](frontend/app/calls/page.tsx) passes **`hasMessagingSendPermission`** derived from **`session.permissions`**.

---

## 8. Verification matrix (automatable / manual)

| ID | Case | Expect |
|----|------|--------|
| P3.1 | CSR + `messaging.send` + flags | Send succeeds; draft `sent`; FK set |
| P3.2 | No `messaging.send` | 403; UI Send disabled / hint |
| P3.3 | Cross-org draft id | 404 |
| P3.4 | `dismissed` draft | Send 404 |
| P3.5 | No `matched_client_id` | `sendSurface.eligible=false`; send refused |
| P3.6 | Invalid phone | `TxtService` error propagated |
| P3.7 | Already `sent` | 409 |
| P3.8 | Edited body | Sends edited effective body |
| P3.R | Phase 2 with guarded flag off | No regression |

---

## 9. Explicit non-goals (Phase 3)

Option A inbox handoff UX; telephony bypass send; weakening `messaging.send`; altering `ai_recommendation_runs` for outbound proof; autonomous sends.

---

## 10. Handoff checklist

1. Migrate DB; run schema verify pipeline used by CI.
2. Set **`AI_COPILOT_CUSTOMER_SMS_GUARDED_SEND_ENABLED`** in target env alongside Phase 2 flags.
3. Smoke: generate → confirm → send → draft terminal; inbox reflects new **`txt_messages`** row.
4. Document telephony-vs-messaging permission drift for backlog (do not regress Phase 3 on it).
