# Chimney Residential Candidate Set Index — CH1–CH10

## Status

**Candidate set index only. Not approved knowledge. Not runtime AI knowledge.**

This file summarizes and organizes the residential chimney **candidate** set (CH1–CH10). It does not add trade facts, repair procedures, pricing, or runtime behavior. It is a review and navigation document for owners, reviewers, and agents.

**Foundation lock:** Residential Chimney Candidate Foundation v1 (CH1–CH10) completed and QA-reviewed; cross-references aligned in QA fix pass. Not approved for runtime.

## Scope

| Dimension | Value |
|-----------|--------|
| Trade | chimney |
| Segment | residential |
| Region | North America general (CH10 = Alberta cold-climate modifier only) |
| Commercial chimneys | **Out of scope** |
| Gas-fireplace trade track | **Out of scope** (appliance type may appear in intake only) |
| Jurisdiction / code / AHJ | **Out of scope** (CH10 is climate only, not legal) |
| WETT certification claims | **Out of scope** unless future sourced approved packs |

---

## Candidate Set Summary Table

| CH# | Candidate file | Topic | Primary purpose | Risk level | Runtime readiness |
|-----|----------------|-------|-----------------|------------|-------------------|
| CH1 | `candidate-chimney-residential-diagnostics-basics-v1.md` | Diagnostics basics | System ID, symptom buckets, global safety screen, intake | High (Critical escalation) | Candidate only |
| CH2 | `candidate-chimney-residential-cleaning-sweep-baseline-v1.md` | Cleaning / sweep baseline | Service category; upgrade to inspection | High | Candidate only |
| CH3 | `candidate-chimney-water-intrusion-cap-crown-flashing-v1.md` | Water / cap / crown / flashing | Leak triage; no roof repair procedures | High | Candidate only |
| CH4 | `candidate-chimney-flue-liner-smoke-chamber-draft-basics-v1.md` | Flue / liner / draft | Anatomy; draft/smoke; no liner repair | High | Candidate only |
| CH5 | `candidate-chimney-creosote-wood-burning-safety-boundary-v1.md` | Creosote / wood-burning safety | Fire-risk boundary; no burn-it-out / DIY | High (Critical) | Candidate only |
| CH6 | `candidate-chimney-masonry-brick-mortar-rebuild-assessment-v1.md` | Masonry assessment | Damage categories; structural escalation | High (Critical structural) | Candidate only |
| CH7 | `candidate-chimney-report-wording-wett-style-inspection-support-v1.md` | Report wording (WETT-style) | Observed/reported/limitations; no cert claims | High | Candidate only |
| CH8 | `candidate-chimney-dispatch-intake-booking-classification-v1.md` | Dispatch intake / booking | Safety screen, booking tags, handoff | High | Candidate only |
| CH9 | `candidate-chimney-service-packages-sku-estimate-support-v1.md` | Service packages / SKU | Category map; no prices | High | Candidate only |
| CH10 | `candidate-chimney-climate-alberta-cold-weather-modifier-v1.md` | Alberta cold-climate modifier | Freeze-thaw, seasonal intake; not legal | High | Candidate only |

All packs: **Runtime surface:** `not_runtime_safe`

---

## CH1–CH10 Functional Map

1. **Diagnostics / global safety** — CH1
2. **Cleaning / sweep service category** — CH2
3. **Water intrusion** — CH3
4. **Flue / liner / draft** — CH4
5. **Creosote / fire safety boundary** — CH5
6. **Masonry assessment** — CH6
7. **Report / customer summary wording** — CH7
8. **Dispatch / booking** — CH8
9. **Service packages / estimate support** — CH9
10. **Alberta climate modifier** — CH10 (modifier on CH1–CH6)

**Cross-reference rule:** CH8 for booking; CH5 for fire-risk override; CH7 for reports; CH9 for SKU after inspection; CH6 for structural; CH10 when Alberta/cold context applies.

---

## Explicit Non-Coverage

- Commercial chimneys
- DIY cleaning, sweeping, rodding, chemical treatments, burn-it-out
- Blockage/nest removal procedures
- Liner/flue/masonry repair procedures
- Gas appliance repair
- Remote CO diagnosis
- Pricing, warranty, insurance approval, same-day promises
- WETT/code/AHJ/legal claims without verified sources
- Approved runtime loading

---

## Recommended Promotion Order (future — not automatic)

| Order | Pack | Rationale |
|-------|------|-----------|
| 1 | CH1 diagnostics | Foundation + safety screen |
| 2 | CH8 dispatch intake | Booking quality |
| 3 | CH2 cleaning | Common service line with upgrade rules |
| 4 | CH5 creosote safety | Fire-risk boundary |
| 5 | CH3 water intrusion | Common leak calls |
| 6 | CH4 flue/draft | Venting complaints |
| 7 | CH6 masonry | Structural assessment |
| 8 | CH7 report wording | After field findings exist |
| 9 | CH9 service packages | Needs pricebook/SOP |
| 10 | CH10 Alberta climate | Modifier after CH1/CH3/CH6 baselines |

---

## Final Principle

CH1–CH10 is a **structured candidate foundation** for WizField’s professional B2B Field OS. It must **not** be treated as approved runtime knowledge until each pack is reviewed, tested, manifest-registered, and loader-allowlisted intentionally.
