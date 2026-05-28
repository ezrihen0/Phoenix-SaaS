# Field Knowledge — North America Architecture

## Purpose

This directory holds the **North America-ready approved field knowledge architecture** for WizField Field Copilot. Knowledge packs here are curated, reviewed content—not ad-hoc notes or model training data.

WizField is a **B2B professional trade CRM / Field OS**. Field Knowledge is designed primarily for **authenticated professional trade users inside business workspaces**, not for public DIY homeowner instruction. **Professional-first does not mean unrestricted:** high-risk topics must still be role-aware, surface-aware, source-aware, and safety-bounded.

### Knowledge dimensions

Every knowledge item is classified and reviewed across these dimensions:

| Dimension | Examples |
|-----------|----------|
| **Trade** | gas-fireplace, garage-door, hvac, … |
| **Region** | country, province/state, city/AHJ |
| **Topic** | permits, diagnostics, measurement, safety boundary |
| **Risk** | Low → Critical |
| **Source requirement** | none / recommended / required / expert review |
| **Audience** | professional_only, technician, dispatcher_safe, customer_safe, … |
| **Runtime surface** | technician_mobile, office_crm, customer_portal, public_site, … |
| **Tests** | question, expected safe answer, forbidden answer, escalation |
| **Approval status** | candidate → reviewed → approved (manifest + allowlist when intentional) |

**Core rule:** Professional workspace users may receive more technical answers than public or customer users, but **only** from approved, source-aware knowledge packs and **only** on allowed runtime surfaces declared in each pack.

**Example (methodology only):** Garage-door torsion spring turn reference is typically `professional_only`, allowed on `technician_mobile` / `owner_admin`, blocked on `customer_portal` / `public_site`, minimum role `technician`, expert review required—the AI must never invent exact spring-turn values. See [`_protocols/general-trade-research-protocol.md`](_protocols/general-trade-research-protocol.md).

## Structure

| Branch | Role |
|--------|------|
| `jurisdictions/` | Location-specific guidance: legal references, codes, permits, AHJ (authority having jurisdiction) context |
| `trades/` | Trade-specific field knowledge: service logic, diagnostics, sales support, report wording |
| `manifest/` | Machine-readable manifest of approved packs, scope, and loader rules (Phase 2+ wiring) |
| `_protocols/` | **Methodology only** — research protocol + candidate/approved templates (not approved packs, not runtime AI) |
| `_candidate-updates/` | Unapproved field feedback, AI correction forms, technician notes, and proposed knowledge updates awaiting review |
| `runtime/` | **Planning only** — runtime safety and AI Voice booking plans (not approved packs, not loader input) |

## Research protocol (methodology only)

For future trade-knowledge research and candidate pack preparation, agents must follow:

[`_protocols/general-trade-research-protocol.md`](_protocols/general-trade-research-protocol.md)

That document is **not** approved trade knowledge and must **not** be loaded as runtime Field Copilot knowledge. It defines the workflow:

`Research → Classification → Candidate Knowledge → Verification → Tests → Approved Knowledge Pack`

User feedback and field notes are candidate updates only until explicitly approved.

Geographic folders use stable slugs (e.g. `canada/alberta`, `usa/colorado`). Trade folders mirror the same Canada province/territory and USA state layout under each trade and country.

### Future trade domains (skeleton only)

The Field Knowledge tree is **North America-ready** across multiple trade domains.

- **Active seeded trade**: `gas-fireplace` (Alberta V1 packs are approved and loader-wired; see “Current phase” below)
- **Skeleton / pending expansion**: trade folders exist, but content expansion requires the research protocol + verification + tests + approval (unless approved packs already exist)

- `chimney`
- `garage-door`
- `hvac`
- `doors-windows`
- `locksmith`
- `roofing`

### Legacy V1 packs

Approved gas-fireplace topic packs from early Field Copilot V1 remain at `gas-fireplace/` (flat layout). They stay on the backend allowlist until a future migration moves them under `trades/gas-fireplace/` and updates loader paths explicitly.

## Current phase

**Phase 1 (complete):** North America folder skeleton with `.gitkeep` placeholders.

