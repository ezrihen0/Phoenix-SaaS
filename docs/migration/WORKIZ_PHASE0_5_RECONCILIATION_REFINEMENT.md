# Workiz Phase 0.5 Reconciliation and Identity Refinement

Status: **PHASE 0.5 COMPLETE — OWNER CHECKPOINT REQUIRED**

Read-only refinement on top of Phase 0 evidence. No database, schema, production, portal, network, or source PDF mutation.

## Executive checkpoint

- Phase 0 financial PASS → refined PASS: **301 → 343** (+47 from discount rule correction)
- Phase 0 financial MANUAL_REVIEW → refined MANUAL_REVIEW: **112 → 70**
- Workiz discount presentation rule: **subtotal - discount + tax = total** (69/73 discount invoices match)
- Duplicate invoice-number groups reviewed: **3**
- Same-name identity groups for owner review: **5**
- Confirmed repeat-customer clusters (service history): **10**
- Calgary invoice records: **236**
- Estimated unique Calgary customers after dedupe: **228**

## Discount presentation (Workiz source rule)

When a Discount line is present on the Workiz PDF, tax is applied after discount: subtotal - discount + tax = total. Phase 0 incorrectly treated all invoices as subtotal + tax = total.

Evidence summary:
- Invoices with a parsed Discount line: 73
- Match `subtotal - discount + tax = total`: 69
- Match `subtotal + tax = total` only: 0
- Unmatched discount presentations: 4
- Unmatched discount files: MiguelDinoExcellencerenovationLTD.no55381.pdf, RishiKapoor.no55696.pdf, Sheanon.no55547.pdf, TheaSauve.no55401.pdf

Phase 0.5 recalculates PASS/MANUAL_REVIEW using this source-supported rule. Discount lines are not treated as automatic manual review by themselves.

## Refined financial review causes (exclusive primary cause)

- LINE_ITEM_PARSE: 5
- MISSING_BALANCE: 3
- MISSING_TAX: 24
- PAYMENT_PARSE_OR_ALLOCATION: 38

Full per-file refined results: `backend/_runtime_harness/workiz-migration/phase0.5-refinement.json`

## Duplicate invoice-number groups

- **0OINGD** → `DUPLICATE_EXPORT_VARIANT`: Same Workiz invoice number, customer, date, and money with different PDF bytes (likely duplicate export/download such as '(1).pdf'); one logical invoice, not a distinct second record.
- **1HG0BB** → `DUPLICATE_EXPORT_VARIANT`: Same Workiz invoice number, customer, date, and money with different PDF bytes (likely duplicate export/download such as '(1).pdf'); one logical invoice, not a distinct second record.
- **RZISD4** → `DUPLICATE_EXPORT_VARIANT`: Same Workiz invoice number, customer, date, and money with different PDF bytes (likely duplicate export/download such as '(1).pdf'); one logical invoice, not a distinct second record.

Import implication: the three `DUPLICATE_EXPORT_VARIANT` groups represent **one logical invoice each** (keep one PDF hash as immutable evidence).

## Same-name duplicate-customer candidates (owner review)

### same-name-group-1
- Recommendation: **KEEP_SEPARATE**
- Same first-name-only match (adam). Emails differ: yes. Phones differ: yes. Cities: Calgary | Willow. Do not merge on name alone.
  - Adam.no55516.pdf: Adam | osmanadam55@gmail.com | 4039261745 | Calgary
  - Adam.no55543.pdf: Adam | adamlewilliams@gmail.com | 4038745928 | Willow

### same-name-group-2
- Recommendation: **KEEP_SEPARATE**
- Same first-name-only match (andy). Emails differ: yes. Phones differ: yes. Cities: Edmonton. Do not merge on name alone.
  - Andy.no55560.pdf: Andy | no email | 8254409381 | Edmonton
  - Andy.no55564.pdf: Andy | achlebek52@gmail.com | 7802350978 | Edmonton

