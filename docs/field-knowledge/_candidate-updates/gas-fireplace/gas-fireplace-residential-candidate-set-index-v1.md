# Gas-Fireplace Residential Candidate Set Index — GF1–GF5

## Status

**Candidate set index only. Not approved knowledge. Not runtime AI knowledge.**

This file summarizes and organizes the residential **gas-fireplace** **candidate** set (GF1–GF5). It does not add trade facts, gas repair procedures, pricing, combustion adjustments, or runtime behavior. It is a review and navigation document for owners, reviewers, and agents.

**Foundation:** Gas-Fireplace Candidate Foundation GF1–GF5 (candidate track under `_candidate-updates/gas-fireplace/`). Not approved for runtime. Distinct from approved packs in `docs/field-knowledge/gas-fireplace/` and from the chimney candidate track.

## Scope

| Dimension | Value |
|-----------|--------|
| Trade | gas-fireplace |
| Segment | residential |
| Region | North America general |
| Wood-burning fireplaces | **Out of scope** — see chimney candidates (e.g. wood-burning fireplace safety follow-on) |
| Electric fireplaces | **Out of scope** |
| Generic `_candidate-updates/fireplace/` | **Do not use** |
| Jurisdiction / code / AHJ | **Out of scope** in GF1–GF5 — see follow-on **GA1–GA5** Alberta install intelligence layer (candidate only) |
| Approved runtime domain | `gas_fireplace` loader allowlist unchanged until explicit promotion |

---

## Candidate Set Summary Table

| GF# | Candidate file | Topic | Primary purpose | Risk level | Runtime readiness |
|-----|----------------|-------|-----------------|------------|-------------------|
| GF1 | `candidate-gas-fireplace-residential-diagnostics-basics-v1.md` | Diagnostics basics | Gas appliance/venting ID, symptom buckets, global safety screen, intake | High (Critical escalation) | Candidate only |
| GF2 | `candidate-gas-fireplace-safety-boundary-v1.md` | Safety boundary | Gas smell, CO, flame, ignition, soot, venting; stop-use; no gas DIY | High (Critical) | Candidate only |
| GF3 | `candidate-gas-fireplace-visual-condition-intake-v1.md` | Visual intake | Safe photo categories; no disassembly or test burn | High | Candidate only |
| GF4 | `candidate-gas-fireplace-dispatch-booking-classification-v1.md` | Dispatch / booking | Visit types, safety screen, booking tags, handoff | High (Critical escalation) | Candidate only |
| GF5 | `candidate-gas-fireplace-service-packages-sku-estimate-support-v1.md` | Service packages / SKU | Category logic; estimate wording; safety override | High when safety present | Candidate only |

All packs: **Runtime surface:** `not_runtime_safe`

---

## GF1–GF5 Functional Map

1. **Diagnostics / global safety** — GF1 (`candidate-gas-fireplace-residential-diagnostics-basics-v1.md`)
2. **Gas safety boundary** — GF2 (`candidate-gas-fireplace-safety-boundary-v1.md`)
3. **Visual condition intake** — GF3 (`candidate-gas-fireplace-visual-condition-intake-v1.md`)
4. **Dispatch / booking classification** — GF4 (`candidate-gas-fireplace-dispatch-booking-classification-v1.md`)
5. **Service packages / SKU / estimate support** — GF5 (`candidate-gas-fireplace-service-packages-sku-estimate-support-v1.md`)

**Cross-reference rule:** GF4 for booking; GF2 for gas/CO/flame override; GF3 for photo rules; GF5 for service categories after intake/inspection; GF1 for foundation intake and symptom buckets.

---

## Runtime Status

| Field | Value |
|-------|--------|
| Status | Candidate only |
| Approved knowledge | No |
| Runtime AI knowledge | No |
| Runtime surface (all GF packs) | `not_runtime_safe` |
| Manifest / loader | Not registered — no backend or frontend changes from this index |

Approved legacy and seeded gas-fireplace packs under `docs/field-knowledge/gas-fireplace/` and `trades/gas-fireplace/` remain the only runtime-wired sources until intentional promotion.

---

## Explicit Non-Coverage (GF1–GF5)

The candidate set does **not** authorize or include:

- Pilot relight or ignition coaching
- Gas valve operation steps (on/off/pilot positions)
- Burner, log, orifice, regulator, or pressure adjustment
- Combustion tuning or flame adjustment instructions
- Ignition module reset or bypassing safeties
- Vent disassembly or interior panel removal for customers
- Remote CO diagnosis or “safe CO level” claims
- Code, AHJ, manufacturer, warranty, or insurance guarantees (unless future pack with **Needs source verification**)
- Fixed prices without company pricebook
- Wood-burning or electric fireplace service content
- Chimney sweep, damper, burn-it-out, or nest removal (chimney track)

---

## Recommended Promotion Order (future — not automatic)

| Order | Pack | Rationale |
|-------|------|-----------|
| 1 | GF1 diagnostics | Foundation + safety screen + gas type ID |
| 2 | GF2 safety boundary | Non-negotiable gas/CO stop-use rules |
| 3 | GF4 dispatch booking | Booking quality and priority_safety routing |
| 4 | GF3 visual intake | Photo scripts after safety screen discipline |
| 5 | GF5 service packages | Requires pricebook, SOP, and GF1–GF4 baselines |

Promotion requires: expert review, test pass, manifest entry, loader allowlist update, and surface/role gates — **not** implied by this index.

---

## Follow-On Candidate Layers (not in GF1–GF5)

GF1–GF5 is the **North America general foundation** layer. Additional candidate layers exist as follow-ons — **candidate only, not approved, not runtime**:

| Layer | Set | Index / reference | Status |
|-------|-----|-------------------|--------|
| Alberta install intelligence / AHJ / permit-readiness | GA1–GA5 | [`gas-fireplace-alberta-install-intelligence-candidate-set-index-v1.md`](gas-fireplace-alberta-install-intelligence-candidate-set-index-v1.md) | Candidate only |
| Operations / documentation | GFO1–GFO5 | `candidate-gas-fireplace-approved-conversion-plan-v1.md` (GFO5 planning index) | Candidate only |

**GFO coverage (candidate files exist; not approved):**

- GFO1 — manufacturer / model / manual boundary
- GFO2 — report wording / inspection support
- GFO3 — maintenance / service SOP boundary
- GFO4 — customer portal safe FAQ
- GFO5 — approved-pack conversion planning (planning document only)

**Still deferred (engineering / promotion):** runtime location guard / job-property location resolver; approved conversion; manifest registration; loader allowlist updates; surface/role gates.

Wood-burning fireplace safety remains in the **chimney** candidate track, not this set.

---

## Final Principle

GF1–GF5 is a **structured candidate foundation** for WizField’s professional B2B Field OS **gas-fireplace** trade knowledge. It must **not** be treated as approved runtime knowledge until each pack is reviewed, tested, manifest-registered, and loader-allowlisted intentionally.

**Reminder:** Candidate only. Not approved. Not runtime.
