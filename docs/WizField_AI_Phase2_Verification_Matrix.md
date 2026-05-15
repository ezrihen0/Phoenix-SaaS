# Phase 2 — Operator Copilot verification matrix

**Scope:** Calls-surface SMS draft Copilot (`ai_operator_drafts`, `/api/ai/copilot/calls/sms-draft/*`, `/calls` UX).  
**Reference:** [WizField_AI_Phase2_Operator_Copilot_Execution_Prompt.md](./WizField_AI_Phase2_Operator_Copilot_Execution_Prompt.md)

## Legend

| Result   | Meaning                                              |
| -------- | ---------------------------------------------------- |
| PASS     | Automated or documented manual check satisfied       |
| Manual   | Human / env configuration                            |

## Environment (Manual)

Enable for local/staging verification:

| Variable                              | Purpose                                      |
| ------------------------------------- | -------------------------------------------- |
| `AI_FOUNDATION_ENABLED=true`          | Parent AI gate                               |
| `AI_OPERATOR_COPILOT_ENABLED=true`    | Phase 2 master                               |
| `AI_COPILOT_CALLS_SURFACE_ENABLED=true` | `/calls` Copilot APIs + UX affordance      |
| `AI_COPILOT_CUSTOMER_SMS_DRAFT_ENABLED=true` | SMS draft workflow                    |
| `AI_COPILOT_LLM_ENABLED=true` (optional) | Path B — requires `OPENAI_API_KEY`       |
| `OPENAI_API_KEY` (optional)           | Path B live model                            |
| `OPENAI_COPILOT_MODEL` (optional)     | Defaults to `gpt-4o-mini`                    |

## P0 — `/calls` access alignment

| #   | Check                                           | How verified                         | Result |
| --- | ----------------------------------------------- | ------------------------------------ | ------ |
| P0.1 | CSR with `calls.view` can open `/calls`         | Manual login as CSR                  | Manual |
| P0.2 | Admin with `calls.view` can open `/calls`      | Manual login as admin                | Manual |
| P0.3 | Viewer cannot (`no calls.view`)                 | Manual login as viewer → redirect    | Manual |

## P1 — Data model

| #   | Check                                                | How verified              | Result |
| --- | ---------------------------------------------------- | ------------------------- | ------ |
| P1.1 | Table `ai_operator_drafts` exists                    | `schema:verify` after migration | PASS (after migrate) |
| P1.2 | FK to `ai_recommendation_runs` nullable             | Migration / schema manifest | PASS |

## P2 — API behavior

| #   | Check                                                | How verified                         | Result |
| --- | ---------------------------------------------------- | ------------------------------------ | ------ |
| P2.1 | Flags off → 403 distinct codes                      | Manual with env                      | Manual |
| P2.2 | `calls.view` required                               | Session without permission → 403     | Manual |
| P2.3 | Foreign-org `recentCallId` → 404                    | Manual / future smoke                | Manual |
| P2.4 | Generate returns draft + run row                    | DB inspect `ai_recommendation_runs`  | Manual |
| P2.5 | Idempotent: second generate returns same active draft | Manual API repeat                 | Manual |
| P2.6 | PATCH updates `edited_body`                         | Manual                               | Manual |
| P2.7 | POST dismiss sets `dismissed`                       | Manual                               | Manual |
| P2.8 | GET after dismiss → null                             | Manual                               | Manual |

## P3 — No-send contract

| #   | Check                                                | How verified                         | Result |
| --- | ---------------------------------------------------- | ------------------------------------ | ------ |
| P3.1 | Copilot module does not import messaging send paths | `npm run operator-copilot:contract-check --workspace backend` | PASS |
| P3.2 | No “Send SMS” in Copilot UI                         | UI review `/calls`                   | Manual |

## P4 — Regression bundle (automated)

```bash
npm run build --workspace backend
npm run build --workspace frontend
npm run schema:verify --workspace backend
cd backend && npm run telephony-messaging:isolation:smoke
```

Expected: builds **PASS**; schema verify **PASS** after migration; telephony smoke **ok: true** (Phase 1.5B unchanged).

## Document history

| Date       | Change                    |
| ---------- | ------------------------- |
| 2026-05-15 | Initial Phase 2 matrix    |
