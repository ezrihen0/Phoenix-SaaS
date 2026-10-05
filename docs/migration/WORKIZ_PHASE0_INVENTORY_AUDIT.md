# Workiz Phase 0 Inventory Audit

Status: **PHASE 0 COMPLETE — OWNER CHECKPOINT REQUIRED**

This is a read-only inventory. No database, production environment, portal, network service, or source PDF was accessed for mutation. No import was performed.

## Executive checkpoint

- Source PDFs: 413
- Readable/text-extractable PDFs: 413
- Unreadable PDFs: 0
- PDFs requiring OCR/manual extraction: 0
- Duplicate files by SHA-256: 0
- Unique invoice numbers: 410
- Duplicate invoice-number groups: 3
- Estimated unique customers: 399
- Repeat-customer clusters: 10 (20 invoices)
- Duplicate/customer-identity candidate groups: 5
- Financial anomalies/manual reviews: 112
- Warranty distribution: 77 explicit parts, 74 explicit labor, 17 generic/unclear, 307 no written warranty
- Files with any manual-review flag: 135

## Source inventory

- Source directory: `C:\Users\edenz\OneDrive\שולחן העבודה\Business\Workiz\INVOICES PDF`
- Parser version: `workiz-phase0-inventory-v1`
- Date range: 2024-11-26 through 2026-04-29
- Unique file hashes: 413
- Missing invoice numbers: 0
- Unique normalized emails: 369
- Unique normalized phones: 376

## Customer identity inventory

- Estimated customer clusters: 399
- Confirmed repeat clusters from exact normalized email, exact normalized phone, or strong name+address: 10
- Candidate duplicate groups retained for manual review: 5
- No merge was made on name alone.

Location evidence:
- Calgary records: 236
- Other identified locations: 148
- Unknown location: 29

## Invoice and payment inventory

- Invoices with one or more parsed payment events: 372
- Invoices with an outstanding balance: 2
- Financial PASS: 301
- Financial MANUAL_REVIEW: 112

Financial manual-review reasons:
- discount_requires_manual_review: 73
- subtotal_plus_tax_does_not_equal_total: 69
- payments_do_not_equal_amount_paid: 41
- total_minus_payments_does_not_equal_balance: 41
- missing_tax: 24
- missing_balance: 14
- payments_exceed_total: 5

The audit did not repair or infer money. Discounts are retained as evidence and routed to manual review because the locked Phase 0 formula is subtotal + tax = total.

## Warranty evidence

- Explicit parts warranty: 77
- Explicit labor warranty: 74
- Generic or scope-unclear written warranty: 17
- No written warranty: 307

Default warranty policy has not been applied in Phase 0. This section reports source evidence only.
Parts and labor counts can overlap on the same invoice; generic/unclear means written warranty wording without a safely classified scope.

## Service evidence

- Invoices with parts signals: 195
- Invoices with labor signals: 168
- Invoices with cleaning signals: 160
- Invoices with inspection signals: 171
- Invoices with repair signals: 38

Probable category counts (categories can overlap):
- CLEANING: 160
- INSPECTION: 171
- INSTALLATION: 168
- LABOR: 168
- MAINTENANCE: 228
- PARTS: 195
- REPAIR: 38
- UNKNOWN: 8

## Duplicate evidence

- Duplicate file-hash groups: 0
- Duplicate invoice-number groups: 3
- Possible duplicate/customer-identity groups: 5

Full group membership and matching evidence are in `backend/_runtime_harness/workiz-migration/phase0-inventory.json`.

## Manual review

Review flag counts:
- FINANCIAL:discount_requires_manual_review: 73
- FINANCIAL:subtotal_plus_tax_does_not_equal_total: 69
- POSSIBLE_DUPLICATE_CUSTOMER: 10
- FINANCIAL:payments_do_not_equal_amount_paid: 41
- FINANCIAL:total_minus_payments_does_not_equal_balance: 41
- PARSE_WARNING:line_items_subtotal_mismatch: 6
- FINANCIAL:missing_tax: 24
- NO_VALID_EMAIL_OR_PHONE: 4
- PARSE_WARNING:payment_reconciliation_mismatch: 14
- FINANCIAL:missing_balance: 14
- FINANCIAL:payments_exceed_total: 5
- PARSE_WARNING:synthetic_line_item_from_subtotal: 4
- DUPLICATE_INVOICE_NUMBER: 6
- CUSTOMER_CLUSTER_CONFLICT: 2

