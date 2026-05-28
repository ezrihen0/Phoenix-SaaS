# Garage Door Residential Candidate Set Index — R1–R10

## Status

**Candidate set index only. Not approved knowledge. Not runtime AI knowledge.**

This file summarizes and organizes the residential garage-door **candidate** set (R1–R10). It does not add trade facts, repair procedures, pricing, or runtime behavior. It is a review and navigation document for owners, reviewers, and agents.

## Scope

| Dimension | Value |
|-----------|--------|
| Trade | garage-door |
| Segment | residential |
| Region | North America general |
| Commercial garage doors | **Out of scope** for this candidate set |
| Jurisdiction / code / AHJ | **Out of scope** (future jurisdictional packs separate) |
| Manufacturer-specific procedures | **Out of scope** unless future approved sources and packs exist |

---

## Candidate Set Summary Table

| R# | Candidate file | Topic | Primary purpose | Main audience/surface | Risk level | Source requirement | Approval blocker | Runtime readiness |
|----|----------------|-------|-----------------|------------------------|------------|-------------------|------------------|-------------------|
| R1 | `candidate-garage-door-residential-diagnostics-basics-v1.md` | Residential diagnostics basics | Symptom triage, intake questions, safety boundaries, customer-safe explanations | dispatcher_workspace, technician_mobile | Medium (High/Critical escalation for spring/cable/off-track) | Recommended general; required/expert for safety-sensitive | Expert review for safety claims; test questions | Candidate only |
| R2 | `candidate-garage-door-residential-tune-up-baseline-v1.md` | Residential tune-up baseline | Universal preventive inspection/maintenance baseline (non-climate) | technician_mobile, dispatcher_workspace, owner_admin | Medium (High/Critical escalation) | Recommended general; required/expert for safety | Expert review; company SOP for maintenance scope | Candidate only |
| R3 | `candidate-garage-door-residential-climate-factors-v1.md` | Residential climate factors | Climate modifiers on top of R2 (cold, hot-humid, coastal, dry/dusty) | technician_mobile, dispatcher_workspace | Medium (High/Critical escalation) | Recommended general; required/expert for safety | Expert review; must not blend with code/AHJ | Candidate only |
| R4 | `candidate-garage-door-residential-opener-sensors-controls-v1.md` | Opener / sensors / controls | Opener, photo-eyes, wall/remote/keypad triage; entrapment boundaries | dispatcher_workspace, technician_mobile | Medium (High/Critical for entrapment/bypass) | Recommended general; required/expert for UL/manufacturer/force | Manufacturer manual for model-specific; expert review | Candidate only; Needs manufacturer manual linkage |
| R5 | `candidate-garage-door-residential-weather-seal-gaps-threshold-v1.md` | Weather seal / gaps / threshold | Seal, gap, water, draft, pest; not waterproof guarantee | technician_mobile, dispatcher_workspace | Low/Medium (High/Critical escalation) | Recommended general; required/expert for structural/waterproofing | Expert review if overclaiming; no waterproof guarantee | Candidate only |
| R6 | `candidate-garage-door-residential-noise-vibration-slow-operation-v1.md` | Noise / vibration / slow operation | Noise triage; must not mask bang/heavy/crooked | technician_mobile, dispatcher_workspace | Medium (High/Critical escalation) | Recommended general; required/expert for safety | Screen before noise-only booking; expert review | Candidate only |
| R7 | `candidate-garage-door-residential-springs-cables-off-track-safety-boundary-v1.md` | Springs / cables / off-track safety boundary | High-risk safety boundary; triage and escalation only—no procedures | dispatcher_workspace, technician_mobile (boundary only) | **High/Critical** | **Required / expert review** | **Expert review mandatory**; strict surface controls | **Not runtime-safe for procedures**; Needs expert review |
| R8 | `candidate-garage-door-residential-report-wording-estimate-support-v1.md` | Report wording / estimate support | Observation → recommendation wording; no prices | technician_mobile, owner_admin, office_crm | Medium (High/Critical in wording) | Recommended general; required for price/warranty/legal | Needs pricebook/SOP; Needs company policy (warranty) | Candidate only; Needs pricebook/SOP |
| R9 | `candidate-garage-door-residential-dispatch-intake-booking-classification-v1.md` | Dispatch intake / booking classification | Intake matrix, safety screen, booking category, priority | **dispatcher_workspace** primary | Medium (High/Critical escalation) | Recommended general; required for safety/manufacturer | Align with company dispatch SOP/SKUs | Candidate only |
| R10 | `candidate-garage-door-residential-service-packages-sku-upsell-matrix-v1.md` | Service packages / SKU / upsell | SKU families, symptom→opportunity matrix; no prices | **owner_admin** primary, office_crm | Medium (High/Critical override) | Recommended general; required for price/warranty/parts | Needs pricebook/SOP; company SKU activation | Candidate only; Needs pricebook/SOP; Needs company policy |

---

## R1–R10 Functional Map

### 1. Diagnosis / Intake

