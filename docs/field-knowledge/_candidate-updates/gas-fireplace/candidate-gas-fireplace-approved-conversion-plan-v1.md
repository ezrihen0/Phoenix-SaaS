# Gas-Fireplace Candidate Conversion Plan — GF + GA + GFO v1

## Status

**Planning document only. Not approved knowledge. Not runtime AI knowledge.**

**Runtime surface:** `not_runtime_safe`

This document defines how gas-fireplace **candidate knowledge** may later be converted into **approved packs** safely. It is a **candidate planning document only** — not an approved pack, not manifest registration, and not runtime activation.

## Purpose

Protect WizField from unsafe runtime activation by separating:

- candidate research (GF, GA, GFO)
- owner review
- expert/source review
- approved-pack creation
- test coverage
- manifest registration
- loader allowlist update
- runtime surface activation
- **runtime location guard** (deferred engineering — required before GA AHJ packs)

**No runtime, manifest, or loader changes in this sprint.**

---

## Current Candidate Inventory

### Foundation — GF1–GF5 (North America general)

| ID | Candidate file | Topic | Risk level | Primary runtime surface candidate | Conversion blocker | Recommended phase |
|----|----------------|-------|------------|-----------------------------------|--------------------|-------------------|
| GF1 | `candidate-gas-fireplace-residential-diagnostics-basics-v1.md` | Diagnostics basics | High (Critical escalation) | dispatcher_workspace, technician_mobile | source verification + safety tests | GF-A |
| GF2 | `candidate-gas-fireplace-safety-boundary-v1.md` | Safety boundary | High / Critical | dispatcher_workspace, technician_mobile, customer_portal safe-only | expert review + strict refusal tests | GF-E |
| GF3 | `candidate-gas-fireplace-visual-condition-intake-v1.md` | Visual intake | High | dispatcher_workspace, technician_mobile | no-disassembly tests + photo hallucination tests | GF-A |
| GF4 | `candidate-gas-fireplace-dispatch-booking-classification-v1.md` | Dispatch / booking | High (Critical escalation) | dispatcher_workspace | dispatch SOP linkage + safety screen tests | GF-B |
| GF5 | `candidate-gas-fireplace-service-packages-sku-estimate-support-v1.md` | Service packages / SKU | High when safety present | owner_admin, office_crm | pricebook + SKU + safety override tests | GF-C |

**Index:** `gas-fireplace-residential-candidate-set-index-v1.md` (committed)

### Alberta Install Intelligence — GA1–GA5

| ID | Candidate file | Topic | Risk level | Primary runtime surface candidate | Conversion blocker | Recommended phase |
|----|----------------|-------|------------|-----------------------------------|--------------------|-------------------|
| GA1 | `candidate-gas-fireplace-alberta-provincial-code-permit-baseline-v1.md` | Alberta provincial baseline | High / Critical | dispatcher_workspace, owner_admin | source re-verify + expert review + **location guard** | GA-D |
| GA2 | `candidate-gas-fireplace-calgary-install-permit-readiness-v1.md` | Calgary permit readiness | High / Critical | dispatcher_workspace, owner_admin | source re-verify + **location guard (Calgary)** | GA-D |
| GA3 | `candidate-gas-fireplace-edmonton-install-permit-readiness-v1.md` | Edmonton permit readiness | High / Critical | dispatcher_workspace, owner_admin | source re-verify + **location guard (Edmonton)** | GA-D |
| GA4 | `candidate-gas-fireplace-alberta-cold-weather-venting-field-reality-v1.md` | Cold-weather field reality | High | dispatcher_workspace, technician_mobile | climate wording QA; no permit content | GA-C |
| GA5 | `candidate-gas-fireplace-new-install-intake-quote-readiness-v1.md` | New install / quote readiness | High / Critical | dispatcher_workspace, office_crm | runtime location guard / job-property location resolver + source re-verify | GA-D |

**Index:** `gas-fireplace-alberta-install-intelligence-candidate-set-index-v1.md` (committed)

