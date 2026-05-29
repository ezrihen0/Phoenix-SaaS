# WizField AI Chat WIP — Scope Decision (Owner Record)

**Date:** 2026-05-29  
**Branch:** `SaaS-master` @ `fbcc5b7`  
**Decision status:** **EXCLUDE from shipped product map until owner explicitly commits**

---

## Decision

**General AI Chat and related WIP surfaces are NOT counted as shipped product** for owner testing, sales enablement, or verification closeout until the owner reviews and commits them intentionally.

This is a scope boundary, not a quality verdict on the code.

---

## Files in WIP (untracked at decision time)

| Path | Role |
|------|------|
| `frontend/components/home/ai-chat-panel.tsx` | Home UI chat panel (imported by `/home` locally but untracked) |
| `frontend/app/settings/ai-usage-panel.tsx` | Settings AI usage surface (untracked) |
| `backend/src/ai/general-ai-chat-contract-check.ts` | Contract check (not wired in `package.json`) |
| `backend/src/ai/general-ai-chat-unit-check.ts` | Unit check (not wired in `package.json`) |
| `backend/src/ai/ai-chat-context-unit-check.ts` | Context unit check (not wired in `package.json`) |
| `backend/src/ai/load-env.ts` | Duplicate dotenv helper under `ai/` (superseded by `backend/src/load-env.ts` for boot) |

---

## What IS shipped (committed backend)

- `POST /api/ai/chat` on [`backend/src/ai/ai.controller.ts`](../backend/src/ai/ai.controller.ts)
- Feature flag: `AI_CHAT_ENABLED` + `DEEPSEEK_API_KEY`
- Audit store: `ai_recommendation_runs`

Backend endpoint exists in repo truth; **frontend panel + verification scripts are WIP**.

---

## Product map treatment

| Surface | Map status |
|---------|------------|
| AI Chat (general) | **PARTIAL / WIP — EXCLUDED from GO claims** |
| AI Brain V1 | Shipped (deterministic home brief) |
| AI Copilot (`/calls`) | Shipped (Phases 0–4 evidence) |
| Field Copilot API | Shipped backend; no dedicated UI route |

---

## Owner options (when ready — not executed here)

1. **Commit WIP** — stage panel + checks + `package.json` scripts (`general-ai-chat:contract-check`, `general-ai-chat:unit-check`), then re-run verification.
2. **Exclude permanently from v1** — remove `/home` import of `ai-chat-panel.tsx` in a future approved slice (not done in this pass).
3. **Park** — leave untracked; testers ignore AI Chat on home.

---

## Recommended default

**Option 3 (Park)** until marketing/sales method and AI enablement scope are finalized — consistent with deferred Stripe/commercial launch.

---

## Verification commands (after commit only)

```text
npm.cmd run general-ai-chat:contract-check --workspace backend
npm.cmd run general-ai-chat:unit-check --workspace backend
```

Scripts are documented in the check files but **not registered** in `backend/package.json` at this decision.