- **R1** — Residential diagnostics basics (symptoms, components, dispatcher/technician intake, safety boundaries)
- **R9** — Dispatch intake / booking classification matrix (safety screen, priority, handoff)

### 2. Tune-Up / Maintenance Baseline

- **R2** — Residential tune-up baseline (sectional inspection areas; universal NA baseline)

### 3. Climate / Regional Modifier

- **R3** — Climate factors (modifies R2; not standalone inspection standard)

### 4. Opener / Sensors / Controls

- **R4** — Opener, photo-eyes, wall/remote/keypad; entrapment; no force/limit values

### 5. Weather Seal / Gaps / Threshold

- **R5** — Seals, gaps, water, draft, threshold; mechanical overlap screening

### 6. Noise / Vibration / Slow Operation

- **R6** — Noise triage; bang/heavy/crooked escalation

### 7. High-Risk Safety Boundary

- **R7** — Springs, cables, off-track, counterbalance; **no repair procedures**

### 8. Reports / Estimate Wording

- **R8** — Field notes, customer summaries, estimate language, overclaim prevention

### 9. Service Packages / SKU / Upsell

- **R10** — SKU families, upsell matrix, quote-review prompts (no pricing)

---

## Knowledge Coverage

The R1–R10 candidate set collectively covers:

- **Residential diagnostics** — symptom vocabulary, intake, high-risk screen (R1)
- **Preventive tune-up baseline** — universal inspection scope (R2)
- **Climate modifiers** — cold, hot-humid, coastal salt-air, dry/dusty (R3 on R2)
- **Opener/sensor triage** — controls, entrapment, no bypass (R4)
- **Weather seal / gap / water / draft** — assessment language, no waterproof guarantee (R5)
- **Noise / vibration / slow-operation** — triage without masking mechanical safety (R6)
- **Spring / cable / off-track safety boundary** — stop-use, escalation, no DIY (R7)
- **Customer-safe wording** — across R1–R10 audience drafts
- **Dispatcher booking classification** — matrix, priority, scripts (R9)
- **Technician handoff notes** — R9, R8, R10
- **Owner/admin SOP hooks** — CRM tags, QA rules (R8, R9, R10)
- **Service package / SKU category mapping** — inspection-based opportunities (R10)

**Cross-reference rule:** Use R7 for any high-risk mechanical finding; R9 for booking; R8 for wording; R10 for SKU/opportunity after inspection context exists.

---

## Explicit Non-Coverage

The R1–R10 set does **not** cover:

- Commercial garage doors
- Rolling steel / high-cycle commercial doors
- Exact torsion spring turn counts
- Spring winding procedures
- Cable reinstallation procedures
- Bottom bracket repair procedures
- Off-track reseating instructions
- Manufacturer-specific programming or flash-code tables
- Exact opener force / limit / travel values
- Pricing or pricebook line amounts
- Warranty policy language
- Inventory / stock / same-day availability promises
- Permit / code / AHJ / licensing requirements
- Legal compliance claims
- **Approved runtime loading** (loader allowlist, manifest registration, Field Copilot production use)

---

## Risk Map

| Risk tier | Topics / candidates |
|-----------|---------------------|
| **Low / Medium** | Tune-up (R2); seal/gap with clean safety screen (R5); noise with clean screen (R6); remote/keypad accessory when door safe (R4); customer-safe education (R1, R8) |
| **Medium** | Opener/sensor diagnostic (R4); dispatch classification (R9); report/estimate wording (R8); service package suggestions (R10); climate modifiers when observational (R3) |
| **High / Critical** | Springs, cables, bottom brackets, drums/pulleys (R7); off-track / crooked door (R7); door drop/slam (R7); entrapment / safety reverse failure (R4, R7); injury / property damage (R7, R9); sensor bypass (R4); opener force/limit claims without manual (R4); loud bang + heavy door (R1, R6, R7, R9) |

**Override rule:** High/Critical findings **override** tune-up, noise-only, seal-only, and opener-only booking or upsell (R7, R9, R10).

---

## Audience / Surface Map

| Surface | Allowed (when candidates approved) | Blocked |
|---------|-----------------------------------|---------|
| **Technician mobile** | Field notes, inspection checklists, observation→recommendation, safety escalation, candidate line items (R2–R6, R8, R10) | Repair procedures (R7); turn counts; force/limit values (R4); definitive diagnosis without inspection |
| **Dispatcher workspace** | Intake, safety screen, booking category, priority, customer scripts (R1, R9); no final diagnosis | DIY steps; sensor bypass; price/part promises; downgrade high-risk |
| **Owner / admin** | SOP, CRM tags, SKU design, QA rules (R8–R10) | Runtime pricing/warranty without pricebook/policy |
| **Office CRM** | Tags, handoff, quote_review_needed flags | Auto-approved knowledge without review |
| **Customer portal (safe-only)** | Stop-use warnings, schedule service, safe checks, non-guarantee language | DIY repair; bypass sensors; force settings |
| **Public site (high-level only)** | Professional service education | Pricing promises; DIY guides; fear-based copy |
| **Not-runtime-safe procedural content** | — | All spring/cable/off-track/bypass/force procedures (especially R7) |

