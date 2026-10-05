# Jobber → Phoenix production import runbook

Target: **Phoenix Fireplace** on production MySQL **`wizfield`**, staff app [https://app.phoenixfireplace.ca](https://app.phoenixfireplace.ca).

## Inputs

Place Jobber report CSVs (gitignored) in repo `data/jobber-export/`:

- `clients-contact-info.csv`
- `visits-schedule.csv`
- `invoices.csv`

Do not commit these files or production credentials.

## Preconditions

1. Run pending migrations on production (includes `customers.tags` for the **JOBBER** tag).
2. Confirm `backend/.env` points at the intended database (`DB_NAME=wizfield` for production).
3. Org sanity: operating slug `phoenix-fireplace`, id `8d5bc762-eb13-43e5-85a1-723477adb47c`.

## Commands (from `backend/` workspace)

Preview (read-only writes to DB; no mutations):

```bash
npm run jobber:preview
```

Execute (requires explicit production opt-in):

```bash
set JOBBER_ALLOW_PRODUCTION_MUTATION=1
npm run jobber:import
```

Or pass `--allow-production-mutation` (already included in the `jobber:import` script).

Read-only verification counts:

```bash
npm run jobber:verify
```

JSON reports are written under `backend/reports/jobber-import/` (gitignored).

## What the import does

1. **Customers** — match/enrich existing CRM rows; apply tag **JOBBER**; stable `external_client_number` prefix `jobber:`.
2. **Visits → jobs** — idempotent visit keys; **only future, incomplete** visits get `scheduled_for` / `scheduled_window` for `/schedule`; past/completed visits stay historical with no calendar slot.
3. **Invoices** — idempotent on Jobber invoice `#`; strict customer match (no guessed links); synthetic payment row only when invoice is paid with zero balance.

## Owner spot-check after execute

- Customer profiles show **JOBBER** tag where expected.
- [https://app.phoenixfireplace.ca/schedule](https://app.phoenixfireplace.ca/schedule) shows future open Jobber visits only.
- Sample customer invoices match Jobber totals; re-running preview should show duplicates, not new creates.

## Rollback note

This pipeline does not auto-delete imported rows. Re-run preview before execute; use DB backup/restore per [WizField DR runbook](../../PHOENIX_SOURCES/WizField_Disaster_Recovery_and_Rebuild_Runbook.md) if a full rollback is required.
