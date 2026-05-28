# Gas-Fireplace Alberta Install Intelligence Candidate Set Index — GA1–GA5

## Status

**Candidate set index only. Not approved knowledge. Not runtime AI knowledge.**

This file summarizes and organizes the **Alberta Install Intelligence / AHJ / Permit-Readiness** candidate set (GA1–GA5). It does not add trade facts, permit conclusions, gas repair procedures, or runtime behavior. It is a review and navigation document for owners, reviewers, and agents.

**Follow-on to:** Gas-Fireplace Candidate Foundation GF1–GF5 ([`gas-fireplace-residential-candidate-set-index-v1.md`](gas-fireplace-residential-candidate-set-index-v1.md)). Not approved for runtime. Distinct from approved packs in `docs/field-knowledge/gas-fireplace/`, `jurisdictions/`, and `trades/`.

## Scope

| Dimension | Value |
|-----------|--------|
| Trade | gas-fireplace |
| Segment | residential (install / alter / permit-readiness focus) |
| Region | Canada — Alberta |
| Cities | Calgary (GA2), Edmonton (GA3); other Alberta municipalities via GA1 + AHJ verification |
| Wood-burning fireplaces | **Out of scope** — chimney candidate track |
| Generic `_candidate-updates/fireplace/` | **Do not use** |
| Employee license gate | **Out of scope** — permit-readiness workflow only |

---

## Candidate Set Summary Table

| GA# | Candidate file | Topic | Primary purpose | Risk level | Runtime readiness |
|-----|----------------|-------|-----------------|------------|-------------------|
| GA1 | `candidate-gas-fireplace-alberta-provincial-code-permit-baseline-v1.md` | Alberta provincial baseline | Safety Codes Act / permit-readiness concepts; scope distinctions; no legal conclusions | High (Critical if read as compliance) | Candidate only |
| GA2 | `candidate-gas-fireplace-calgary-install-permit-readiness-v1.md` | Calgary install / permit readiness | City permit-readiness workflow; quote-readiness intake | High (Critical for permit guarantees) | Candidate only |
| GA3 | `candidate-gas-fireplace-edmonton-install-permit-readiness-v1.md` | Edmonton install / permit readiness | City permit-readiness workflow; residential intake | High (Critical for permit guarantees) | Candidate only |
| GA4 | `candidate-gas-fireplace-alberta-cold-weather-venting-field-reality-v1.md` | Alberta cold-weather / venting field reality | Climate/field modifier only — no permit/code/legal content | High when combined with gas/CO | Candidate only |
| GA5 | `candidate-gas-fireplace-new-install-intake-quote-readiness-v1.md` | New install / quote readiness | Business workflow hub; city routing; site assessment before final quote | High (Critical for installation-ready quotes) | Candidate only |

All packs: **Runtime surface:** `not_runtime_safe`

---

## GA1–GA5 Functional Map

1. **Provincial baseline** — GA1 (`candidate-gas-fireplace-alberta-provincial-code-permit-baseline-v1.md`)
2. **City-specific permit readiness** — GA2 Calgary, GA3 Edmonton
3. **Climate field modifier** — GA4 (field reality only; **no permit law**)
4. **New install workflow hub** — GA5 (routes by property city: Calgary → GA2, Edmonton → GA3, other Alberta → GA1)

**Cross-reference rules:**

- GA5 for new-install intake and quote-readiness workflow
- GA2 / GA3 only when **job/property location matches** Calgary or Edmonton
- GA1 for provincial permit-readiness concepts and unknown Alberta municipalities
- GA4 for seasonal/weather intake — cross-ref GF1–GF3 only; **do not** cite GA1–GA3 for permit law from GA4
- GF2 safety override on any call with gas odor or CO alarm

---

## Runtime Status

| Field | Value |
|-------|--------|
| Status | Candidate only |
| Approved knowledge | No |
| Runtime AI knowledge | No |
| Runtime surface (all GA packs) | `not_runtime_safe` |
| Manifest / loader | **Not registered** — no backend or frontend changes from this index |

Approved jurisdiction packs (`canada-alberta-gas-v1.md`, Calgary/Edmonton permit packs) remain separate approved assets until intentional candidate promotion.

---

## Explicit Non-Coverage (GA1–GA5)

The candidate set does **not** authorize or include:

- Employee license gate or staff credential verification workflows
- Installation instructions (gas piping, vent runs, appliance mounting)
- Gas repair steps
- Pilot relight, gas valve operation, burner/log/orifice work, regulator or pressure adjustment, combustion tuning
- Ignition module reset or bypassing safeties
- Vent disassembly or interior panel removal for customers
- Remote CO diagnosis or “safe CO level” claims
- Code-compliant, pass-inspection, permit-approved, or insurance-approved guarantees
- **Calgary or Edmonton AHJ guidance when job/property location does not match** (e.g. Toronto, Ontario — see GA5 smoke test)
- Wood-burning or electric fireplace content (chimney track)

---

## Promotion Warning

Before any GA pack may be considered for approved/runtime use:

1. **Source verification required** — Re-verify all permit/code claims against official sources (approved packs are drafting input only).
2. **Expert review required** — Legal/compliance and gas-trade reviewers for AHJ content.
3. **Runtime location guard / location resolver required** — GA2/GA3 must not activate without confirmed job/property city/AHJ match; **GA1–GA5** (AHJ / install-readiness) blocked from runtime until guard exists.

Promotion also requires: test pass, manifest entry, loader allowlist update, and role/surface gates — **not** implied by this index.

---

## Follow-On Operations Layer (GFO1–GFO5)

GFO1–GFO5 now exist as **candidate** follow-on files under `_candidate-updates/gas-fireplace/`. They are **not approved** and **not runtime**.

| GFO# | Candidate file | Topic |
|------|----------------|-------|
| GFO1 | `candidate-gas-fireplace-manufacturer-model-manual-boundary-v1.md` | Manufacturer / model / manual boundary |
| GFO2 | `candidate-gas-fireplace-report-wording-inspection-support-v1.md` | Report wording / inspection support |
| GFO3 | `candidate-gas-fireplace-maintenance-service-sop-boundary-v1.md` | Maintenance / service SOP boundary |
| GFO4 | `candidate-gas-fireplace-customer-portal-safe-faq-v1.md` | Customer portal safe FAQ |
| GFO5 | `candidate-gas-fireplace-approved-conversion-plan-v1.md` | Candidate conversion plan (planning only) |

**Still deferred:** runtime location guard / job-property location resolver (engineering work). Manufacturer/manual policy, report wording, maintenance SOP, customer portal QA, and conversion planning are covered by GFO candidate files but remain **not approved** until explicit promotion.

**GA/AHJ runtime promotion** (GA1–GA5) remains blocked until runtime location guard / job-property location resolver exists.

---

## Relationship to GF1–GF5

| Layer | Set | Purpose |
|-------|-----|---------|
| Foundation | GF1–GF5 | North America general diagnostics, safety, dispatch, SKU, photos |
| Alberta install intelligence | GA1–GA5 | Province/city permit-readiness, climate modifier, new-install workflow |

GF index: [`gas-fireplace-residential-candidate-set-index-v1.md`](gas-fireplace-residential-candidate-set-index-v1.md)

---

## Final Principle

GA1–GA5 is a **structured Alberta install intelligence candidate layer** for WizField’s professional B2B Field OS. It must **not** be treated as approved runtime knowledge until each pack is reviewed, location-guarded, source-verified, and intentionally promoted.

**Reminder:** Candidate only. Not approved. Not runtime.