**Hard block:** GA1–GA3 **must not** go runtime until **runtime location guard / location resolver** exists (deferred engineering sprint).

### Operations / Documentation — GFO1–GFO4 (this sprint)

| ID | Candidate file | Topic | Risk level | Primary runtime surface candidate | Conversion blocker | Recommended phase |
|----|----------------|-------|------------|-----------------------------------|--------------------|-------------------|
| GFO1 | `candidate-gas-fireplace-manufacturer-model-manual-boundary-v1.md` | Manufacturer / model / manual | High / Critical | dispatcher_workspace, technician_mobile | source/manual policy + no-clearance-number tests | GFO-D |
| GFO2 | `candidate-gas-fireplace-report-wording-inspection-support-v1.md` | Report wording | High | technician_mobile, office_crm | report QA rules + compliance refusal tests | GFO-B |
| GFO3 | `candidate-gas-fireplace-maintenance-service-sop-boundary-v1.md` | Maintenance SOP boundary | High | dispatcher_workspace, owner_admin | **company maintenance SOP** + procedural refusal tests | GFO-C |
| GFO4 | `candidate-gas-fireplace-customer-portal-safe-faq-v1.md` | Customer portal FAQ | High | customer_portal safe-only | **surface-specific QA** + refusal tests | GFO-E |

---

## Non-Negotiable Promotion Rules

1. No candidate may be promoted automatically.
2. Approved pack must be created **separately** from the candidate file.
3. Candidate file remains historical/auditable.
4. Runtime use requires: approved pack, owner approval, source/expert review where required, test questions, manifest registration, loader allowlist, runtime surface gating.
5. **Loader allowlist must never include `_candidate-updates`.**
6. No gas repair procedures, pilot relight, valve operation, pressure/combustion tuning, vent disassembly, or safety bypass — ever on customer/public surfaces.
7. No code/AHJ/permit/insurance/compliance claims without approved jurisdiction-specific source and expert review.
8. No pricing/warranty/stock/same-day promises without business systems.
9. **AHJ / install-readiness packs (GA1–GA3 and GA5) blocked until runtime location guard / job-property location resolver exists.**
10. **GFO1 blocked until source/manual policy exists.**
11. **GFO3 blocked until company maintenance SOP exists.**
12. **GFO4 blocked until customer_portal surface-specific QA exists.**
13. No employee license gate in any promoted pack unless explicitly scoped in future work.
14. Wood-burning fireplace content stays in **chimney** track — not gas-fireplace.

---

## Which Candidates Can Be Promoted First

### Tier 1 — Lowest operational risk (after review)

| Order | Candidate | Why first |
|-------|-----------|-----------|
| 1 | **GF2** Safety boundary | Foundation for all surfaces; expert review required but universal |
| 2 | **GF1** Diagnostics basics | Intake and symptom buckets; pairs with GF2 |
| 3 | **GF4** Dispatch / booking | Workflow value; requires dispatch SOP |
| 4 | **GF3** Visual intake | Photo rules; low procedural risk |
| 5 | **GF5** Service categories | Requires pricebook; after GF4 workflow |

### Tier 2 — Operations / wording (after Tier 1 controls)

| Order | Candidate | Blocker |
|-------|-----------|---------|
| 6 | **GFO2** Report wording | QA policy + compliance refusal tests |
| 7 | **GFO3** Maintenance boundary | Company maintenance SOP |
| 8 | **GFO4** Customer FAQ | Surface-specific QA; after GF2 runtime |
| 9 | **GFO1** Manufacturer boundary | Manual/source policy |

### Tier 3 — Alberta modifiers (after location guard for AHJ)

| Order | Candidate | Blocker |
|-------|-----------|---------|
| 10 | **GA4** Cold-weather field reality | Climate QA only — no AHJ |
| 11 | **GA5** New install hub | Runtime location guard / job-property location resolver + source re-verify |
| 12 | **GA1–GA3** AHJ packs | **Location guard + source re-verify + expert review** |

---

## Promotion Readiness Matrix

Legend: **Ready after blockers** / **Dispatcher-safe only** / **Customer-safe later** / **Blocked public** / **Blocked all runtime**

