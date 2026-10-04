# WizField AI — Engineering Closeout and Gap Register

## Purpose

Engineering closeout record for **AI Program Phases 0–4**. This file is **historical Phase 0–4 evidence**. Current AI product truth, including Home AI V1, lives in [`WizField_AI_Master_Source_of_Truth.md`](WizField_AI_Master_Source_of_Truth.md).

Current Home AI verification: [WIZFIELD_PRODUCTION_CLOSEOUT.md](audit/production-2026-09/WIZFIELD_PRODUCTION_CLOSEOUT.md) (`home:ai:smoke`, `home:ai:contract-check`).

**Program verdict (Phases 0–4):** **B — CLOSED WITH NON-BLOCKING GAPS** (owner audit approved 2026-05-15). Gap closure pass **implemented** (webhook flag coherence, canonical docs, copilot smoke, ops hygiene). Do not treat the closed gaps below as current production blockers.

---

## 1. Phase closeout summary

| Phase | Status | Primary evidence |
|-------|--------|------------------|
| 0 Foundation | CLOSED | Build, schema, `POST /api/ai/tools/dry-run` |
| 1 Brain V1 | CLOSED | Build, `GET /api/ai/brain/home-brief`, home UI strip |
| 1.5A Voice intake foundation | CLOSED | Intake dry-run API, `call_intake.*` contract |
| 1.5B Telnyx live voice | CLOSED | Telephony smoke **9a–9d** |
| 2 Copilot drafts | CLOSED | `operator-copilot:contract-check`, manual matrix |
| 3 Guarded send | CLOSED | `TxtService` path, manual matrix |
| 4 Outcome loop | CLOSED | Read-only hydration, manual matrix §12 |

---

## 2. Evidence command table

| Evidence | Command | Expected |
|----------|---------|----------|
| Backend build | `npm run build --workspace backend` | PASS |
| Frontend build | `npm run build --workspace frontend` | PASS |
| Schema | `npm run schema:verify --workspace backend` | PASS |
| Telephony + voice intake | `npm run telephony-messaging:isolation:smoke --workspace backend` | `ok: true` (incl. **9a–9d**) |
| Copilot isolation | `npm run operator-copilot:isolation:smoke --workspace backend` | `ok: true` |
| Copilot send contract | `npm run operator-copilot:contract-check --workspace backend` | PASS |

---

## 3. Telephony smoke matrix (9a–9d)

| ID | Check | Automated |
|----|-------|-----------|
| 9a | Conversation insights + ended ingest, dedupe | PASS (smoke) |
| 9b | Out-of-order ended before insights | PASS (smoke) |
| 9c | Signed `get_availability` tool | PASS (smoke) |
| 9d | Post-call `ai_recommendation_runs`, voice `call_intake.*`, hybrid CRM | PASS (smoke; requires `AI_FOUNDATION_ENABLED` + `AI_VOICE_INTAKE_FOUNDATION_ENABLED` in test env) |

---

## 4. Copilot verification matrix

### Phase 2 (drafts)

| ID | Check | Automated |
|----|-------|-----------|
| P2.1 | Flags off → distinct 403 codes | Manual |
| P2.2 | `calls.view` required | Manual |
| P2.3 | Foreign-org `recentCallId` → 404 | **C2** (copilot smoke) |
| P2.4–P2.8 | Generate, idempotency, patch, dismiss | **C1** + Manual |
| P3.1 | No telephony SMS shortcuts in copilot service | contract-check |
| P3.2 | No Send in UI when send disabled | Manual |

### Phase 3 (guarded send)

| ID | Check | Automated |
|----|-------|-----------|
| P3.1 | CSR + `messaging.send` + flags → send succeeds | **C3** + Manual |
| P3.2 | No `messaging.send` → 403 | Manual |
| P3.3 | Cross-org draft → 404 | Manual |
| P3.4 | Dismissed draft → 404 on send | Manual |
| P3.5 | No `matched_client_id` → ineligible | Manual |
| P3.7 | Already sent → 409 | Manual |
| P3.8 | Edited body sent | Manual |

### Phase 4 (outcome)

| ID | Check | Automated |
|----|-------|-----------|
| M1 | Sent, no qualifying inbound → `waiting_for_reply` | **C4** |
| M2 | Inbound after anchor → `customer_replied` | **C5** |
| M7 | Phase 2 regressions with outcome flag off | Manual |
| M8 | Phase 3 send unchanged | **C3** |
| M9 | No `sendMessage` from outcome path | Code review + smoke |

### Copilot smoke case IDs

| ID | Scenario |
|----|----------|
| C1 | `generateSmsDraft` happy path (template) |
| C2 | Foreign-org `recentCallId` rejection |
| C3 | `executeGuardedSmsSend` → `sent` + `outbound_txt_message_id` |
| C4 | Outcome `waiting_for_reply` |
| C5 | Outcome `customer_replied` + latency fields |

---

## 5. Gap register (closure pass)

| ID | Severity | Gap | Closure |
|----|----------|-----|---------|
| GAP-001 | P1 | Post-call finalize ungated vs voice flags | **Closed** — finalize gated on foundation + voice intake foundation only |
| GAP-002 | P1 | No AI in global canonical docs | **Closed** — AI SoT + pointers |
| GAP-003 | P1 | No Copilot automated smoke | **Closed** — `operator-copilot:isolation:smoke` |
| GAP-004 | P2 | Incomplete `.env.example` | **Closed** — Package 4 |
| GAP-005 | P2 | Stale 1.5B plan status | **Closed** — archived |
| GAP-006 | P2 | No Phase 3/4 verification matrices | **Closed** — merged here |
| GAP-007 | P2 | No AI reverification section | **Closed** — runbook §6B |
| GAP-008 | P2 | Risk register F4 vs Phase 4 | **Closed** — F4/A6 nuance |
| GAP-009 | P2 | Doc sprawl | **Closed** — archive + SoT |
| GAP-010 | P3 | Phase 0 charter tone | **Closed** — archived |
| GAP-011 | P3 | Telnyx tool ungated | **Accepted** — documented in AI SoT §4 |

---

## 6. Owner sign-off (gap closure)

| Field | Value |
|-------|--------|
| Audit verdict | B — Phases 0–4 closed with non-blocking gaps |
| Gap closure pass | Packages 1–4 |
| Date | 2026-05-15 |

---

## 7. Historical references

Phase execution prompts and spike artifacts: [`docs/archive/ai/`](../archive/ai/) — audit trail only.
