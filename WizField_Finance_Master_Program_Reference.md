# WizField Finance Master Program Reference

**Document type:** Execution Reference / Master Program Map  
**Project:** WizField  
**Program:** Finance / Estimates / Invoices Production Cleanup  
**Status:** Planning reference — no implementation authority by itself  
**Owner intent:** Build a reliable, production-safe Finance spine for WizField in controlled layers.

---

# 1. Purpose

This document is the master reference for the complete WizField Finance cleanup program.

It exists so every future agent or execution package understands:

- the full Finance roadmap
- the order of execution
- the boundary of each Part
- what must already be true before the next Part begins
- which areas are protected
- what must not be mixed together
- what "done" means for the whole Finance program

This file does **not** authorize implementation on its own.

Every Part still requires:

1. a specific execution plan
2. exact file inventory
3. owner approval
4. implementation
5. testing
6. closeout
7. canonical documentation updates when product truth changes

---

# 2. Program North Star

WizField Finance must become one coherent operating spine:

```text
Customer
→ Job
→ Estimate
→ Invoice
→ Payment Ledger
→ Financial Lifecycle
→ Historical Snapshot
→ PDF / Customer Document
→ Customer / Portal / Reporting
```

The system must be understandable from both directions:

```text
Owner UX
→ business action
→ API
→ service
→ data model
→ financial truth
→ historical document
```

and:

```text
Stored financial truth
→ lifecycle
→ document snapshot
→ PDF
→ customer-visible output
```

The target is **not** merely to fix the invoice screen.

The target is a reliable Finance domain for WizField.

---

# 3. Program Execution Rules

## 3.1 Controlled execution

Work must be completed one Part at a time.

Do not execute multiple Parts simultaneously unless the owner explicitly approves a combined scope.

## 3.2 Production safety

Finance contains real customer and money data.

Protected areas include:

- invoices
- estimates
- payments
- payment ledger
- financial calculations
- historical snapshots
- document/PDF history
- Workiz imported records
- tenant isolation
- production database
- organization ownership

## 3.3 No broad cleanup

Do not perform unrelated:

- refactors
- naming cleanup
- dependency upgrades
- schema cleanup
- UI redesign
- migration rewriting

unless directly required by the approved Part.

## 3.4 Backend authority

The final financial truth must be backend-authoritative.

Frontend math may exist for preview and UX, but it must not become a competing financial authority.

## 3.5 Historical truth

Historical financial/customer-facing documents must not silently change because of later edits to:

- customers
- jobs
- organization settings
- Pricebook
- warranties
- payment instructions
- renderer templates
- translation settings

## 3.6 Imported historical truth

Workiz historical records are evidence of past business activity.

They must not be silently normalized to match future native WizField models.

---

# 4. Complete Program Map

The Finance program is divided into **7 Parts** covering the original 16 phases.

```text
PART 1
Production Truth & Finance Contract
Phases 0–1

PART 2
Core Creation Flows
Phases 2–3

PART 3
Conversion & Money Engine
Phases 4–5

PART 4
Ledger & Historical Snapshot Foundation
Phases 6–7

PART 5
Document Engine
Phases 8–10

PART 6
Historical Data & Product Integrations
Phases 11–12

PART 7
Hardening, UX & Production Closeout
Phases 13–15
```

Dependency direction:

```text
Part 1
↓
Part 2
↓
Part 3
↓
Part 4
↓
Part 5
↓
Part 6
↓
Part 7
```

Later Parts may depend on truths created by earlier Parts.

Do not skip dependencies.

---

# PART 1 — Production Truth & Finance Contract

**Original phases:** 0–1

## Goal

Establish exactly what exists in production and define the canonical Finance rules before implementation begins.

## Scope

### Phase 0 — Production Truth & Baseline

Establish:

- canonical Phoenix production organization
- real production database
- real Finance row counts
- native WizField vs imported Workiz records
- current runtime invoice path
- current Invoice / Estimate / Payment / PDF behavior
- production anomalies
- actual owner blockers

### Phase 1 — Finance Domain Contract

Define:

- entity ownership
- financial authority
- financial invariants
- estimate lifecycle
- invoice lifecycle
- payment ledger lifecycle
- snapshot rules
- historical document rules
- imported Workiz rules
- PDF boundary

## Required outputs

- Production Truth report
- Finance Domain Contract
- Financial Invariant Matrix
- Estimate lifecycle contract
- Invoice lifecycle contract
- Payment lifecycle contract
- Historical Snapshot Contract
- Owner decision list
- Part 2 readiness verdict

## Explicitly out of scope

- code fixes
- schema changes
- migrations
- invoice redesign
- PDF redesign
- payment repair
- Workiz data repair

## Exit gate

Part 1 is complete only when:

```text
Production truth verified OR explicitly blocked with exact reason
Finance domain contract complete
Financial invariants defined
Snapshot contract defined
Owner decisions resolved or listed
Part 2 can be planned safely
```

---

# PART 2 — Core Creation Flows

**Original phases:** 2–3

## Goal

Make Invoice and Estimate creation reliable, simple, and canonical.

## Phase 2 — Invoice Creation V2

Target owner flow:

```text
Quick Create
→ Invoice
→ Customer
→ Job / required context
→ Invoice Composer
→ Lines
→ Tax / supported pricing
→ Save Draft
→ Resume / Edit
```

### Required capabilities

- canonical Quick Create route
- real New Invoice flow
- customer selection
- job selection or owner-approved job bootstrap
- one canonical invoice composer
- manual line creation
- Pricebook line creation
- save
- reload
- edit
- permission handling
- tenant-safe ownership

### Part 2 implementation truth (Finance creation — 2026-09)

**Routes**

- Invoice chooser: `/invoices/create` (legacy `/invoices/new` redirects with query preserved).
- Invoice owner composer: `/invoices/create/[jobId]`.
- Estimate chooser: `/estimates/create` (legacy `/estimates/new` redirects).
- Estimate owner composer: `/estimates/create/[jobId]`.
- Job detail tabs (`?tab=invoice`, `?tab=quote`) are **action hubs**: summary plus **Create / Open / Edit** links to owner composers (`/invoices/create/[jobId]`, `/estimates/create/[jobId]`) and document detail—no embedded second composer on the job page.

**Post-save (owner composers — locked)**

- Save **does not** auto-navigate to document detail.
- Composer stays open; shows explicit **Saved** acknowledgement; hydrates invoice/estimate id and state for resume/edit.
- **View Invoice** / **View Estimate** is an explicit action after the document exists.

**Minimal job bootstrap (shared)**