**Phase 2 — Alberta Gas Fireplace V1 (seeded):** Four approved packs added under `trades/gas-fireplace/canada/alberta/` and `jurisdictions/canada/alberta/`. Registered in `manifest/field-knowledge-manifest.v1.json` with `status: "alberta_v1_seeded"`.

**Phase 3 — Alberta V1 loader wiring (completed technically):** The backend loader now selects Alberta gas-fireplace packs by context:

- **Alberta general** → Alberta basics + Alberta gas jurisdiction baseline
- **Calgary** → Alberta basics + Alberta gas + Calgary permit guidance
- **Edmonton** → Alberta basics + Alberta gas + Edmonton permit guidance
- **Unknown USA / unsupported jurisdiction** → **no verified jurisdiction guidance**

| Pack | Path |
|------|------|
| Alberta gas fireplace field basics | `trades/gas-fireplace/canada/alberta/canada-alberta-gas-fireplace-basics-v1.md` |
| Alberta gas jurisdiction baseline | `jurisdictions/canada/alberta/canada-alberta-gas-v1.md` |
| Calgary gas fireplace permits | `jurisdictions/canada/alberta/canada-alberta-calgary-gas-fireplace-permits-v1.md` |
| Edmonton gas fireplace permits | `jurisdictions/canada/alberta/canada-alberta-edmonton-gas-fireplace-permits-v1.md` |

Even with loader wiring complete, all future pack expansion still requires **manifest discipline**, **allowlist discipline**, and **real Field Copilot QA** to prevent hallucination gaps.

**Runtime safety + AI Voice (planning):** See [`runtime/field-copilot-runtime-safety-and-voice-plan-v1.md`](runtime/field-copilot-runtime-safety-and-voice-plan-v1.md) and the 320-prompt QA appendix [`runtime/field-copilot-runtime-safety-and-voice-qa-appendix-v1.md`](runtime/field-copilot-runtime-safety-and-voice-qa-appendix-v1.md). Planning docs only — not loaded at runtime.

**Next:** Continue real Field Copilot QA, fix hallucination gaps, then expand one trade/topic at a time through the research protocol.

## Expansion rule

No knowledge pack may be added without:

- Owner approval
- Source review (when jurisdictional)
- `last_verified` date
- Test questions
- **AI may say** / **must not say** sections
- Escalation rule

New packs must be registered in `manifest/field-knowledge-manifest.v1.json`, added to allowlisted loader paths as applicable, and validated via tests + Field Copilot QA.

## Safety rule

When jurisdiction or location-specific guidance is requested but no verified pack exists for that location, Field Copilot must respond:

> I do not have verified jurisdiction guidance for that location yet.

Do not invent codes, permits, or legal requirements.

## Do not put here

- Secrets, API keys, or credentials
- Customer data or PII
- Application source code
- Raw logs, dumps, or unprocessed field uploads
- Unverified legal or code claims

## Phase 2 — Alberta V1 (completed content)

Seeded packs (see table above). Legacy flat packs at `gas-fireplace/` remain unchanged until explicit migration.

Future Alberta expansions (not yet in manifest) may include additional topics or municipalities—follow the expansion rule below.

## Weekly Knowledge Review Workflow

This workflow exists to keep WizField scalable under high-volume feedback while preventing a messy knowledge dump.

1. Collect inputs from:
   - AI correction forms
   - technician notes
   - customer feedback
   - field observations
   - support notes
   - internal research notes

2. Convert **all** incoming feedback into **candidate updates only** under `_candidate-updates/` (never directly into approved packs).

3. Classify each candidate update:
   - trade
   - country
   - province/state
   - city/AHJ
   - topic
   - risk level
   - source requirement
   - intended audience
   - runtime surface
   - minimum user role
   - professional context required

4. Verify any **source-required** claims (especially permits/code/AHJ/manufacturer/safety).

5. Reject or defer:
   - unsafe proposals
   - unsupported claims
   - conflicting or ambiguous claims

6. Promote only reviewed/approved candidates into **approved knowledge packs** (intentional conversion step).

7. Add or update test questions for each approved pack (and for any risky claims).

8. Update the manifest and loader allowlist only when **approved packs are intentionally added**.

9. Run Field Copilot QA prompts to detect hallucination gaps and unsafe over-claims.

10. Commit cleanly (docs updates, pack updates, and loader/manifest updates should be deliberate and reviewable).
