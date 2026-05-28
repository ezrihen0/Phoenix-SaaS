# Field Knowledge — North America Architecture

## Purpose

This directory holds the **North America-ready approved field knowledge architecture** for WizField Field Copilot. Knowledge packs here are curated, reviewed content—not ad-hoc notes or model training data.

## Structure

| Branch | Role |
|--------|------|
| `jurisdictions/` | Location-specific guidance: legal references, codes, permits, AHJ (authority having jurisdiction) context |
| `trades/` | Trade-specific field knowledge: service logic, diagnostics, sales support, report wording |
| `manifest/` | Machine-readable manifest of approved packs, scope, and loader rules (Phase 2+ wiring) |

Geographic folders use stable slugs (e.g. `canada/alberta`, `usa/colorado`). Trade folders mirror the same Canada province/territory and USA state layout under each trade and country.

### Legacy V1 packs

Approved gas-fireplace topic packs from early Field Copilot V1 remain at `gas-fireplace/` (flat layout). They stay on the backend allowlist until a future migration moves them under `trades/gas-fireplace/` and updates loader paths explicitly.

## Current phase

**Phase 1 (complete):** North America folder skeleton with `.gitkeep` placeholders.

**Phase 2 — Alberta V1 (seeded):** Four approved packs added under `trades/gas-fireplace/canada/alberta/` and `jurisdictions/canada/alberta/`. Registered in `manifest/field-knowledge-manifest.v1.json` with `status: "alberta_v1_seeded"`. Backend loader wiring is **not** active yet—manifest is the approval record.

| Pack | Path |
|------|------|
| Alberta gas fireplace field basics | `trades/gas-fireplace/canada/alberta/canada-alberta-gas-fireplace-basics-v1.md` |
| Alberta gas jurisdiction baseline | `jurisdictions/canada/alberta/canada-alberta-gas-v1.md` |
| Calgary gas fireplace permits | `jurisdictions/canada/alberta/canada-alberta-calgary-gas-fireplace-permits-v1.md` |
| Edmonton gas fireplace permits | `jurisdictions/canada/alberta/canada-alberta-edmonton-gas-fireplace-permits-v1.md` |

**Next:** Wire allowlisted loader paths and Field Copilot routing (`next_phase` in manifest).

## Expansion rule

No knowledge pack may be added without:

- Owner approval
- Source review (when jurisdictional)
- `last_verified` date
- Test questions
- **AI may say** / **must not say** sections
- Escalation rule

New packs must be registered in `manifest/field-knowledge-manifest.v1.json` when the loader is wired.

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
