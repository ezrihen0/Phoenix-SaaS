# Workiz Phase 6 — Controlled Production Import

**Status:** Pre-production CLOSED / PASS. **Production import is frozen** after interrupted customer-only write; resume requires owner **GO** per `WORKIZ_PHASE6_RESUME_GO_NOGO.md`.

**Resume safe cohort:** PDF-eligible cohort **minus** owner exclusions (Angie / invoice `18WKSZ`). Exact counts are in each fresh `phase6-pre-write-gate.json` (`resumeCohort`).

**Production target**

| Item | Value |
|------|--------|
| Staff app | https://app.phoenixfireplace.ca |
| Portal | https://portal.phoenixfireplace.ca |
| Database | `wizfield` |
| Organization | `8d5bc762-eb13-43e5-85a1-723477adb47c` (Phoenix Fireplace) |

Do **not** use `app.wizfield.com` as the production target. Do **not** write to any other organization.

**Immutable batch id (default):** `WORKIZ-CALGARY-2026-10-PROD-001`  
Override: `WORKIZ_PRODUCTION_BATCH_ID`

---

## Excluded from this import

- 70 financial `MANUAL_REVIEW` invoices  
- Natalie identity-review cluster  
- Ambiguous identity matches (skipped per invoice)  
- Any record failing financial gate or source linkage  

---

## Operator sequence

### 1. Pre-write gate (read-only on production DB)

```bash
cd backend
npm run workiz:production:gate
```

Writes:

- `backend/_runtime_harness/workiz-migration/phase6-pre-write-gate.json`
- Baseline counts + commit + migration count

### 2. Production logical backup (mandatory)

The import orchestrator runs `mysqldump` against configured `wizfield` before first write.

Requirements:

- `mysqldump` on PATH  
- DB credentials in `backend/.env` pointing at **production** `wizfield`  
- Backup stored under `backend/_runtime_harness/workiz-migration/production-backups/`  
- SHA-256 recorded in the Phase 6 report  

If backup fails → **STOP** (no import).

Source PDFs remain on owner OneDrive; DB provenance is in `branding_snapshot_json`. Separate object-storage backup is only needed if `invoice_documents` rows are added for this batch.

### 3. First production import pass + verification + idempotency pass

```bash
cd backend
set WORKIZ_ALLOW_PRODUCTION_MUTATION=1
set WORKIZ_INVOICE_PDF_SOURCE_DIR=<path to Workiz invoice PDFs>
npm run workiz:production:import
```

Flags (already in npm script):

- `--execute-production-import`
- `--confirm-phoenix-production`
- `--allow-production-mutation`

**Emergency only:** `--skip-backup` (not for normal operations).

### 4. Manual audit + portal verification

Use the 20-case sample in:

- `docs/migration/WORKIZ_PHASE6_PRODUCTION_IMPORT_CLOSEOUT.md`
- `backend/_runtime_harness/workiz-migration/phase6-production-import-report.json`

Confirm chain: PDF → Customer → Job → Invoice → Lines → Payments → Warranty → Source evidence.

Portal checks at https://portal.phoenixfireplace.ca (no customer emails yet).

---

## Implementation notes

- Orchestrator: `backend/src/database/workiz-historical-production-orchestrator.ts`
- Customer match: email → phone → strong name+address; ambiguous → skip (no name-only merge)
- Historical jobs: status `completed` / `paid` only (no future `/schedule` placement)
- Single-run lock: `GET_LOCK('phoenix_workiz_phase6_production_import', 0)` for the entire import; concurrent runner → `WORKIZ_IMPORT_ALREADY_RUNNING`
- Invoice package: **one DB transaction per invoice** including customer provenance/tag/external-key updates, job, invoice, lines, payments, service intelligence, warranty
- Recovery simulation: `npm run workiz:phase6:recovery-simulation:execute` (ephemeral DB; seeds from `phase6b-customer-reconciliation.json`)
- Warranty: parser v1.1 / Phase 5.5 rules (`DOCUMENTED`, `AMBIGUOUS_WARRANTY`, `PHOENIX_DEFAULT_POLICY`)

---

## Rollback triggers

Stop and assess before any destructive rollback if:

- Cross-org mismatch > 0  
- Duplicate payments or duplicate invoice creation on idempotency pass  
- Material money mismatch vs **resume** cohort totals in `phase6-pre-write-gate.json` (`invoiceValueCents` / `paymentCents`)  
- Customer identity corruption, portal mismatch, wrong org, systemic warranty corruption  

---

## After Phase 6

- **Branch A — MANUAL REVIEW CLEANUP:** 70 invoices  
- **Branch B — CALGARY REACTIVATION:** marketing/service segments → `CALGARY REACTIVATION DATABASE — READY`