- `FinanceJobBootstrapPanel` on invoice and estimate choosers when a customer has no jobs.
- Owner selects **job type** and **service type**; service address is prefilled from the customer when present and editable.
- No fabricated defaults for type, scheduling, technician, or internal notes. Full intake remains at `/jobs/new`.

**Owner vs job-tab composer**

- Owner: no pull-from-quote, no record-full-payment (invoice), no mark-approved shortcut (estimate).
- Job tab: convert-from-estimate, record-full-payment, and mark-approved shortcuts remain on the job finance tabs; line editing lives only in owner composers.

### Product question to resolve

Determine whether:

```text
One Invoice per Job
```

is:

- intended product truth

or:

- a current technical limitation

Do not casually remove this rule without owner approval.

## Phase 3 — Estimate System Cleanup

Build a coherent Estimate creation path with:

- canonical composer
- customer/job context
- manual lines
- Pricebook lines
- bundles where supported
- tax
- totals
- statuses
- approval
- signature
- lock/finalization rules

The Estimate system should share concepts with Invoice where appropriate without forcing unsafe premature abstraction.

## Explicitly out of scope

- Estimate → Invoice conversion engine
- payment ledger redesign
- PDF V2
- invoice numbering
- discount architecture unless required to preserve existing truth

## Exit gate

```text
Invoice creation reliable
Estimate creation reliable
Core save/edit/reload flows tested
Tenant isolation tested
No conversion or payment redesign accidentally mixed in
```

---

# PART 3 — Conversion & Money Engine

**Original phases:** 4–5

**Implementation status:** Shipped in codebase (money engine + conversion API + job-tab UI). Discounts remain deferred.

## Goal

Make financial transformation and calculation deterministic.

## Part 3 implementation truth (2026-09)

**Money engine (Phase 5 — CLOSED)**

- **Status:** **CLOSED** (2026-09-26). Canonical native document math: line subtotal via quantity thousandths → document subtotal → tax (document-level bps) → total; **discounts deferred** (`discountCents: 0`).
- Backend authority: [`MoneyEngineService`](backend/src/crm/money-engine.service.ts) / [`money-engine.core.ts`](backend/src/crm/money-engine.core.ts) (`DocumentMoneyResult`, `computeDocumentMoney`). [`DocumentSnapshotService`](backend/src/crm/document-snapshot.service.ts) and CRM upsert/conversion call **MoneyEngineService** directly.
- Native writes: `amount_cents === total_cents` (invoice) and `price_cents === total_cents` (estimate) on persist; legacy flat upsert without `lineItems` remains deprecated.
- Invoice/estimate default tax when omitted: job **branch** `default_tax_rate_bps` (same resolver for both).
- Frontend preview parity: [`frontend/lib/crm/money-engine.ts`](frontend/lib/crm/money-engine.ts) matches backend quantity rules; `money-engine:parity-check`.
- Upsert paths reject client total drift when line items are present (`totals_mismatch`).
- Checks: `npm run finance-part5:checks` (unit + parity + persistence contract + Phase 4 conversion smokes). Configured local DB closeout: `FINANCE_SMOKE_USE_CONFIGURED_DATABASE=true npm run finance-part5:configured-db-verification` (2026-09-26 **PASS** on `wizfield`).

**Estimate → Invoice conversion (Phase 4 — CLOSED)**

- **Status:** **CLOSED** (2026-09-26). Configured-DB suite **PASS** on local non-production `wizfield` (`FINANCE_SMOKE_USE_CONFIGURED_DATABASE=true`, `npm run estimate-invoice-conversion:smoke:suite`). Smoke JSON reports **`outcome`: PASS | SKIP | FAIL** (ephemeral CREATE DATABASE denied → **SKIP**, not PASS).
- API: `POST /api/jobs/:jobId/invoice/convert-from-estimate` with optional `{ estimateId }`.
- Eligibility: estimate must be **approved or signed** (`approved_at` or `signed_at`); **`status === rejected` is always blocked** even if timestamps remain.
- Copies **persisted `quote_line_items` snapshots** via `copyQuoteLineSnapshotsToInvoiceDrafts` (no live Pricebook on this path; composer `buildLineDrafts` is out of scope).
- Totals: `MoneyEngineService.computeSnapshotTotals` from copied unit prices + `quotes.tax_rate_bps_snapshot`.
- Provenance: `invoices.source_quote_id` → API `source_estimate_id`; audit `estimate.convert_to_invoice`.
- Job tab UI: **Convert from estimate** (visible when no invoice, or invoice shell with **zero lines**); owner composer unchanged.
- **Overwrite rule:** if the job invoice already has **any line items** and this is not the idempotent same-estimate case → `409 invoice_exists` (no silent replace). Same estimate + lines already present → `409 invoice_already_converted`.
- Other guards: `409 invoice_locked`, `409 invoice_has_payments`, `400 estimate_has_no_lines`, `404` tenant/job/estimate mismatch.
- Checks: `estimate-invoice-conversion:contract-check`; DB suite `estimate-invoice-conversion:smoke:suite` (integration + pricebook drift); `finance-part3:checks` runs unit/contract/jobs-access then DB smokes (SKIP when ephemeral DB cannot be created).

## Phase 4 — Estimate → Invoice Conversion Engine

Replace frontend-style "pull from quote" behavior with an explicit conversion contract.

Required rule:

> The Invoice created from an Estimate must copy frozen Estimate customer-facing financial truth and must not silently rebuild values from live Pricebook data.

### Conversion should preserve

- line name
- description
- quantity
- unit price
- warranty/customer-facing line data
- tax basis
- approved values
- estimate provenance

Store or expose the relationship:

```text
Invoice created from Estimate X
```

where technically appropriate.

## Phase 5 — Money Engine

Create one canonical backend financial authority for:

```text
Line Amount
→ Subtotal
→ Discount
→ Taxable Amount
→ Tax
→ Total
```

Define and implement:

- rounding rules
- quantity behavior
- line pricing
- document pricing
- discounts if approved
- tax calculation
- taxable/non-taxable policy if required
- stored vs derived values

Frontend calculations become preview/parity behavior only.

## Explicitly out of scope

- payment ledger overhaul
- PDF V2 layout
- historical PDF persistence
- Workiz bulk repair

## Exit gate

```text
Estimate conversion snapshot-safe
Backend money engine authoritative
Frontend/backend parity verified
No live Pricebook drift after approved Estimate conversion
```

---

# PART 4 — Ledger & Historical Snapshot Foundation

**Original phases:** 6–7

## Goal

Make money state and historical document truth reliable.

## Phase 6 — Payment Ledger & Financial Lifecycle

Payment ledger becomes the canonical basis for financial lifecycle.

