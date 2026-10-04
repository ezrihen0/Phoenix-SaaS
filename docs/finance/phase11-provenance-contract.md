# Phase 11 — Unified historical provenance contract (internal-only)

Customer-facing UI and normal invoice numbers must **not** expose Workiz identifiers. Provenance below is for audit, re-import idempotency, and staff tooling only.

## Customer

**Storage:**

- `customers.external_client_number` ← canonical source customer ID when available
- `customers.legacy_created_at` ← source created date when available
- `customers.notes` ← optional Phoenix marker block

**Phoenix notes marker** ([`phoenix-customer-import.provenance.ts`](../../backend/src/integrations/phoenix/phoenix-customer-import.provenance.ts)):

```json
{
  "sourceSystem": "workiz",
  "sourceCustomerId": "<id>",
  "sourceReference": "<human ref>",
  "importBatch": "<batch-id>",
  "importedAt": "<iso8601>"
}
```

Prefixed in notes as `[phoenix_workiz_import:v1]` + JSON.

**Idempotency key:** `(organization_id, source_system, source_customer_id, import_batch)` via `provenanceMatchesBatch`.

## Invoice (branding snapshot JSON)

**Required fields for Workiz historical rows:**

| Field | Purpose |
|-------|---------|
| `import_source` | Must be `workiz_historical_import` |
| `source_kind` | `csv` \| `pdf` |
| `workiz_invoice_code` | Internal source invoice ID |
| `workiz_job_code` | Internal source job reference (nullable) |
| `source_filename` | Original file name |
| `imported_at` | ISO timestamp |
| `enrichment_status` | `pending_pdf` \| `complete` |

**Optional enrichment block (`pdf_enrichment`):** payments snapshot, operational lines, customer snapshot, terms, warranty — machine-readable until v3 snapshot backfill.

**Idempotency key:** `(organization_id, workiz_invoice_code)` — see `loadExistingWorkizImportIndex`.

## Invoice documents

| Field | Purpose |
|-------|---------|
| `document_kind` | `workiz_source_pdf` or `native_customer_pdf` |
| `import_source` | `workiz_historical_import` vs `native_wizfield` |
| `workiz_invoice_code` | Internal cross-link |
| `file_hash` | SHA-256 of PDF bytes (dedupe) |

**Idempotency key:** `(organization_id, invoice_id, document_kind, file_hash)`.

## Payments (when explicitly imported)

- Reference pattern: `workiz:{INVOICE_CODE}:payment:{n}`
- Native recordings use `idempotency_key` on `invoice_payments`

**Rule:** Payment **evidence** (legacy paid flag, zero ledger rows) is not the same as verified ledger entries (`paidReason: legacy_status_migration`).

## Import run (future)

No dedicated table in Phase 11. Recommended migration metadata:

```json
{
  "import_run_id": "uuid",
  "source_system": "workiz",
  "target_organization_id": "uuid",
  "started_at": "iso8601",
  "corpus_version": "optional tag"
}
```

**Tenant rule:** `target_organization_id` must be supplied by the importer runtime — never parsed from CSV/PDF.

## Customer-facing numbering

- **Display:** `invoices.document_number` (canonical WizField sequence)
- **Never** use `workiz_invoice_code` as the normal customer-facing number after migration (allocate on import)

## Michael field historical report (native operational)

Separate from Workiz import. Marker in customer/job notes: `[phoenix_michael_field_report:v1]` ([`phoenix-field-report-provenance.ts`](../../backend/src/phoenix-field-report/phoenix-field-report-provenance.ts)). Batch audit tables: `phoenix_field_historical_report_batches` / `_entries`. Finance origin remains **native** (no `workiz_historical_import` on `import_source`).
