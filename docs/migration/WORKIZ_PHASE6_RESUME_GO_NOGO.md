# Workiz Phase 6 Resume — GO / NO-GO

Production import execution remains **NOT AUTHORIZED** until the owner explicitly approves **GO — Phase 6 Resume** after this checklist is fully **PASS**.

## Owner decisions (locked)

| Cluster | Decision | Phoenix `customer_id` |
|---------|----------|------------------------|
| customer-0049 (Brenda Shields) | existing Phoenix customer | `1ee3ff39-7adb-4085-a178-3cea109ddb5b` |
| customer-0225 (Kevin Shier) | existing Phoenix customer | `69058467-d41e-445b-9517-0e1b90c2fdc1` |
| customer-0026 (Angie) | **EXCLUDE_FROM_AUTOMATED_IMPORT**; invoice `18WKSZ` manual | — |

## Pre-resume checklist

| # | Requirement | Engineering artifact |
|---|-------------|----------------------|
| 1 | Single-run MySQL advisory lock (`WORKIZ_IMPORT_ALREADY_RUNNING`) | `workiz-phase6-import-lock.ts` |
| 2 | Recovery-aware matching + owner pins | `workiz-historical-production-customer-match.ts`, `workiz-phase6-resume-owner-decisions.ts` |
| 3 | Angie excluded; cohort totals recalculated | `workiz-phase6-resume-cohort.ts`, gate `resumeCohort` in `phase6-pre-write-gate.json` |
| 4 | Customer provenance in same transaction as invoice package | `workiz-phase6-production-import-pass.ts` |
| 5 | Recovery-shaped simulation (customersCreated=0 first pass; idempotent second pass) | `npm run workiz:phase6:recovery-simulation:execute` → `phase6-recovery-simulation-report.json` |
| 6 | Fresh read-only production gate | `npm run workiz:production:gate:prod-db` |
| 7 | Fresh mysqldump **immediately before** eventual GO execution | Orchestrator backup step (not run until GO) |

## Advisory lock — stale / crash behavior

- Lock name: `phoenix_workiz_phase6_production_import`
- Acquired with `GET_LOCK(name, 0)` — concurrent runners fail immediately with **`WORKIZ_IMPORT_ALREADY_RUNNING`**
- Released in `finally` via `RELEASE_LOCK` on normal completion or handled failure
- If the import process **crashes** or the DB connection drops, MySQL releases the session lock automatically — no manual unlock required

## Resume cohort (after Angie exclusion)

Parsed at gate time into `approvedCohort` / `resumeCohort` in:

- `backend/_runtime_harness/workiz-migration/phase6-pre-write-gate.json`

Gate **PASS** for resume requires:

- `recoveryZeroNewCustomersProjected: true`
- `noWorkizHistoricalImportInvoicesYet: true`
- Resume invoice/cluster counts match parsed PDF cohort minus exclusions

## Latest verification snapshot (2026-10-05)

| Check | Result |
|-------|--------|
| Recovery simulation | **PASS** — `phase6-recovery-simulation-report.json` (customersCreated=0, invoicesCreated=338, idempotent second pass) |
| Production gate (read-only) | **FAIL** — `migrationLedgerValid: false` (DB executed **62**, repo expects **63** active migrations). All resume-specific checks **PASS** (zero new customers projected, 0 Workiz historical import invoices, org/db/slug OK). |
| Fresh mysqldump before GO | **Not run** (by design until owner GO) |

Resume cohort totals (Angie excluded): **333** clusters, **338** invoices, **438** payment events, **338** source documents, **15,178,093** invoice cents, **15,126,673** payment cents.

## Rule

- **All checklist items PASS** → owner may authorize **GO — Phase 6 Resume** (fresh backup, then single-process import).
- **Any FAIL** → **NO-GO**; do not run `workiz:production:import:prod-db`.