Required lifecycle model should define behavior for:

- unpaid
- partial
- paid
- overpaid
- refunded
- adjustment
- void
- cancelled

Required rules include:

```text
net payment truth comes from ledger
balance derives from financial truth
paid must have a canonical reason
overpayment must remain visible
refund must affect lifecycle correctly
dashboard/reporting must not rely on stale legacy status
```

Any legacy `invoice.status` behavior must be reconciled with the canonical lifecycle contract.

## Phase 7 — Historical Snapshot Foundation

Create the historical customer-facing truth required for stable invoices.

Snapshot requirements may include:

- business identity
- logo reference if used
- business address
- business phone/email
- customer Bill To identity
- customer address
- service address
- job/service reference
- line content
- quantities
- pricing
- discounts
- tax
- totals
- warranties
- terms
- payment instructions
- dates
- immutable invoice identifier

Snapshot timing must be explicit.

Possible lifecycle points:

- save
- send
- approval
- signature
- finalization

The owner-approved contract decides the final rule.

## Part 4 implementation truth (2026-09)

**Ledger (Phase 6 — CLOSED)**

- **Status:** **CLOSED** (2026-09-26). Ledger is canonical for native payment lifecycle; configured local DB closeout: `FINANCE_SMOKE_USE_CONFIGURED_DATABASE=true npm run finance-part6:configured-db-verification` (2026-09-26 **PASS** on `wizfield`; includes Phase 5 regression).
- Canonical math: [`invoice-financial-lifecycle.core.ts`](backend/src/crm/invoice-financial-lifecycle.core.ts) via [`InvoicePaymentLedgerService`](backend/src/crm/invoice-payment-ledger.service.ts). Native writes: [`invoice-native-ledger-policy.ts`](backend/src/crm/invoice-native-ledger-policy.ts) (`resolveNativeUpsertInvoiceStatus`, refund caps, void/cancelled payment guard).
- Legacy `invoices.status` / `paid_at`: synced from ledger on payment recording only; native upsert cannot set `paid` without ledger evidence (`409 invoice_paid_requires_ledger`). Workiz historical may still read `legacy_status_migration` when `status=paid` and zero payment rows.
- API: `lifecycle_status`, `balance_cents`, `overpayment_cents`, `amount_paid_cents`, `paid_reason` on payment record response; job status → paid no longer sets invoice paid without ledger.
- Product defaults (owner): overpayment allowed; payments blocked on void/cancelled; payments allowed after customer snapshot freeze; full refund → `refunded` lifecycle.
- Checks: `npm run finance-part6:checks` (lifecycle unit + native write contract + Phase 5 checks).
- Document-terminal lifecycle: `void` / `cancelled` when `invoices.voided_at` / `cancelled_at` set (columns present; workflow UI deferred).
- Office dashboard open-invoice counts/lists use ledger summaries, not `invoices.status = unpaid` alone.

**Customer-facing snapshot (Phase 7 — CLOSED)**

- **Status:** **CLOSED** (2026-09-26). Configured local DB closeout: `FINANCE_SMOKE_USE_CONFIGURED_DATABASE=true npm run finance-part7:configured-db-verification` (2026-09-26 **PASS** on `wizfield`; includes Phase 6 regression).
- Schema v3 ([`invoice-customer-facing-snapshot.types.ts`](backend/src/crm/invoice-customer-facing-snapshot.types.ts)): `document_kind`, explicit `copy.*` terms/warranty/payment text, `provenance`, job-derived `service_location` (distinct from bill-to customer address), optional `branch` block on send.
- Invoice column: `invoices.customer_facing_snapshot_json`. Estimate column: `quotes.customer_facing_snapshot_json` (migration `1791000000000-quote-customer-facing-snapshot`).
- **Freeze triggers:** invoice — first customer-facing send via [`InvoiceSendPipelineService`](backend/src/crm/invoice-send-pipeline.service.ts); estimate — first of sent / approved / signed via [`InvoiceCustomerFacingSnapshotService.freezeEstimateRecord`](backend/src/crm/invoice-customer-facing-snapshot.service.ts).
- Guards: `409 invoice_customer_snapshot_frozen`, `409 estimate_customer_snapshot_frozen`.
- Read boundaries: [`InvoicePdfViewModelService`](backend/src/crm/invoice-pdf-view-model.service.ts) frozen-only snapshot path; portal prefers snapshot lines/copy when frozen; [`buildHistoricalSnapshotAiReadModel`](backend/src/crm/historical-snapshot-read.helper.ts) for AI reads.
- Checks: `npm run finance-part7:checks` (send snapshot contract + historical read unit + Part 6 checks).

## Explicitly out of scope

- visual PDF V2 redesign
- invoice sequence redesign unless required structurally
- portal redesign

## Exit gate

```text
Ledger authoritative
Lifecycle reproducible
Old invoice customer/settings edits cannot alter frozen truth
Snapshot model verified
```

---

# PART 5 — Document Engine

**Original phases:** 8–10

## Goal

Turn correct Finance truth into durable professional customer documents.

## Phase 8 — Invoice PDF V2

PDF V2 must render from the canonical document snapshot / Finance truth.

Target information architecture:

```text
Business Header
Invoice Number / Dates / Status

Bill To
Service Location

Job / Service Reference

Line Items
- Name
- Description
- Quantity
- Unit Price
- Discount
- Tax
- Amount

Subtotal
Discount
Tax
Total

Payments
Balance Due

Customer Notes
Warranty / Terms
Payment Instructions

Business Footer
```

PDF is a renderer.

PDF must **not** become a source of financial truth.

### Phase 8 alignment requirement (Phoenix Portal / invoice presentation)

**Do not** create a separate WizField PDF design system. Phase 8 consolidates Phoenix product document presentation, not a competing template.

**Canonical architecture:**

```text
HistoricalDocumentRenderInput
  → PhoenixInvoiceDocumentViewModel
  → shared Phoenix document section contract
  → React Phoenix invoice template
  → PDF renderer
```

The **same** canonical view model and **section order** must drive:

- Staff invoice preview
- Portal HTML invoice preview
- PDF download
- Email attachment
- Portal PDF fallback (native on-the-fly render)

**Backend foundation:** Evolve [`InvoicePdfViewModelService`](backend/src/crm/invoice-pdf-view-model.service.ts) into the shared builder (`PhoenixInvoiceDocumentViewModel` naming in plan/docs); do **not** introduce a competing customer-facing field model.

**Drift to eliminate:**

- Staff [`DocumentPreview`](frontend/components/document-preview.tsx) composes from **live** CRM detail props today.
- Backend PDF is **snapshot-first** via the view model when frozen.
- Customer portal has **PDF only** — no HTML invoice document view aligned with staff/PDF.