| Candidate | Source verify | Expert review | Dispatcher-safe | Customer-safe later | Block public | Block until |
|-----------|---------------|---------------|-----------------|---------------------|--------------|-------------|
| GF1 | recommended | safety review | yes | safe-only summaries | procedures | tests |
| GF2 | recommended | **required** | yes | safe-only warnings | all repair steps | expert sign-off |
| GF3 | recommended | photo QA | yes | photo guidance only | disassembly | tests |
| GF4 | recommended | dispatch SOP | **primary surface** | booking summary only | diagnosis | dispatch SOP |
| GF5 | required for $/warranty | owner | limited | service names only | pricing | pricebook |
| GA1 | **required** | **required** | yes (intake) | permit FAQ defer | compliance claims | **location guard** |
| GA2 | **required** | **required** | yes (Calgary match) | no permit guarantee | all surfaces if wrong city | **location guard** |
| GA3 | **required** | **required** | yes (Edmonton match) | no permit guarantee | all surfaces if wrong city | **location guard** |
| GA4 | recommended | climate QA | yes | seasonal tips only | permit content | climate tests |
| GA5 | **required** | **required** | yes | install intake only | permit guarantees | **runtime location guard** |
| GFO1 | **required** | **required** | yes | nameplate request only | clearance numbers | manual policy |
| GFO2 | required for compliance | QA/legal | summary only | customer summaries | pass/fail | QA policy |
| GFO3 | recommended | **required** | yes | category explanation | procedures | **company SOP** |
| GFO4 | required for permit FAQ | **required** | themes only | **primary surface** | DIY/repair | **portal QA** |

---

## Candidates Requiring Source Verification

| Candidate | Source-required claims |
|-----------|------------------------|
| GF1 | Official gas safety references if cited |
| GF5 | Pricing, warranty, insurance, manufacturer |
| GA1–GA5 | All permit/code/AHJ claims |
| GFO1 | All clearance, venting, listing, parts claims |
| GFO2 | Compliance, insurance, pass/fail templates |
| GFO3 | Manufacturer maintenance intervals if cited |
| GFO4 | Permit/AHJ FAQ answers |

---

## Candidates Requiring Expert Review

| Candidate | Reason |
|-----------|--------|
| GF2 | Critical safety boundary |
| GA1–GA3 | Legal/compliance AHJ interpretation |
| GA5 | Install quote-readiness liability |
| GFO1 | Model/clearance liability |
| GFO2 | Compliance wording |
| GFO3 | Procedural creep prevention |
| GFO4 | Customer surface safety |

---

## Dispatcher-Safe Only (never full technician procedures on dispatch)

- GF4 (primary)
- GA5 intake routing (with location match)
- GFO3 booking classification
- GFO1 intake questions

Dispatch must **not** receive: repair steps, clearance numbers, pass/fail, permit guarantees.

---

## Customer-Safe Later (with surface gating)

| Candidate | Allowed customer content |
|-----------|-------------------------|
| GF2 | Stop-use and escalation messaging |
| GF3 | Safe photo guidance |
| GFO4 | FAQ snippets (primary customer pack) |
| GFO2 | Report summaries only |
| GFO3 | “Scope depends on visit” explanation |
| GF5 | Service category names — no prices |

**Blocked from customer/public always:** GA1–GA3 permit law detail without location guard; GFO1 clearance numbers; any gas procedure.

---

## Conversion Phases

### Phase GF-A — Operational Foundation

**Candidates:** GF1, GF3

**Surfaces after approval:** dispatcher_workspace, technician_mobile, office_crm, customer_portal safe-only

**Blockers:** source verification, owner review, safety + hallucination tests

### Phase GF-B — Dispatch Workflow

**Candidates:** GF4, GFO2 (report wording — parallel track)

**Surfaces:** dispatcher_workspace, office_crm, technician_mobile

**Blockers:** dispatch SOP, report QA, test suite

### Phase GF-C — Business / SKU Layer

**Candidates:** GF5, GFO3 (after company SOP)

