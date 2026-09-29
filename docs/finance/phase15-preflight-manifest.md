# Finance Phase 15 — Pre-flight manifest

**Purpose:** Gate Phase 15 production reverification and deploy. **No production mutations** until all blockers are **CLEARED**.

**Generated:** 2026-09-27 (workspace pre-flight pass)

---

## Release identity (reconciled)

| Field | Value |
|---|---|
| Base on remote | `origin/SaaS-master` @ `a6bc8c53d011cc326e3f4782ba5652dd9c28f06e` |
| **Deploy candidate SHA** | **`a62a2e5c50b10629eb7ffa8a8083ad47eb445afe`** (`feat(finance): close Phase 13 tenant, RBAC, and audit hardening`) |
| Unpushed commits | **14** (`88db953` … `f347a7d` Phase 14, `a62a2e5` Phase 13) |
| Working tree | **Excluded from release** — unstaged CRM/team/settings/jobs WIP must not ship via `git add .` |

### Commit inventory (`a6bc8c5..a62a2e5`)

1. `88db953` — jobs finance tab composers  
2. `e0253ff` — Phase 4 estimate→invoice  
3. `b5ea732` — conversion smoke harness  
4. `9601baa` — Phase 4 configured DB smoke  
5. `bfbe8d2` — Phase 5 money engine  
6. `056c709` — Phase 5 configured DB verification  
7. `4ea970a` — Phase 6 payment ledger  
8. `96b68fc` — Phase 7 historical snapshot  
9. `333c1b0` — Phase 8 document presentation  
10. `315c1d9` — Phase 10 org-scoped numbering  
11. `990118f` — Phase 9 native document storage  
12. `1045bf3` — Phase 12 customer/job/portal  
13. `f347a7d` — Phase 14 owner UX  
14. `a62a2e5` — Phase 13 tenant, RBAC, audit  

---

## Finance migration scope

| Timestamp | Migration | Phase |
|---:|---|---|
| `1782000000000` | `invoice-documents` | 9 |
| `1785000000000` | `invoice-payment-idempotency` | 6 |
| `1786000000000` | `invoice-source-quote-provenance` | 4 |
| `1787000000000` | `finance-part4-part5-foundation` | 4–5 / 10 |
| `1788000000000` | `finance-part6-part7-foundation` | 13 audit table |
| `1791000000000` | `quote-customer-facing-snapshot` | 7 |
| **`1790000000000`** | **`multi-branch-phase1-foundation`** | **EXCLUDED — separate program** |

**Active glob ceiling for Finance Phase 15:** `1791000000000`  
**Guard:** `npm run finance-phase15:active-migration-guard` (must PASS before deploy)

**179000 exclusion:** File lives under `backend/src/database/migrations/deferred/` (not loaded by TypeORM). Do not copy back into `active/` for this release.

Other migrations between `178000` and `179100` in `active/` (pricebook, home-ai, etc.) may still apply on deploy if not yet on production — treat prod readonly output as source of truth for **pending** vs **applied**.

---

## Pre-flight blockers

| # | Blocker | Status | Evidence / next step |
|---:|---|---|---|
| 1 | Phase 13 verified and committed | **CLEARED** | Commit `a62a2e5`. Static: `finance-endpoint-tenant:check`, `finance-part13:audit-contract-check`, `finance-part13:rbac-contract-check` PASS (2026-09-27). Full `finance-part13:checks` still requires configured DB for Part 12 conversion smoke (`FINANCE_SMOKE_USE_CONFIGURED_DATABASE=true` or CREATE DATABASE grant). |
| 2 | Finance release range reconciled | **CLEARED** | This manifest; deploy **only** `a6bc8c5..a62a2e5`, not working-tree WIP. |
| 3 | Production migration state (read-only) | **FAIL (2026-09-27)** | Artifact: `_runtime_harness/finance-phase15/production-migration-readonly.json`. Prod DB `wizfield` reachable; high-water **`1790000000000`** (`MultiBranchPhase1Foundation` **already applied**). Finance program still **must not ship** `179000` from repo `active/`; prod ledger already contains it — reconcile before GO. Pending Finance migration: **`1791000000000` only**. |
| 4 | Production backup / recovery proof | **OPEN — owner** | Procedure: [WizField_Disaster_Recovery_and_Rebuild_Runbook.md](../WizField_Disaster_Recovery_and_Rebuild_Runbook.md). Sign-off: [phase15-backup-recovery-signoff.md](./phase15-backup-recovery-signoff.md). September closeout still lists backup **documented, not tested**. |
| 5 | `179000` multi-branch excluded | **CLEARED (workspace)** | Deferred folder + active migration guard. Re-run guard on CI/deploy agent before `DB_MIGRATIONS_RUN=true`. |

---

## Phase 15 execution status

**BLOCKED** until blocker **3** artifact exists with `ok: true` and blocker **4** sign-off is completed.

After unblock:

1. Push deploy candidate SHA to `origin/SaaS-master`.  
2. Deploy backend with migrations; re-run `finance-phase15:prod-migration-readonly`.  
3. `npm run finance-part13:readonly-audit` and `npm run phoenix-finance:closeout-readonly` against production read-only credentials (Railway SSH or owner-provided read-only URL — no secret extraction in agent logs).  
4. `npm run finance-part9:certify` (and Part 13 closeout with configured DB as needed).  
5. Record evidence under `backend/_runtime_harness/finance-program-closeout/` and mark Phase 15 CLOSED in Finance SoT.

---

## Commands (quick reference)

```bash
cd backend
npm run finance-phase15:active-migration-guard
npm run finance-phase15:prod-migration-readonly
npm run finance-part13:readonly-audit          # requires prod-safe DB env
npm run phoenix-finance:closeout-readonly      # requires prod-safe DB env
npm run finance-part9:certify
```