**Visual language to reuse (not replace):**

- [`DocumentPreview`](frontend/components/document-preview.tsx) section hierarchy and print-oriented layout
- [`InvoiceCompanyHeader`](frontend/components/invoice-company-header.tsx) for business header block
- [`WarrantyCertificatePreview`](frontend/components/warranty-certificate-preview.tsx) full-document pattern
- Existing [`InvoicePdfService`](backend/src/crm/invoice-pdf.service.ts) section order (Bill To / Service Location / job / lines / totals / payments / copy footer)

**Naming note:** `phoenix-v1` ([`branch-document-snapshot.ts`](backend/src/crm/branch-document-snapshot.ts)) is **branch snapshot metadata** (`template_version` on branch blocks), **not** an invoice HTML/PDF template identifier.

## Phase 9 — Document Storage & Versioning

Durable native WizField invoice PDF history (implemented — see Part 5 **Document storage**).

**Contract (summary):**

- **Version rule:** new `native_customer_pdf` row when PDF `file_hash` changes; idempotent resend when bytes unchanged.
- **Frozen vs ledger:** Phase 7 snapshot immutability in `snapshot_hash`; paid/balance on PDF reflects ledger at render time.
- **Surfaces:** staff download = live; portal PDF = live; email/send = persisted artifact bytes.
- **Workiz:** `workiz_source_pdf` preserved separately; no customer-facing “Workiz” labeling.

Required ability:

> Know exactly which customer-facing document version existed or was sent at a given point in time.

Imported source PDFs must remain distinguishable from native WizField PDFs.

## Phase 10 — Invoice Numbering

Replace UUID-prefix draft display with business-grade **organization-scoped** numbering stored on the invoice row.

**Domain rule:** `invoices.id` (UUID) is the internal identity; `invoices.document_number` is the customer-facing business number (never used alone for authz).

**V1 product truth (owner-approved):**

- **Scope:** one sequence per **organization** (`organization_invoice_sequences`); branch-specific sequences deferred.
- **Format:** numeric string stored in `document_number` (e.g. `1001`, `1002`); optional display prefixes are presentation-only, not required in storage.
- **Assignment:** allocated **once** on first customer-facing send / Phase 7 snapshot freeze via [`InvoiceSendPipelineService`](backend/src/crm/invoice-send-pipeline.service.ts) + [`InvoiceNumberingService`](backend/src/crm/invoice-numbering.service.ts) (pessimistic lock on sequence row). **Not** on invoice upsert.
- **Drafts (unsent native):** [`resolveInvoiceDisplayNumber`](backend/src/crm/invoice-display-number.ts) falls back to `INV-{uuid8}` until send.
- **Legacy / Workiz historical:** rows without native `document_number` keep provenance-based or uuid fallback; no production backfill in Phase 10.

Required properties:

- immutable after assignment
- unique per `(organization_id, document_number)`
- concurrency-safe (sequence row lock, not `MAX+1`)
- retry/idempotent on resend
- gaps acceptable; numbers never reused after void/cancel

Do not rewrite historical imported invoice identifiers without explicit owner approval.

## Part 5 implementation truth (2026-09)

**Invoice PDF V2 (Phase 8 — CLOSED)**

- **Status:** **CLOSED** (2026-09-26). Configured local DB: `FINANCE_SMOKE_USE_CONFIGURED_DATABASE=true npm run finance-part8:configured-db-verification` (includes Phase 7 regression).
- **Alignment:** See § Phase 8 alignment requirement — [`PhoenixInvoiceDocumentViewModel`](backend/src/crm/phoenix-invoice-document-view-model.types.ts) via [`PhoenixInvoiceDocumentPresentationService`](backend/src/crm/phoenix-invoice-document-presentation.service.ts) → [`PhoenixInvoiceDocumentTemplate`](frontend/components/phoenix-invoice-document-template.tsx) + [`InvoicePdfService`](backend/src/crm/invoice-pdf.service.ts) (stream PDF; optional local JPEG logo with initials fallback).
- **Surfaces:** CRM `document_view` on invoice detail; portal `GET /api/portal/invoices/:id/document-view` + [`/portal/invoices/[invoiceId]`](frontend/app/portal/invoices/[invoiceId]/page.tsx); PDF download/email/portal fallback share the same builder.
- **Draft:** `legacy_live` + explicit draft banner pre-freeze; frozen snapshot authoritative after Phase 7 freeze.
- **Checks:** `npm run finance-part8:checks`.

**Document storage (Phase 9 — CLOSED)**

- **Status:** **CLOSED** (2026-09-26). Checks: `npm run finance-part9:checks`; configured DB: `FINANCE_SMOKE_USE_CONFIGURED_DATABASE=true npm run finance-part9:configured-db-verification` (includes Phase 8/7/6 regression).
- **Kinds:** `native_customer_pdf` (WizField send artifacts) vs `workiz_source_pdf` (imported source) — never conflated ([`InvoiceDocumentEntity`](backend/src/database/entities/invoice-document.entity.ts)).
- **Native artifact:** immutable rows keyed by `file_hash` (SHA-256 of PDF bytes); `generation_sequence` increments when bytes change (e.g. ledger-at-render differs on resend). `snapshot_hash` records frozen Phase 7 truth only.
- **Send path:** single render in [`completeInvoiceCustomerSend`](backend/src/crm/crm.controller.ts) → persist → email attaches **same** `pdfBuffer`.
- **Staff CRM PDF:** live render (current ledger). **Portal PDF:** live native render ([`InvoiceDocumentsPortalController`](backend/src/documents/invoice-documents/invoice-documents.portal.controller.ts)). Stored bytes = send/audit history (`GET /api/crm/invoices/:id/documents`, `.../documents/:documentId/pdf`).
- **Bytes on disk:** `uploads/invoice-documents/` (require durable volume in production; metadata in MySQL).

**Invoice numbering (Phase 10 — CLOSED)**

- **Status:** **CLOSED** (2026-09-26). Org-wide numeric sequence; allocation on send/freeze only.
- Column: `invoices.document_number` unique per org; [`InvoiceNumberingService`](backend/src/crm/invoice-numbering.service.ts) + `organization_invoice_sequences`.
- Display: [`resolveInvoiceDisplayNumber`](backend/src/crm/invoice-display-number.ts) — assigned number → Workiz historical provenance only → native draft `INV-{uuid8}`.
- **Checks:** `npm run finance-part10:checks`; configured DB: `FINANCE_SMOKE_USE_CONFIGURED_DATABASE=true npm run finance-part10:configured-db-verification`.

