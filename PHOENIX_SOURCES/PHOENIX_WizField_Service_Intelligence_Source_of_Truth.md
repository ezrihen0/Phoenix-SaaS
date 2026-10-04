# WizField Service Intelligence — Source of Truth

**Document status:** Canonical authority for Classification V1 taxonomy and persistence  
**Taxonomy version:** `V1`  
**Persistence:** `invoice_service_intelligence`, `invoice_service_intelligence_component`, `invoice_service_intelligence_warranty`  
**First classified corpus:** Phoenix Fireplace historical Workiz invoices (`organization_id` `5edc3ccd-efbd-4f74-9f99-d2b8c05ad644`)

## Planned vs current (locked distinction)

**PLANNED CANONICAL ARCHITECTURE** (intended future model — do not treat as a fully shipped product):

```text
System → Primary Service → Service Detail → Component → Work Action → Labor → Warranty → Findings
```

**CURRENT PRODUCTION IMPLEMENTATION:**

- Classification V1 tables, classifier, and persist/rebuild path exist.
- Home AI may **read** persisted classifications via `search_service_history` (read-only).
- Service Intelligence **expansion is deferred** (September 2026 production closeout).
- This is a derived historical-classification layer, not a live operational workflow product.

Do not describe future Service Intelligence expansion, inventory linking, warranty-certificate issuance, or Growth reactivation as shipped.

Product architecture summary: [WizField_Master_Source_of_Truth.md](WizField_Master_Source_of_Truth.md). Verification evidence: [WIZFIELD_PRODUCTION_CLOSEOUT.md](audit/production-2026-09/WIZFIELD_PRODUCTION_CLOSEOUT.md).

This document does **not** replace invoice financial truth, PDF evidence, Customer Master, Inventory catalog identity, Warranty Certificate issuance, or Growth reactivation scoring.

---

## 1. What Service Intelligence owns

Service Intelligence is a **derived, versioned, rebuildable** layer over historical operational evidence.

It owns **business meaning**:

- what system was serviced (GAS / WOOD / CHIMNEY / OTHER / UNKNOWN)
- what kind of job it was (REPAIR / INSPECTION / CLEANING / MAINTENANCE / TRUE_INSTALLATION / OTHER / UNKNOWN)
- approved service details (WETT, chimney sweep, part replacement, …)
- functional components (`PILOT_ASSEMBLY`, `GAS_VALVE`, …)
- work action on those components
- whether labor was charged, with raw wording preserved
- per-component and invoice-scoped warranty interpretation
- findings and review flags
- classification confidence (`HIGH` / `MEDIUM` / `LOW`)

It does **not** own:

- original PDF bytes or `invoice_documents`
- invoice line-item wording as source text (those remain on invoices / line items / PDF extractions)
- invoice totals, taxes, payments, or balances
- Customer Master identity or history snapshots
- physical/catalog inventory items
- officially issued WizField Warranty Certificates
- Growth reactivation eligibility, scoring, campaigns, or outreach

**Historical evidence is immutable. Derived classification is versioned and rebuildable.**

---

## 2. Ownership boundaries

| Concern | Owner | Rule |
|---|---|---|
| Business meaning of the job | **Service Intelligence** | Canonical component, system, service, labor, warranty interpretation |
| Physical / catalog identity | **Inventory** | Manufacturer, model, SKU, supplier, cost, stock. Optional future `inventory_item_id` on a component. Never invent stock from historical invoices. |
| Official coverage document | **Warranty Engine / Warranty Certificates** | Consumes Service Intelligence. Does not re-parse historical PDFs. Does not auto-issue certificates from historical classification. |
| Reactivation / outreach | **Growth** | Consumes Service Intelligence as factual input. Owns eligibility and scoring. No outreach in this phase. |
| Money | **Invoices / payments** | Untouched by classification writes |
| Source PDF | **invoice_documents** | Untouched by classification writes |

### Inventory contract

`canonical_component` is business meaning.

```text
PILOT_ASSEMBLY
  raw_name: "Pilot 2103-010 1 year warranty"
  model_or_part_number: "2103-010"
  inventory_item_id: null   ← future optional link
```

