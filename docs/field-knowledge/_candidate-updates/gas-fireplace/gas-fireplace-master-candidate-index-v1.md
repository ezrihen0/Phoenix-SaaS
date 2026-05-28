# Gas-Fireplace Master Candidate Index — GF + GA + GFO v1

## Status

**Candidate master index only. Not approved knowledge. Not runtime AI knowledge.**

This file is the **top-level navigation and lock document** for the complete gas-fireplace **candidate** collection (Layers 1–3). It does **not** add trade facts, permit conclusions, gas repair procedures, pricing, or runtime behavior. It does **not** authorize runtime activation and does **not** modify manifest or loader configuration.

**Runtime surface:** `not_runtime_safe`

Distinct from approved packs in `docs/field-knowledge/gas-fireplace/`, `docs/field-knowledge/trades/gas-fireplace/`, and `docs/field-knowledge/jurisdictions/canada/alberta/`.

---

## Scope

| Dimension | Value |
|-----------|--------|
| Trade | gas-fireplace |
| Segment | residential |
| Region layers | North America general foundation (GF); Alberta install / AHJ / permit-readiness (GA); operations / documentation (GFO) |
| Wood-burning fireplaces | **Out of scope** — chimney candidate track |
| Electric fireplaces | **Out of scope** |
| Generic `_candidate-updates/fireplace/` | **Do not use** |
| Runtime location guard | **Deferred** — engineering work required before GA/AHJ runtime |
| Employee license gate | **Out of scope** |

---

## Full Candidate Inventory

### Layer 1 — GF Foundation (North America general)

| ID | File | Purpose |
|----|------|---------|
| GF1 | `candidate-gas-fireplace-residential-diagnostics-basics-v1.md` | Diagnostics basics, symptom buckets, global safety screen |
| GF2 | `candidate-gas-fireplace-safety-boundary-v1.md` | Gas safety boundary, stop-use, no gas DIY |
| GF3 | `candidate-gas-fireplace-visual-condition-intake-v1.md` | Visual / photo intake |
| GF4 | `candidate-gas-fireplace-dispatch-booking-classification-v1.md` | Dispatch / booking classification |
| GF5 | `candidate-gas-fireplace-service-packages-sku-estimate-support-v1.md` | Service packages / SKU / estimate support |
| Index | [`gas-fireplace-residential-candidate-set-index-v1.md`](gas-fireplace-residential-candidate-set-index-v1.md) | GF layer navigation |

### Layer 2 — GA Alberta Install Intelligence

| ID | File | Purpose |
|----|------|---------|
| GA1 | `candidate-gas-fireplace-alberta-provincial-code-permit-baseline-v1.md` | Alberta provincial permit-readiness baseline |
| GA2 | `candidate-gas-fireplace-calgary-install-permit-readiness-v1.md` | Calgary install / permit readiness |
| GA3 | `candidate-gas-fireplace-edmonton-install-permit-readiness-v1.md` | Edmonton install / permit readiness |
| GA4 | `candidate-gas-fireplace-alberta-cold-weather-venting-field-reality-v1.md` | Alberta cold-weather field modifier (no permit/code) |
| GA5 | `candidate-gas-fireplace-new-install-intake-quote-readiness-v1.md` | New install / quote-readiness workflow hub |
| Index | [`gas-fireplace-alberta-install-intelligence-candidate-set-index-v1.md`](gas-fireplace-alberta-install-intelligence-candidate-set-index-v1.md) | GA layer navigation |

### Layer 3 — GFO Operations / Documentation

| ID | File | Purpose |
|----|------|---------|
| GFO1 | `candidate-gas-fireplace-manufacturer-model-manual-boundary-v1.md` | Manufacturer / model / manual boundary |
| GFO2 | `candidate-gas-fireplace-report-wording-inspection-support-v1.md` | Report wording / inspection support |
| GFO3 | `candidate-gas-fireplace-maintenance-service-sop-boundary-v1.md` | Maintenance / annual service boundary |
| GFO4 | `candidate-gas-fireplace-customer-portal-safe-faq-v1.md` | Customer portal safe FAQ |
| GFO5 | [`candidate-gas-fireplace-approved-conversion-plan-v1.md`](candidate-gas-fireplace-approved-conversion-plan-v1.md) | Approved-pack conversion planning (planning document only) |

**Total:** 15 candidate packs + 2 layer indexes + this master index + GFO5 planning reference (GFO layer has no separate index file).

All packs: **Runtime surface:** `not_runtime_safe` | **Status:** Candidate only

---

## Functional System Map

1. **GF1 / GF2 / GF4** — Safety + diagnostics + dispatch foundation
2. **GF3** — Visual / photo intake
3. **GF5** — Service / SKU / estimate category logic
4. **GA1** — Alberta provincial permit-readiness baseline
5. **GA2 / GA3** — Calgary / Edmonton city permit-readiness **only when job/property location matches**
6. **GA4** — Alberta cold-weather field modifier only — **no permit / code / legal claims**
7. **GA5** — New-install quote-readiness workflow hub (routes by property city)
8. **GFO1** — Manufacturer / model / manual boundary
9. **GFO2** — Report wording / inspection support
10. **GFO3** — Maintenance / annual service category boundary
11. **GFO4** — Customer portal safe FAQ candidate
12. **GFO5** — Approved-pack conversion planning candidate

**Cross-reference rules:**