### same-name-group-3
- Recommendation: **KEEP_SEPARATE**
- Same first-name-only match (jason). Emails differ: yes. Phones differ: yes. Cities: Calgary | Spruce Grove. Do not merge on name alone.
  - Jason.no55664.pdf: Jason | jbeaupitcsa@hotmail.com | 4037710249 | Calgary
  - Jason.no55698.pdf: Jason | no email | 7807222825 | Spruce Grove

### same-name-group-4
- Recommendation: **KEEP_SEPARATE**
- Same first-name-only match (pat). Emails differ: yes. Phones differ: yes. Cities: Calgary. Do not merge on name alone.
  - Pat.no55496.pdf: Pat | patmeyer@telus.net | 4038754975 | Calgary
  - Pat.no55589.pdf: Pat | lonsdale.services@shaw.ca | 4038883228 | Calgary

### same-name-group-5
- Recommendation: **KEEP_SEPARATE**
- Same first-name-only match (steve). Emails differ: yes. Phones differ: yes. Cities: Calgary. Do not merge on name alone.
  - Steve.no55526.pdf: Steve | spotvin58@gmail.com | 4033834309 | Calgary
  - Steve.no55802.pdf: Steve | manwarrens@amail.com | 4039693022 | Calgary

## Confirmed repeat-customer clusters (not duplicates)

These 10 clusters share exact normalized email and/or phone (and usually strong name+address). They are **repeat service history**, not duplicate customers:

- **customer-0037**: 2 invoices (15CR4Q, 2SLU9O) — Ash Verma | matched by EXACT_NORMALIZED_EMAIL, EXACT_NORMALIZED_PHONE, STRONG_NAME_ADDRESS
- **customer-0088**: 2 invoices (GI9O33, TFL54I) — Corrine | matched by EXACT_NORMALIZED_EMAIL, EXACT_NORMALIZED_PHONE, STRONG_NAME_ADDRESS
- **customer-0199**: 2 invoices (R5TFIP, ZUMPKD) — Julian Salraz | matched by EXACT_NORMALIZED_EMAIL, EXACT_NORMALIZED_PHONE, STRONG_NAME_ADDRESS
- **customer-0207**: 2 invoices (70QLL2, I7RU4Z) — Katelyn | matched by EXACT_NORMALIZED_EMAIL, EXACT_NORMALIZED_PHONE, STRONG_NAME_ADDRESS
- **customer-0248**: 2 invoices (D613FB, L166SD) — Linette Ponto | matched by EXACT_NORMALIZED_EMAIL, EXACT_NORMALIZED_PHONE, STRONG_NAME_ADDRESS
- **customer-0260**: 2 invoices (504ADE, 62QJZP) — Manuel Quintillan | matched by EXACT_NORMALIZED_EMAIL, EXACT_NORMALIZED_PHONE, STRONG_NAME_ADDRESS
- **customer-0265**: 2 invoices (JB128S, N6BWLH) — Marg Mau | matched by EXACT_NORMALIZED_EMAIL, EXACT_NORMALIZED_PHONE, STRONG_NAME_ADDRESS
- **customer-0266**: 2 invoices (ON6JSY, TWKN8Z) — Mark Kravitz | matched by EXACT_NORMALIZED_EMAIL, EXACT_NORMALIZED_PHONE, STRONG_NAME_ADDRESS
- **customer-0293**: 2 invoices (ESWWY6, NP1EF3) — Nancy | matched by EXACT_NORMALIZED_EMAIL, EXACT_NORMALIZED_PHONE, STRONG_NAME_ADDRESS
- **customer-0373**: 2 invoices (P9B398, PTAG68) — Ted Berger | matched by EXACT_NORMALIZED_EMAIL, EXACT_NORMALIZED_PHONE, STRONG_NAME_ADDRESS

Additional identity conflict from Phase 0 still requiring review: cluster `customer-0296` (Natalie / Natalie Diego — same email+phone, different addresses).

## Calgary dedupe estimate

236 Calgary-tagged invoice records collapse to 228 customer clusters after conservative identity dedupe (exact email, exact phone, or strong name+address).

## Stop gate

Phase 0.5 stops here. Parser build, identity engine import, and dry-run phases remain blocked until the owner accepts this checkpoint.