## Exit gate

```text
PDF V2 renders canonical snapshot truth
Native document history durable
Invoice numbering production-safe
Old documents remain stable
```

---

# PART 6 — Historical Data & Product Integrations

**Original phases:** 11–12

## Goal

Prepare and validate **historical Finance compatibility** with the finished native spine (Phases 4–10). Reconnect Finance to the rest of WizField in Phase 12.

**Owner override:** The actual Workiz Historical Data + Document Intelligence Migration is a **separate workstream** that runs **only after Phase 15**. Phase 11 does **not** import Workiz data, attach PDFs, reconstruct ledgers, or mutate production historical rows.

## Phase 11 — Historical Finance Reconciliation & Workiz Readiness

Prove native WizField Finance can accept historical business data later without redesign.

**Deliverables:**

- Compatibility report: [`docs/finance/phase11-historical-compatibility-report.md`](docs/finance/phase11-historical-compatibility-report.md)
- Internal provenance contract: [`docs/finance/phase11-provenance-contract.md`](docs/finance/phase11-provenance-contract.md)
- Checks: `npm run finance-part11:checks` (historical compatibility unit tests + readiness gate + Phase 10 regression chain)
- Read-only org audit (optional): `npm run finance-part11:readonly-audit` with `FINANCE_AUDIT_ORG_ID` / `PHOENIX_ORG_ID`
- Readiness artifact: `backend/_runtime_harness/finance-part11/workiz-migration-readiness-gate.json`

**In scope:** model audit, gap register, compatibility tests, migration readiness gate, documentation.

**Out of scope:** Workiz customer/job/invoice import, PDF attach, payment ledger reconstruction, native historical PDF generation, Workiz identifiers in normal customer UI.

**Production row audit (read-only, when org set):** `npm run finance-part6:workiz-audit` — classify existing imported rows; do not repair.

Part 6 classifications (existing rows):

```text
Historical source truth
Import mapping issue
Missing source evidence
Native model incompatibility
Safe repair candidate
Do not repair
```

Pre-import classification vocabulary (future migration) is documented in the Phase 11 compatibility report.

Any write repair requires a separate approved correction plan.

**ACTUAL WORKIZ MIGRATION: DEFERRED UNTIL AFTER PHASE 15**

**Historical compatibility (Phase 11 — CLOSED)**

- **Status:** **CLOSED** (2026-09-26). Checks: `npm run finance-part11:checks` (includes Phase 10 regression chain).
- **Artifacts:** [`docs/finance/phase11-historical-compatibility-report.md`](docs/finance/phase11-historical-compatibility-report.md), [`docs/finance/phase11-provenance-contract.md`](docs/finance/phase11-provenance-contract.md), `backend/_runtime_harness/finance-part11/workiz-migration-readiness-gate.json`.
- **Tenant guard:** [`assertHistoricalImportTargetOrganizationId`](backend/src/crm/finance-historical-import-contract.ts) for future import entrypoints.
- **Certify fix:** Criterion 9 maps to `finance-part10:checks` (includes Part 9 document contract). `finance-cross-surface:readonly-check` wired in `package.json`.

## Phase 12 — Customer / Job / Portal Integration

**Status:** **CLOSED** (2026-09-26).

Reconnect Finance consistently into Customer, Job, Portal, dashboard, and read surfaces using one presentation layer.

**Deliverables:**

- Cross-surface audit: [`docs/finance/phase12-cross-surface-audit.md`](docs/finance/phase12-cross-surface-audit.md)
- [`FinanceInvoicePresentationService.buildJobInvoiceEmbed`](backend/src/crm/finance-invoice-presentation.service.ts) on job detail/list invoice embeds
- Customer `GET /api/customers/:id` → `finance_summary` (FIPS open balance/count)
- Estimate converted invoice pointers; staff invoice document history panel; portal home lifecycle/balance UI
- Dashboard open-invoice parity (balance > 0 + lifecycle); portal isolation P8 finance negative

**Checks:** `npm run finance-part12:checks` (contract gate + Phase 11/10/9 regression chain). Optional DB: `npm run finance-cross-surface:readonly-check`, `npm run portal:isolation:smoke`.

## Part 6 implementation truth (2026-09)

**Unified Finance reads (Phase 12 — CLOSED)**

- [`FinanceInvoicePresentationService`](backend/src/crm/finance-invoice-presentation.service.ts) builds invoice list/detail and job embed fields: ledger totals, numbering, `finance_origin`, `snapshot_frozen`.
- Customer portal home invoice rows expose `lifecycle_status`, `balance_cents`, `amount_paid_cents`; UI uses lifecycle (not legacy `status` alone).
- Home AI money widget and invoice tool reads use ledger open-balance rules via presentation service.

**Phase 11 compatibility (read-only audit optional)**

- `npm run finance-part11:checks` — historical compatibility + Phase 10 regression.
- `npm run finance-part6:workiz-audit` — optional row classification when org env is set.
- **No bulk repair**; Workiz import deferred until after Phase 15.

## Exit gate

```text
finance-part12:checks PASS
Cross-surface audit published
Customer/Job/Portal/dashboard read same ledger + numbering truth
ACTUAL WORKIZ MIGRATION deferred until after Phase 15
```

---

# PART 7 — Hardening, UX & Production Closeout

**Original phases:** 13–15

## Goal

Harden Finance for real production use and close the program.

## Phase 13 — Permissions / Tenant / Audit Trail

**Status: CLOSED (2026-09)**

Verify all financial operations are organization-scoped.

**Canonical tenant rule:** tenant-owned Finance rows are read/written only when `resource.organization_id === ActorContext.organizationId` (or via an org-scoped parent such as job → invoice). Portal access additionally requires `invoice.job.customer_id === portalSession.customer_id`.

Audit surface (staff `/api/*`, portal `/api/portal/*`): invoices, estimates, conversion, payments/refunds, documents/PDF, invoice-number search, customer finance summary, portal home/document-view/pdf.

Requirements:

- no ID-only tenant-owned reads
- backend organization scope authoritative
- correct role permissions (invoice send requires manage, not view-only)
- auditability of high-risk mutations
- foreign-org negative tests

## Phase 14 — Owner UX Polish

Final owner workflow target:

```text
+
→ Invoice
→ Customer
→ Job / Service
→ Lines
→ Tax / Discount
→ Review
→ Save
→ PDF / Send
```

Improve only after underlying Finance truth is stable.

Potential improvements:

- fewer clicks
- sensible defaults
- consistent Estimate/Invoice terminology
- clear status language
- better error messages
- reduced technical jargon
- obvious payment state
- direct navigation
- reliable resume/edit behavior