**Surfaces:** owner_admin, office_crm

**Blockers:** pricebook, maintenance SOP, no safety downgrade tests

### Phase GF-E — High-Risk Safety Boundary

**Candidates:** GF2

**Surfaces:** dispatcher_workspace, technician_mobile, customer_portal safe-only warning

**Blockers:** expert review, strict refusal tests (pilot, valve, pressure, vent)

### Phase GFO-D — Manufacturer / Manual Boundary

**Candidates:** GFO1

**Blockers:** manual lookup policy, no-clearance-number tests, expert review

### Phase GFO-E — Customer Portal FAQ

**Candidates:** GFO4

**Surfaces:** customer_portal safe-only

**Blockers:** surface-specific QA, refusal tests, sync with GF2

### Phase GA-C — Climate Modifier (no AHJ)

**Candidates:** GA4

**Blockers:** climate wording QA, no permit content tests

### Phase GA-D — Alberta AHJ / Install (last)

**Candidates:** GA1, GA2, GA3, GA5

**Blockers:** **runtime location guard**, source re-verify, expert review, Toronto/out-of-scope smoke tests

---

## Required Test / QA Before Approval

1. **Safety refusal tests** — pilot relight, valve, burner, pressure, combustion, vent disassembly, safety bypass, CO safe-level
2. **Surface tests** — customer_portal safe-only; dispatcher no procedures; public blocked for AHJ
3. **Role tests** — dispatcher vs technician vs owner vs customer
4. **Hallucination tests** — no invented model, clearance, photo findings, phone diagnosis
5. **Business-system tests** — pricebook (GF5), maintenance SOP (GFO3), dispatch SOP (GF4)
6. **Location tests** — Calgary rules not applied to Toronto; Edmonton rules not applied to unknown city; GA5 smoke test
7. **Compliance refusal tests** — no pass/fail, code-compliant, insurance-approved, permit-approved
8. **FAQ refusal tests** — portal DIY/repair/pilot prompts

---

## Manifest / Loader Strategy (Deferred)

No manifest or loader changes in this plan or GFO sprint.

Future steps **only after**:

1. Approved pack file exists under `docs/field-knowledge/trades/gas-fireplace/` or `jurisdictions/`
2. Test suite passes
3. Owner approves runtime activation
4. Surface/role gates defined
5. Location guard deployed for GA packs
6. Rollback plan documented

**Proposed path convention (do not create now):**

- `docs/field-knowledge/trades/gas-fireplace/canada/alberta/` — trade baseline
- `docs/field-knowledge/jurisdictions/canada/alberta/` — AHJ packs

---

## Rollback Strategy

- Disable approved pack in manifest/loader first if safety issue found.
- Candidate history preserved for audit.
- GA packs: disable location-specific loader entries if wrong-city activation detected.

---

## Cross-Reference Map

| Layer | Set | Index |
|-------|-----|-------|
| Foundation | GF1–GF5 | `gas-fireplace-residential-candidate-set-index-v1.md` |
| Alberta install | GA1–GA5 | `gas-fireplace-alberta-install-intelligence-candidate-set-index-v1.md` |
| Operations | GFO1–GFO4 | (future GFO index optional — not in this sprint) |
| Planning | GFO5 | this document |

**Pattern reference (read-only):** `garage-door-approved-conversion-plan-v1.md`

---

## Recommended Next Action

Do **not** perform conversion now.

When ready, start with **one** approved pack only:

- **Preferred:** GF2 Safety boundary (expert review + refusal tests) **OR** GF1 Diagnostics (lower surface risk after GF2 tests drafted)

Do not promote GA1–GA3 until runtime location guard engineering completes.

---

## Final Principle

Candidate knowledge is not product knowledge. Approved knowledge is not runtime knowledge until manifest-registered, loader-approved, tested, and surface-gated. Gas-fireplace knowledge must remain **safety-boundary first**, never **procedure-first**. AHJ content requires **location match** — guard deferred, blockers explicit.

**Reminder:** This file (GFO5) is candidate planning only. Not approved. Not runtime.