A later inventory item may be:

```text
SIT / 2103-010 / supplier SKU XYZ
```

Do **not** create a Service Intelligence category per SKU or model. Do **not** create Inventory records from historical invoices.

### Warranty Engine contract

Warranty Engine must consume structured Service Intelligence.

It must **not** independently reinterpret historical PDFs.

Two different concepts:

1. **Historical warranty evidence** — what the Workiz invoice/PDF said, interpreted onto a component or labor row
2. **Officially issued WizField Warranty Certificate** — a generated, snapshot-backed legal/operational document

Classification V1 persistence does **not** issue certificates.

### Growth contract

Service Intelligence later provides factual inputs:

- system
- last service date (from the invoice, not invented here)
- work performed / primary service
- components and work actions
- cleaning / inspection history
- warranty status

Growth owns reactivation eligibility and scoring. This phase does not create campaigns or contact customers.

---

## 3. Persistence model

All tables are tenant-scoped. Every query must include `organization_id`. Unique rebuild key:

```text
(organization_id, invoice_id, taxonomy_version)
```

### `invoice_service_intelligence`

One derived row per invoice per taxonomy version.

- `system_json`, `system_bucket`
- `primary_service_json`, `service_detail_json`
- `labor_charged`, `labor_raw_wording_json`
- `classification_confidence`
- `review_reasons_json`
- `findings_json`
- `classified_at`, `source_kind`

Labor warranty is **not** stored as an invoice-level duration on this row. Labor charged + raw wording live here. Labor warranty lives on the warranty table with `scope = LABOR`.

### `invoice_service_intelligence_component`

One row per normalized functional component on that invoice.

- `canonical_component`
- `raw_name`
- `manufacturer_name` (nullable; unused in V1 persist)
- `model_or_part_number` (technical metadata, not a taxonomy category)
- `work_action`
- `confidence`
- base warranty fields
- extended warranty fields (`relationship` may be `AMBIGUOUS`; effective expiry is null when unsafe)
- `evidence_json`
- `inventory_item_id` nullable, reserved, **must stay null** unless a real inventory item is later linked

### `invoice_service_intelligence_warranty`

Invoice-scoped warranties that must not be silently copied onto every part:

| `scope` | Meaning |
|---|---|
| `LABOR` | Independent labor warranty. Always written (including `NOT_DOCUMENTED`). |
| `UNSCOPED_PARTS` | Parts term exists but cannot be bound to one component |
| `EXTENDED` | Extended term that could not be safely attached to one component |
| `OTHER` | Reserved |

Component-attached base and extended warranties stay on the component row so the Warranty Engine does not double-count.

---

## 4. Taxonomy V1

### System (multi-label)

`GAS` · `WOOD` · `CHIMNEY` · `OTHER` · `UNKNOWN`

`MIXED` is a derived bucket when 2+ of GAS / WOOD / CHIMNEY apply.

### Primary service (multi-label)

`REPAIR` · `INSPECTION` · `CLEANING` · `MAINTENANCE` · `TRUE_INSTALLATION` · `OTHER` · `UNKNOWN`

Hard rules:

- `"Labor"`, `"Labor and installation"`, `"Labor & installation"`, `"Installation labor"` are **labor charged**, never `TRUE_INSTALLATION`.
- `TRUE_INSTALLATION` requires evidence that a new appliance/system was actually installed as the job.

### Service detail (approved, evidence-backed)

Includes: `PART_REPLACEMENT`, `WETT`, `CHIMNEY_SWEEP`, `GAS_CLEAN`, `FIREBOX_MASONRY`, `CAMERA_INSPECTION`, `CHIMNEY_REPAIR`, `SAFETY_INSPECTION`, `INSPECTION_GENERAL`, `MAINTENANCE`, `DIAGNOSTIC`, `BBQ_GAS_FITTING`.

Do not explode rare wording into new categories.

### Canonical components

Business meaning, not SKU:

`PILOT_ASSEMBLY` · `GAS_VALVE` · `CONTROL_MODULE` · `SWITCH` · `REMOTE` · `RECEIVER` · `BLOWER_FAN` · `THERMOCOUPLE` · `THERMOPILE` · `CHIMNEY_CAP` · `CHASE_COVER` · `GASKET` · `MESH` · `IGNITER` · `DAMPER_CAP` · `LINER_KIT` · `FLASHING` · `CROWN` · `MORTAR`

Pilot / OEM Pilot / Pilot 2103 / Pilot 2103-010 / STI Pilot / Energy U23 Pilot → `PILOT_ASSEMBLY`.

### Work action

`REPLACED` · `INSTALLED` · `REPAIRED` · `SERVICED` · `CLEANED` · `UNKNOWN`

Do not infer `REPLACED` from a component name alone. Priced supply plus labor/warranty context may be `REPLACED` at `MEDIUM`.

### Labor

Independent of parts.

Valid labor warranty states:

`DOCUMENTED_ACTIVE` · `DOCUMENTED_EXPIRED` · `EXPLICIT_NO_WARRANTY` · `NOT_DOCUMENTED` · `UNPARSEABLE`

Never infer labor warranty from `"Labor and installation 6 months"` without warranty semantics.

### Warranty rules

- Warranty belongs to the part that states it.
- Different components on the same invoice may have different durations.
- Extended warranty is preserved separately from the base term.
- If replace-vs-add is unclear: do not guess; flag `EXTENDED_WARRANTY_AMBIGUOUS`; do not invent effective expiry.
- Unscoped “2 years parts” across multiple components stays `UNSCOPED_PARTS` and is flagged `AMBIGUOUS_WARRANTY_SCOPE`.

### Confidence

`HIGH` — explicit invoice/PDF evidence  
`MEDIUM` — strong combination of signals  
`LOW` — ambiguous/incomplete; do not force a confident class

`UNKNOWN` and review flags are valid production states. HIGH/MEDIUM records are persisted even when other invoices need review.

### Review reasons

`UNKNOWN_SYSTEM` · `UNKNOWN_PRIMARY_SERVICE` · `AMBIGUOUS_COMPONENT` · `AMBIGUOUS_WORK_ACTION` · `AMBIGUOUS_WARRANTY_SCOPE` · `UNPARSEABLE_WARRANTY` · `EXTENDED_WARRANTY_AMBIGUOUS` · `THIN_RECORD` · `ADMIN_ONLY`

---

## 5. Rebuild / idempotency

Classification V1 is rebuildable:

1. Re-run the classifier against immutable evidence.
2. Upsert the parent by `(organization_id, invoice_id, taxonomy_version)`.
3. Delete and rewrite that parent’s component and warranty children, still scoped by `organization_id`.
4. Parent ids stay stable. Child ids may change. Counts and payload must match.

A future taxonomy `V2` is a new `taxonomy_version`, not an overwrite of V1.

Do not store this layer in `invoices.branding_snapshot_json`.

---

## 6. Tenant isolation

- `organization_id` is `NOT NULL` on all three tables.
- Writes verify invoice `organization_id` before insert.
- Reads, updates, deletes, and counts must be organization-scoped.
- Cross-tenant writes = 0.

---

## 7. Explicitly out of scope for this phase

- Campaigns, SMS, email, or customer contact
- Lead or job creation
- Reactivation eligibility / September call prioritization
- Warranty certificate issuance
- Inventory stock or catalog creation from historical invoices
- Financial or Customer Master mutation
- PDF / `invoice_documents` mutation

---

## 8. Implementation pointers

- Classifier: `backend/src/database/workiz-service-intelligence-classify-v1.ts`
- Persist / rebuild: `backend/src/database/workiz-service-intelligence-persist-v1.ts`
- Migration: `backend/src/database/migrations/active/1783000000000-invoice-service-intelligence.ts`
- Harness reports: `backend/_runtime_harness/service-intelligence/`

Companion product docs:

- [WizField Master Source of Truth](./WizField_Master_Source_of_Truth.md)
- [WizField Growth Center Source of Truth](./WizField_Growth_Center_Source_of_Truth.md)