The goal is operational speed, not decorative redesign.

**Status:** **CLOSED** (2026-09-26).

**Deliverables:**

- Audit + gap register: [`docs/finance/phase14-owner-ux-audit.md`](docs/finance/phase14-owner-ux-audit.md)
- Shared payment UI: [`frontend/lib/crm/invoice-payment-form.tsx`](frontend/lib/crm/invoice-payment-form.tsx) on invoice detail (primary) and job invoice tab (compact)
- Estimate lifecycle labels: [`frontend/lib/crm/estimate-lifecycle.ts`](frontend/lib/crm/estimate-lifecycle.ts)
- Owner copy helpers: [`frontend/lib/crm/finance-owner-copy.ts`](frontend/lib/crm/finance-owner-copy.ts)
- Customer quick action + invoice list `q` / `customerId` API passthrough
- Playwright: [`frontend/scripts/phoenix-test-invoice-ui.mjs`](frontend/scripts/phoenix-test-invoice-ui.mjs) records payment via invoice detail

**Verification:** frontend `npm run build`; manual owner workflow matrix in audit doc; no schema changes.

## Phase 15 — Production Reverification & Finance Closeout

Run final production-grade verification.

Required verification classes:

- migration/schema verification
- invoice creation tests
- estimate creation tests
- conversion tests
- money-engine tests
- partial payment tests
- full payment tests
- refund tests
- overpayment tests
- document snapshot tests
- PDF golden/document tests
- invoice numbering tests
- imported historical compatibility
- tenant negative tests
- real Phoenix production verification
- frontend/backend builds
- git review

Final program status may only be marked closed after evidence is recorded.

## Part 7 implementation truth (2026-09)

**Permissions / tenant / audit (Phase 13 — CLOSED)**

- Table `finance_audit_events` + [`FinanceAuditService`](backend/src/crm/finance-audit.service.ts) logs invoice upsert/send/snapshot freeze/number allocation, payments/refunds/adjustments, estimate upsert/approve/sign/reject, estimate→invoice conversion.
- `npm run finance-endpoint-tenant:check` — all CRM Finance handlers + portal invoice routes require org context.
- `npm run finance-part13:multi-org-idor-smoke` — configured DB foreign-ID matrix (customers, jobs, estimates, invoices, payments, documents, portal PDF/view, invoice-number search isolation).
- `npm run finance-part13:readonly-audit` — production-safe orphan/cross-org invariant counts → `_runtime_harness/finance-part13/phase13-readonly-audit.json`.
- `npm run finance-part13:checks` — tenant + RBAC + audit static contracts chained after Part 12 checks.
- `npm run finance-part13:closeout` — build, Part 13 checks, IDOR smoke, portal isolation (P9–P11 invoice view/pdf), payment smoke, Part 12 regression.
- Portal isolation smoke extended: foreign invoice UUID + same-org other customer denied for document-view and PDF.
- Stored native PDF download uses scoped `findNativeDocumentForInvoice(organizationId, invoiceId, documentId)`.
- Workiz migration (Phase 15+) must reuse the same tenant/portal/document rules — no bypass path.

**Owner UX (Phase 14 — CLOSED)**

- [`frontend/lib/crm/invoice-lifecycle.ts`](frontend/lib/crm/invoice-lifecycle.ts) — invoice lifecycle labels (incl. sent-locked).
- [`frontend/lib/crm/estimate-lifecycle.ts`](frontend/lib/crm/estimate-lifecycle.ts) — estimate lifecycle + document state labels.
- [`frontend/lib/crm/finance-api-errors.ts`](frontend/lib/crm/finance-api-errors.ts) — owner-plain messages + support refs for Finance API codes.
- [`frontend/lib/crm/invoice-payment-form.tsx`](frontend/lib/crm/invoice-payment-form.tsx) — partial/full payment entry (permission-aware).

**Closeout (Phase 15)**

- `npm run finance-part7:closeout` — orchestrates build, Part 6 checks, tenant check, isolation smoke, payment recording smoke.
- `npm run phoenix-finance:closeout-readonly` — read-only org invoice origin counts → `_runtime_harness/finance-program-closeout/phoenix-readonly.json`.

## Post-program closeout & certification (Plans 8–9 — 2026-09)

**Evidence pack (Plan 8)**

- Folder: `backend/_runtime_harness/finance-program-closeout/<timestamp>/` (and `latest/` mirror for key artifacts).
- `npm run finance-part8:evidence-pack` — alias for full certification run.
- No Workiz mutating repair in closeout; read-only audit only when `FINANCE_AUDIT_ORG_ID` or `PHOENIX_ORG_ID` is set.

**§9 certification matrix (Plan 9)**

- `npm run finance-part9:certify` — orchestrates build, Part 6 checks, tenant/isolation/portal smokes, payment recording smoke, frontend `tsc`, Phoenix readonly closeout; optional Workiz audit and Playwright when env flags set.
- `npm run finance-program:finish` — §11 orchestrator: configured-DB smokes, resolves Phoenix org for Workiz audit, then `finance-part9:certify`.
- Emits: `completion-matrix.json`, `closeout-summary.json`, `open-items-waivers.json`, `cross-surface-walkthrough.md`, `CERTIFICATION.md`, `git-sha.txt`.
- Env: `FINANCE_CLOSEOUT_DIR` (output path), `FINANCE_CERTIFY_PLAYWRIGHT=1` (UI smokes), `FINANCE_CERTIFY_MANUAL_PASS=1` (owner completed manual §9 items).
- Program status derived: `COMPLETE` | `COMPLETE WITH WAIVERS` | `NOT COMPLETE` (exit code 1 on `NOT COMPLETE`).

## Exit gate

```text
Finance production behavior verified
Financial truth reproducible
Historical documents stable
Tenant safety verified
Owner workflow usable
Production evidence recorded
```

---

# 5. Original 16-Phase Mapping

| Original Phase | Program Part |
|---|---|
| 0 — Production Truth & Baseline | Part 1 |
| 1 — Finance Domain Contract | Part 1 |
| 2 — Invoice Creation V2 | Part 2 |
| 3 — Estimate System Cleanup | Part 2 |
| 4 — Estimate → Invoice Conversion Engine | Part 3 |
| 5 — Money Engine | Part 3 |
| 6 — Payment Ledger & Lifecycle | Part 4 |
| 7 — Historical Snapshot Foundation | Part 4 |
| 8 — Invoice PDF V2 | Part 5 |
| 9 — Document Storage & Versioning | Part 5 |
| 10 — Invoice Numbering | Part 5 |
| 11 — Historical Finance Reconciliation & Workiz Readiness | Part 6 |
| 12 — Customer / Job / Portal Integration | Part 6 |
| 13 — Permissions / Tenant / Audit Trail | Part 7 |
| 14 — Owner UX Polish | Part 7 |
| 15 — Production Reverification & Closeout | Part 7 |