Representative candidates:
- Adam.no55516.pdf (31HPA9): FINANCIAL:discount_requires_manual_review, FINANCIAL:subtotal_plus_tax_does_not_equal_total, POSSIBLE_DUPLICATE_CUSTOMER
- Adam.no55543.pdf (Z64X19): POSSIBLE_DUPLICATE_CUSTOMER
- Adlea.no55784.pdf (KED5NJ): FINANCIAL:discount_requires_manual_review, FINANCIAL:subtotal_plus_tax_does_not_equal_total
- AlyssaAlger.no55440.pdf (SBXWOU): FINANCIAL:discount_requires_manual_review, FINANCIAL:payments_do_not_equal_amount_paid, FINANCIAL:subtotal_plus_tax_does_not_equal_total, FINANCIAL:total_minus_payments_does_not_equal_balance
- Anand.no55461.pdf (DYGIYY): FINANCIAL:discount_requires_manual_review, FINANCIAL:payments_do_not_equal_amount_paid, FINANCIAL:subtotal_plus_tax_does_not_equal_total, FINANCIAL:total_minus_payments_does_not_equal_balance
- Andrew.no55488.pdf (H5L659): PARSE_WARNING:line_items_subtotal_mismatch:130000_vs_290000
- Andy.no55560.pdf (B0LN2R): POSSIBLE_DUPLICATE_CUSTOMER
- Andy.no55564.pdf (51YL2I): POSSIBLE_DUPLICATE_CUSTOMER
- AnitaGherghescu.no55459.pdf (7W9NOX): FINANCIAL:discount_requires_manual_review, FINANCIAL:subtotal_plus_tax_does_not_equal_total
- AprilAbrazado.no55409.pdf (ZEX77O): FINANCIAL:payments_do_not_equal_amount_paid, FINANCIAL:total_minus_payments_does_not_equal_balance
- AshiaLennon.no55468.pdf (SUKFFT): FINANCIAL:discount_requires_manual_review, FINANCIAL:subtotal_plus_tax_does_not_equal_total
- AshVerma.no55449.pdf (2SLU9O): FINANCIAL:discount_requires_manual_review, FINANCIAL:subtotal_plus_tax_does_not_equal_total
- BarbMarani.no55744.pdf (W6MQAZ): FINANCIAL:discount_requires_manual_review, FINANCIAL:subtotal_plus_tax_does_not_equal_total
- BenKarmel.no55472.pdf (FN9LIK): FINANCIAL:missing_tax
- Bob.no55794.pdf (JJHLJD): FINANCIAL:missing_tax
- BobMcclymont.no55759.pdf (74BY7X): FINANCIAL:discount_requires_manual_review, FINANCIAL:subtotal_plus_tax_does_not_equal_total
- BrendaWilson.no55778.pdf (4QQSP5): FINANCIAL:discount_requires_manual_review, FINANCIAL:subtotal_plus_tax_does_not_equal_total
- BrettLord.no55490.pdf (EP3XN1): FINANCIAL:discount_requires_manual_review, FINANCIAL:subtotal_plus_tax_does_not_equal_total
- Brittney.no55534.pdf (G756XB): FINANCIAL:payments_do_not_equal_amount_paid, FINANCIAL:total_minus_payments_does_not_equal_balance
- Cale.no55593.pdf (Z9R7AH): FINANCIAL:missing_tax
- Carlos.no55605.pdf (GM2OD2): FINANCIAL:discount_requires_manual_review, FINANCIAL:subtotal_plus_tax_does_not_equal_total
- Carly.no55487.pdf (LQBR7K): FINANCIAL:discount_requires_manual_review, FINANCIAL:subtotal_plus_tax_does_not_equal_total
- Carolyn.no55572.pdf (JG2JO8): NO_VALID_EMAIL_OR_PHONE
- Charlotte.no55552.pdf (QMH7K1): NO_VALID_EMAIL_OR_PHONE
- ColeBoettger.no55721.pdf (8TGGHY): FINANCIAL:discount_requires_manual_review, FINANCIAL:payments_do_not_equal_amount_paid, FINANCIAL:subtotal_plus_tax_does_not_equal_total, FINANCIAL:total_minus_payments_does_not_equal_balance, PARSE_WARNING:payment_reconciliation_mismatch:paid_65503_total_90003_due_0
- …and 110 more in phase0-inventory.json

## Proposed technical implementation boundary after owner approval

1. Build a versioned deterministic parser that emits source, customer, job, invoice, raw and structured invoice lines, individual payments, warranty evidence, service intelligence, confidence, and review flags.
2. Keep parser output outside production and build customer clusters with the locked identity priority. Existing-Phoenix matching requires a separately approved, tenant-scoped read phase.
3. Gate every invoice through strict money reconciliation. Only PASS records may enter an automated dry run; ambiguity remains MANUAL_REVIEW.
4. Add service intelligence and warranty reconstruction only after identity and money are stable. Preserve raw evidence and documented/default provenance.
5. Import first into an isolated database, verify counts and source hashes, manually trace the required sample, and run the same import twice with zero duplicates.
6. Production remains out of scope until every pre-production gate is accepted, backup/rollback and Phoenix organization context are confirmed, and the owner explicitly authorizes the production-import phase.

## Stop gate

Phase 0 stops here. No parser/import/schema/database phase is authorized by this audit.