- **GF2** safety override on gas odor, CO alarm, or acute safety complaints — always wins
- **GA5** for new-install intake; routes Calgary → GA2, Edmonton → GA3, other Alberta → GA1
- **GA4** cross-ref GF1–GF3 only for seasonal intake — do **not** cite GA1–GA3 for permit law from GA4
- **GFO5** for detailed promotion matrix and blockers — read-only planning reference

---

## Non-Negotiable Safety Boundaries

This candidate system does **not** authorize:

- Gas repair procedures
- Pilot relight instructions
- Gas valve operation steps
- Burner / log / orifice / regulator / pressure adjustment
- Combustion tuning
- Ignition module reset
- Vent disassembly
- Bypassing safeties
- CO safe-level claims
- Remote diagnosis from phone or photo
- Clearance numbers without verified manual / source
- Manufacturer / model-specific claims without source
- Permit-approved, code-compliant, pass-inspection, or insurance-approved guarantees
- Fixed pricing without company pricebook
- Warranty, stock, or same-day promises
- Employee license gate workflows
- Calgary, Edmonton, Alberta, or any AHJ guidance **without matching job/property location**

---

## Runtime / Promotion Blockers

| Blocker | Applies to |
|---------|--------------|
| All files **candidate only** — none runtime-safe | Entire collection |
| Manifest / loader **unchanged** | Entire collection |
| Approved pack conversion must be **separate** from candidate files | Promotion path |
| **Runtime location guard / job-property location resolver** required before GA/AHJ runtime | GA1–GA5 |
| **Source verification** required | Permit, code, AHJ, manufacturer, manual, clearance, insurance, warranty claims |
| **Expert review** required | Gas safety, AHJ, manufacturer/manual, report wording, maintenance SOP, customer portal |
| **Company maintenance SOP** required before maintenance/service runtime | GFO3 |
| **Pricebook** required before pricing / SKU runtime | GF5 |
| **Customer portal surface QA** required before FAQ runtime | GFO4 |
| **Manual / source policy** required before manufacturer boundary runtime | GFO1 |

Detailed promotion matrix: [`candidate-gas-fireplace-approved-conversion-plan-v1.md`](candidate-gas-fireplace-approved-conversion-plan-v1.md) (GFO5 — planning only).

Promotion requires: test pass, manifest entry, loader allowlist update, and surface/role gates — **not** implied by this index.

---

## Location Rule

**Job/property location is jurisdiction authority.**  
**Organization location is fallback context only.**

- Never apply Calgary, Edmonton, Alberta, Toronto, Miami, or any AHJ guidance unless **job/property location** matches the verified jurisdiction.
- Unknown location → ask for job/property **city + province/state/country**, or state that no verified jurisdiction guidance is available.
- Org HQ must **not** override job/property location for permit or AHJ routing.

**Test coverage (GA5):** Toronto out-of-scope; Miami/USA out-of-scope; org Alberta / job Toronto; org Miami / job Calgary — see `candidate-gas-fireplace-new-install-intake-quote-readiness-v1.md`.

**Runtime location guard:** deferred engineering — required before any GA/AHJ pack goes runtime.

---

## Recommended Future Conversion Order

**Future — not automatic.** Each step requires separate approved pack creation per GFO5.

| Order | Candidate | Blocker / note |
|-------|-----------|----------------|
| 1 | GF2 safety boundary | Expert review + refusal tests |
| 2 | GF1 diagnostics | Pairs with GF2 |
| 3 | GF4 dispatch | Dispatch SOP |
| 4 | GF3 visual intake | Photo / disassembly refusal tests |
| 5 | GF5 service / SKU | Pricebook |
| 6 | GFO2 report wording | QA policy |
| 7 | GFO3 maintenance boundary | Company SOP |
| 8 | GFO4 customer FAQ | Customer portal QA |
| 9 | GFO1 manufacturer / manual | Source / manual policy |
| 10 | GA4 climate modifier | Climate QA only — no AHJ |
| 11 | GA5 new install workflow | Location guard |
| 12 | GA1–GA3 AHJ packs | Location guard + source re-verification |

---

## Final Lock Statement

**Gas Fireplace candidate collection v1 is complete** after this master index and prior full-system QA.

- **No further gas-fireplace candidate expansion** should be started unless the owner explicitly opens a new scope.
- All layers (GF, GA, GFO) remain **candidate only, not approved, not runtime**.

**Next separate tracks (not part of this collection):**

1. Runtime location guard engineering
2. Approved-pack conversion (per GFO5)
3. New trade candidate collection (other trades)

---

## Cross-Links

| Document | Role |
|----------|------|
| [`gas-fireplace-residential-candidate-set-index-v1.md`](gas-fireplace-residential-candidate-set-index-v1.md) | GF1–GF5 layer index |
| [`gas-fireplace-alberta-install-intelligence-candidate-set-index-v1.md`](gas-fireplace-alberta-install-intelligence-candidate-set-index-v1.md) | GA1–GA5 layer index |
| [`candidate-gas-fireplace-approved-conversion-plan-v1.md`](candidate-gas-fireplace-approved-conversion-plan-v1.md) | GFO promotion planning (GFO5) |

**Approved read-only assets (unchanged by candidate work):**

- `docs/field-knowledge/gas-fireplace/`
- `docs/field-knowledge/trades/gas-fireplace/canada/alberta/`
- `docs/field-knowledge/jurisdictions/canada/alberta/`

---

## Final Principle

This master index is a **navigation and lock document** for WizField’s professional B2B Field OS gas-fireplace candidate knowledge. Candidate knowledge is not product knowledge. Approved knowledge is not runtime knowledge until manifest-registered, loader-approved, tested, and surface-gated.

**Reminder:** Candidate only. Not approved. Not runtime.