---

# 6. Program-Wide Financial Invariants

Every Part must preserve these principles.

## 6.1 Core calculation

Conceptually:

```text
Subtotal
- Discounts
= Taxable / Net pre-tax amount

+ Tax
= Total

Total
- Net Payments
= Balance
```

Exact taxability policy must follow the approved Finance contract.

## 6.2 Ledger

Payment truth must be explainable by ledger evidence.

## 6.3 Overpayment

Overpayment must not disappear because balance is clamped to zero.

## 6.4 Historical snapshots

Frozen customer-facing documents must remain reproducible.

## 6.5 Conversion

Approved Estimate customer-facing truth must not change because Pricebook changes later.

## 6.6 Tenant ownership

Every tenant-owned Finance read/write must remain scoped to the active organization.

## 6.7 Imported truth

Historical imported evidence is never silently rewritten merely to satisfy the native WizField model.

---

# 7. Program Stop Conditions

Stop execution immediately if:

- production organization identity is uncertain
- production DB identity is uncertain for a data-bearing operation
- financial formulas cannot be reconciled
- a migration threatens historical Finance data
- a foreign-org financial record becomes readable
- implementation would rewrite Workiz historical truth without an approved repair plan
- PDF work requires inventing missing financial data
- payment lifecycle cannot be reconciled safely
- unexpected files or unrelated modules must be modified
- a Part expands into later Parts without owner approval

When stopping, report:

```text
What happened:
Why it matters:
Affected Part:
Production risk:
Recommended next action:
```

---

# 8. Agent Reference Rule

At the beginning of every Finance Part:

1. Read this Master Program Reference.
2. Read the current canonical WizField Source of Truth files.
3. Read the previous Finance Part closeout.
4. Confirm the current Part number.
5. State what is explicitly in scope.
6. State what later Parts are explicitly out of scope.
7. Produce the required file inventory and risk plan.
8. Wait for owner approval before implementation.

The agent must never interpret this master document as permission to execute all 7 Parts.

---

# 9. Program Completion Definition

The Finance program is complete only when WizField can truthfully satisfy all of the following:

- Owner can reliably create an Estimate.
- Owner can reliably create an Invoice.
- Estimate converts to Invoice without financial drift.
- Backend owns financial math.
- Payment ledger explains payment state.
- Partial/full/refund/overpayment states are deterministic.
- Historical customer-facing Finance truth is immutable.
- Native PDF output is professional and reproducible.
- Native documents have durable historical records.
- Invoice numbers are business-grade and organization-scoped.
- Imported Workiz data remains historically honest.
- Customer, Job, Portal, Dashboard, and reporting use consistent Finance truth.
- Finance is tenant-safe.
- Real Phoenix production data has been reverified.
- Final production evidence is recorded.

---

# 10. Current Program Position

```text
Master Program: DEFINED

Parts 1–7:
IMPLEMENTATION SHIPPED (see Part N implementation truth blocks)

Post-program (Plans 8–9):
Evidence pack + §9 certification orchestrator SHIPPED
Run: npm run finance-part9:certify (backend)

Certification status:
COMPLETE WITH WAIVERS — automated smokes + Workiz audit PASS via finance-program:finish
Remaining waivers: Playwright/manual creation, snapshot/PDF sign-off, cross-surface walkthrough
Evidence: backend/_runtime_harness/finance-program-closeout/latest/
Owner sign-off on CERTIFICATION.md required for COMPLETE (no waivers).
```

---

# 11. Program Finish Master Plan

**Purpose:** Close the Finance program under §9 with evidence, owner sign-off, and no open FAIL rows in the certification matrix.  
**Scope:** Verification, documentation, and ops — **not** new Parts, Workiz bulk repair, or unrelated product work.  
**Definition of done:** `npm run finance-part9:certify` → program status **`COMPLETE`** (waivers only where owner explicitly accepts documented risk) + signed `CERTIFICATION.md` + git review of shipped Parts committed.

## 11.1 Finish gate (single outcome)

```text
§9: all 15 criteria PASS or owner-accepted WAIVED with written reason in open-items-waivers.json
Phase 15: evidence folder timestamped + latest/ mirror updated
§10: updated to PROGRAM CLOSED with certify git SHA and sign-off date
No STOP conditions from §7 triggered during finish work
```

## 11.2 Preconditions (before starting)

| Check | Owner action |
|-------|----------------|
| Canonical Phoenix org | Confirm org id/slug and DB (`PHOENIX_ORG_ID` / `.env` DB) match **production truth** intent |
| Code on disk | Parts 1–7 + Plans 8–9 merged or committed; migrations applied on target verify DB |
| No repair scope creep | Workiz changes limited to **read-only audit** unless a separate correction plan is approved |
| Runtime for UI tests | Backend + frontend running locally or in CI when using Playwright |

## 11.3 Workstreams (execute in order)

### Stream A — Environment & integration smokes (clears §9 #5, #6, #13 portal leg)

**Goal:** Payment and portal isolation smokes run **PASS**, not ephemeral-DB waiver.

1. **Local (no CREATE DATABASE):** set `FINANCE_SMOKE_USE_CONFIGURED_DATABASE=1` or run the finish orchestrator (sets it automatically).
2. **CI / privileged host:** grant `CREATE DATABASE` and run ephemeral smokes, **or** use configured DB on a disposable schema.
3. From `backend/`:

```bash
npm run crm:invoice-payment-recording:smoke
npm run portal:isolation:smoke
# full §11 automation:
npm run finance-program:finish
```

3. Fix any real FAIL (not access denied); do **not** weaken smoke assertions.

**Exit:** Both smokes green; re-run `npm run finance-part9:certify` — criteria 5–6 PASS; criterion 13 PASS without portal waiver note.

---

### Stream B — Workiz historical audit (clears §9 #11)

**Goal:** Classify imported Finance; no silent repair.

1. Set `FINANCE_AUDIT_ORG_ID` or `PHOENIX_ORG_ID` to canonical Phoenix org.
2. Run:

```bash
npm run finance-part6:workiz-audit
```

3. Owner reviews latest `backend/_runtime_harness/finance-part6-workiz-audit/classification-*.json`.
4. Triage anomalies per Part 6 classifications (`Do not repair` default); spawn **separate** correction plans only for approved `Safe repair candidate` rows.