---

## Promotion Readiness

**None of R1–R10 should be promoted automatically.**

Each file remains `Review Decision: Pending` until explicit owner-approved conversion to an **approved knowledge pack**.

### Future promotion checklist (per pack or subset)

- [ ] Owner approval
- [ ] Expert review where required (especially R4, R7)
- [ ] Source verification for safety-sensitive claims
- [ ] Test question review and Field Copilot QA pass
- [ ] Runtime surface approval (`allowed_runtime_surfaces` / `blocked_runtime_surfaces`)
- [ ] Audience approval (`intended_audience`, `minimum_user_role`)
- [ ] Company SOP linkage (maintenance, dispatch, high-risk routing)
- [ ] **Pricebook linkage** for R8 and R10 estimate language
- [ ] **Warranty policy linkage** for R8 and R10 customer-facing text
- [ ] **Manufacturer manual linkage** for R4 model-specific content
- [ ] **Manifest update** only after explicit approval
- [ ] **Loader allowlist** only after explicit approval
- [ ] Field Copilot QA prompts (regression suite per pack)

---

## Recommended Approved-Pack Conversion Order

Suggested **safe** order for future promotion to approved packs:

| Order | Pack | Rationale |
|-------|------|-----------|
| 1 | R1 diagnostics basics | Foundational triage; broad operational value; medium risk with clear escalation |
| 2 | R2 tune-up baseline | Core preventive workflow; builds on R1 screen |
| 3 | R5 weather seal/gaps | Common service line; low/medium risk with clear limitations |
| 4 | R6 noise/vibration | Common complaints; requires R1/R7 screen discipline |
| 5 | R9 dispatch intake | High dispatcher value; depends on R1/R7 routing rules |
| 6 | R8 report wording | Depends on observed findings from prior packs; needs pricebook for estimates |
| 7 | R10 service package/SKU | Depends on R8/R9; **requires pricebook and SKU list** |
| 8 | R3 climate factors | Modifier pack; promote after R2 baseline exists |
| 9 | R4 opener/sensors | Manufacturer-specific edges; manual linkage required |
| 10 | R7 spring/cable/off-track safety boundary | **Highest risk**; promote last; **strict safety-boundary only** unless expert approves broader scope |

**Why this order:** Deliver lower-risk operational value first. Delay high-risk and manufacturer-specific topics until expert review, test QA, and business policy linkage are complete. **R7 must remain strict safety-boundary** unless explicitly expanded with expert sign-off.

---

## Next Gaps After R1–R10

Future **candidate** topics (not started in R1–R10):

- Residential door types / panel materials (steel, wood, glass)
- Residential measurement / size / opening basics
- Photo intake standards (required angles, distance, safety)
- Technician QA checklist (post-visit)
- Brand/manufacturer-specific opener manual summaries (per brand packs)
- Alberta / Calgary / Edmonton jurisdiction-specific guidance (if needed)
- USA state-specific guidance (if needed)
- Parts terminology glossary
- Customer portal safe FAQ (approved subset)
- Approved runtime QA test suite (prompt library + expected safe/forbidden answers)
- Commercial garage door candidate track (separate segment)

---

## Final Principle

The R1–R10 residential garage-door **candidate set** is a **structured knowledge foundation** for WizField’s professional B2B Field OS workflow.

It must **not** be treated as approved runtime knowledge until each pack (or approved subset) is:

1. Reviewed and promoted intentionally  
2. Tested with Field Copilot QA  
3. Registered in the manifest (when applicable)  
4. Added to loader allowlists (when applicable)  
5. Bound to company pricebook, warranty, and SOP where relevant  

Until then, agents and runtime systems should use these files for **methodology, review, and candidate preparation only**.

---

## File Inventory (R1–R10)

| R# | Path | In git |
|----|------|--------|
| R1 | `candidate-garage-door-residential-diagnostics-basics-v1.md` | Yes |
| R2 | `candidate-garage-door-residential-tune-up-baseline-v1.md` | Yes |
| R3 | `candidate-garage-door-residential-climate-factors-v1.md` | Yes |
| R4 | `candidate-garage-door-residential-opener-sensors-controls-v1.md` | Yes |
| R5 | `candidate-garage-door-residential-weather-seal-gaps-threshold-v1.md` | Yes |
| R6 | `candidate-garage-door-residential-noise-vibration-slow-operation-v1.md` | Yes |
| R7 | `candidate-garage-door-residential-springs-cables-off-track-safety-boundary-v1.md` | Yes |
| R8 | `candidate-garage-door-residential-report-wording-estimate-support-v1.md` | Yes |
| R9 | `candidate-garage-door-residential-dispatch-intake-booking-classification-v1.md` | Yes |
| R10 | `candidate-garage-door-residential-service-packages-sku-upsell-matrix-v1.md` | Yes |

*Index file:* `garage-door-residential-candidate-set-index-v1.md` (this document)