**Exit:** Audit artifact copied into closeout folder on next certify; criterion 11 PASS or owner-documented WAIVED with anomaly list attached.

---

### Stream C — Owner creation & send path (clears §9 #1, #2, #7)

**Goal:** Prove Quick Create + send + freeze behavior.

**Option 1 — Automated (preferred when stack is up):**

```bash
# terminal 1: backend dev
# terminal 2: frontend dev
set FINANCE_CERTIFY_PLAYWRIGHT=1
npm run finance-part9:certify
```

**Option 2 — Manual script (same evidence class):**

1. Create Estimate → save draft → reload → edit.
2. Create Invoice → lines → save → send (email or SMS).
3. Confirm sequential `document_number`, frozen snapshot (`409` on line edit after send).
4. Download PDF; confirm matches sent snapshot.

**Exit:** Criteria 1–2 PASS (Playwright) or owner checklist signed in walkthrough; criterion 7 PASS after manual send test → set `FINANCE_CERTIFY_MANUAL_PASS=1` on final certify.

---

### Stream D — Cross-surface truth (clears §9 #12)

**Goal:** One invoice/customer sample matches everywhere (Part 6 Phase 12).

Use checklist: `backend/_runtime_harness/finance-program-closeout/latest/cross-surface-walkthrough.md`

Verify for the **same** org and sample rows:

- Invoices list — `lifecycle_status`, `balance_cents`, `document_number`, `finance_origin`
- Job → Invoice tab — conversion provenance when applicable
- Customer profile — open balance vs sum of open invoices
- Office dashboard — open invoice count
- Customer portal — lifecycle, PDF, `document_origin`
- Home AI — open/unpaid alignment with CRM

**Exit:** All boxes checked; owner initials on walkthrough file; include path in closeout folder copy; `FINANCE_CERTIFY_MANUAL_PASS=1` on final certify.

---

### Stream E — Native PDF sign-off (clears §9 #8)

**Goal:** Owner accepts native PDF for production use (Part 5 exit gate).

1. Send a native invoice; open `GET /api/invoices/:id/pdf` and portal PDF link.
2. Compare to Workiz historical PDF policy (portal prefers native then Workiz source).
3. If visual gaps remain (logo, multi-page): either **accept as v1** or schedule **Part 5.1** backlog — do not block close if owner waives with explicit “v1 acceptable.”

**Exit:** Criterion 8 PASS after owner sign-off on PDF sample stored in evidence pack (screenshot or PDF hash note in `CERTIFICATION.md`).

---

### Stream F — Phoenix production reverification (clears §9 #14 substantively)

**Goal:** Readonly counts reflect **real** Phoenix Finance rows, not empty dev DB by mistake.

1. Point `.env` / readonly script at intended DB and org (`phoenix-finance:closeout-readonly` uses org from env).
2. Run:

```bash
npm run phoenix-finance:closeout-readonly
```

3. Owner confirms `invoiceCount`, `originCounts`, `withDocumentNumber`, `withCustomerSnapshot` are plausible for production.

**Exit:** `phoenix-readonly.json` in closeout with non-surprising counts; owner note in `CERTIFICATION.md` if zero rows is expected (e.g. fresh org).

---

### Stream G — Final certification & program close (clears §9 #15)

1. Set env for full run:

```text
FINANCE_AUDIT_ORG_ID=<phoenix org uuid>   # if Stream B done
FINANCE_CERTIFY_PLAYWRIGHT=1              # if Stream C Option 1
FINANCE_CERTIFY_MANUAL_PASS=1             # after Streams C, D, E manual items
```

2. From `backend/`:

```bash
npm run finance-part9:certify
# or
npm run finance-part8:evidence-pack
```

3. Confirm `completion-matrix.json` → `programStatus`: **`COMPLETE`** (or **`COMPLETE WITH WAIVERS`** with owner acceptance of each waiver in `open-items-waivers.json`).
4. Sign `CERTIFICATION.md` (owner name, date).
5. Git: commit program code + master reference; tag or release note optional; **do not** commit secrets or `.env`.
6. CI (recommended): add job running `finance-part9:certify` on merge with privileged DB.

**Exit:** §10 updated to **PROGRAM CLOSED** with SHA, date, and link to evidence folder.

---

## 11.4 §9 criteria tracker (finish checklist)

| # | Criterion | Primary stream | Pass signal |
|---|-----------|----------------|-------------|
| 1 | Reliable Estimate create | C | Playwright or manual |
| 2 | Reliable Invoice create | C | Playwright or manual |
| 3 | Conversion no drift | — | Already PASS (part6 checks) |
| 4 | Backend owns math | — | Already PASS |
| 5 | Ledger explains state | A | Payment smoke PASS |
| 6 | Payment states deterministic | A | Smoke + unit checks |
| 7 | Snapshot immutable | C | Send + 409 manual |
| 8 | PDF professional | E | Owner sign-off |
| 9 | Durable native documents | — | Already PASS |
| 10 | Invoice numbering | — | Already PASS |
| 11 | Workiz honest | B | Audit artifact |
| 12 | Cross-surface consistent | D | Walkthrough complete |
| 13 | Tenant-safe | A | Smokes + tenant check |
| 14 | Phoenix reverified | F | Readonly plausible |
| 15 | Evidence recorded | G | Certify + sign |

## 11.5 Explicitly after program close (backlog — not finish blockers)

Track separately from §9; require new owner approval if scope expands:

- Money engine **discounts** (Part 3 deferred)
- **Void/cancelled** invoice owner workflow UI (Part 4 deferred)
- PDF **Part 5.1** — branding, multi-page, golden tests
- Wire **invoice-lifecycle** / **finance-api-errors** on all invoice surfaces
- Workiz **write repair** only via approved correction plans
- Part 1 **production truth** document refresh if prod drifted since baseline

## 11.6 Stop conditions during finish (§7)

Halt finish work and report per §7 if:

- production org or DB identity is uncertain for a data-bearing step
- certify exposes cross-org read or tenant regression
- a “fix” would rewrite Workiz historical truth without approval
- migration or repair would touch historical Finance rows without approved plan

## 11.7 Suggested owner calendar (minimal)

```text
Day 1 — Stream A (DB/CI smokes) + Stream B (Workiz audit review)
Day 2 — Streams C + D (manual or Playwright walkthrough)
Day 3 — Streams E + F + G (PDF sign-off, readonly, final certify, sign CERTIFICATION.md)
```

Adjust for CI availability; parallelize B with A where possible.

---

# 12. One-Line Program Principle

> Truth first. Creation second. Financial math third. Ledger and history fourth. Documents fifth. Integration sixth. Hardening and production closeout last.
