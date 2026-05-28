# Garage Door Commercial Candidate Set Index — C1–C10

## Status

**Candidate set index only. Not approved knowledge. Not runtime AI knowledge.**

## Scope

- Trade: garage-door
- Segment: commercial
- Region: North America general
- Residential garage doors: out of scope
- Jurisdiction/code/AHJ: out of scope
- Fire-door certification/compliance: out of scope
- Manufacturer-specific procedures/settings: out of scope unless future approved sources exist
- Repair procedures: out of scope
- Pricing/warranty/stock/availability: out of scope

## Candidate Set Summary Table

| C# | Candidate file | Topic | Primary purpose | Main audience/surface | Risk level | Source requirement | Approval blocker | Runtime readiness |
|---|---|---|---|---|---|---|---|---|
| C1 | `candidate-garage-door-commercial-diagnostics-basics-v1.md` | Commercial diagnostics basics | Safe symptom triage + safety boundary + intake framing | dispatcher_workspace, technician_mobile | Medium (High escalation) | Source recommended | Expert review for high-risk boundary wording | Candidate only |
| C2 | `candidate-garage-door-commercial-door-types-components-baseline-v1.md` | Door types + component terminology baseline | Correct family identification + terminology map + photo intake | dispatcher_workspace, office_crm, technician_mobile | Medium (High escalation) | Source recommended | Source verification for safety-sensitive component claims | Candidate only |
| C3 | `candidate-garage-door-commercial-sectional-door-baseline-v1.md` | Commercial sectional baseline | Sectional-only identification + symptom labels + safe routing | technician_mobile, dispatcher_workspace | Medium (High escalation) | Source recommended | Expert review for high-risk boundaries (cables/springs/off-track) | Candidate only |
| C4 | `candidate-garage-door-commercial-rolling-steel-curtain-baseline-v1.md` | Rolling steel / curtain baseline | Rolling steel-only identification + symptom labels + safe routing | technician_mobile, dispatcher_workspace | Medium (High escalation) | Source recommended | Expert review for off-guide/guides/bottom bar/hoist safety boundary | Candidate only |
| C5 | `candidate-garage-door-commercial-operators-controls-safety-devices-baseline-v1.md` | Operators/controls/safety devices baseline | Intake + documentation + refusal boundaries for programming/bypass | dispatcher_workspace, technician_mobile, owner_admin | Medium (High escalation) | Source recommended; source required for compliance/UL claims | Manufacturer/manual linkage + expert review for monitored devices | Needs manufacturer manual |
| C6 | `candidate-garage-door-commercial-preventive-maintenance-pm-program-baseline-v1.md` | PM program baseline | PM program framing + checklist categories + SOP/CRM fields | owner_admin, office_crm, dispatcher_workspace | Medium | Source recommended | Needs company SOP/PM checklist + frequency policy | Needs company policy |
| C7 | `candidate-garage-door-commercial-climate-environment-modifiers-v1.md` | Climate/environment modifiers | Modifier intake + documentation + PM focus modifiers (no causation claims) | owner_admin, dispatcher_workspace, technician_mobile | Medium (High escalation when unsafe) | Source recommended | Needs policy linkage for PM interval language; expert review for rating claims | Candidate only |
| C8 | `candidate-garage-door-commercial-dispatch-intake-booking-classification-v1.md` | Dispatch intake/booking classification | Dispatcher-first safety screen + priority routing + scripts | dispatcher_workspace, office_crm | Medium (High escalation) | Source recommended | Needs dispatch SOP alignment | Needs company policy |
| C9 | `candidate-garage-door-commercial-service-packages-sku-estimate-support-v1.md` | Service packages/SKU/estimate support | Safe service category map + quote-review workflow prompts | owner_admin, office_crm, dispatcher_workspace | Medium (High escalation) | Source recommended; business systems required for pricing/warranty | Needs pricebook/SOP/warranty linkage | Needs pricebook/SOP |
| C10 | `candidate-garage-door-commercial-report-wording-customer-summary-technician-notes-v1.md` | Report wording + customer summaries | Conservative report structure + limitation + quote-review wording | technician_mobile, office_crm | Medium (High escalation) | Source recommended; policy required for warranty/terms | Needs report template/QA policy linkage | Needs company policy |

Runtime readiness legend (use only):
- Candidate only
- Needs expert review
- Needs source verification
- Needs company policy
- Needs pricebook/SOP
- Needs manufacturer manual
- Not runtime-safe for procedures
- Not runtime-safe for compliance claims

## C1–C10 Functional Map

1. Commercial Diagnosis / Intake Foundation
   - C1
   - C8

2. Door Type / Component Identification
   - C2

3. Door Family Baselines
   - C3 commercial sectional
   - C4 rolling steel / curtain

4. Operators / Controls / Safety Devices
   - C5

5. Preventive Maintenance / Recurring Service
   - C6

6. Climate / Environment Modifiers
   - C7

7. Dispatch / Booking / Priority Routing
   - C8

8. Service Packages / SKU / Estimate Support
   - C9

9. Reports / Customer Summaries / Technician Notes
   - C10

## Knowledge Coverage

This C1–C10 candidate set now covers:

- Commercial diagnostics basics and high-risk safety boundaries (C1)
- Commercial door type and component identification baseline (C2)
- Commercial sectional baseline (C3)
- Commercial rolling steel / curtain baseline (C4)
- Operators, controls, wall stations, and safety devices intake boundaries (C5)
- PM program and recurring maintenance logic (C6)
- Climate/environment modifiers for intake, documentation, and PM focus (C7)
- Commercial dispatch intake + booking classification + priority routing (C8)
- Service package / SKU category mapping and estimate-support wording (C9)
- Report wording / customer summaries / technician notes / limitations / quote-review language (C10)
- Business impact framing: access blocked, cannot secure, bay down, shipping/loading affected
- Safety-first escalation boundaries across intake, dispatch, field notes, and customer wording

## Explicit Non-Coverage

This set does **not** cover:

- Residential garage doors
- Exact repair procedures
- Spring/counterbalance adjustment
- Cable repair
- Curtain reset / guide repair
- Off-track/off-guide re-seating
- Bottom bracket work
- Operator programming
- Wiring/electrical troubleshooting
- Force/limit/travel settings
- Safety-device bypass
- Fire-door inspection/certification
- Code/AHJ/legal compliance
- Manufacturer-specific diagnostics/settings without exact manual
- Exact PM frequency rules
- Pricing
- Warranty policy
- Contract terms
- Inventory / stock promises
- Same-day availability promises
- Approved runtime loading

## Risk Map

| Risk group | Topics/examples |
|---|---|
| Low/Medium topics | commercial door type identification; routine PM consultation with clean safety screen; quote-review wording; report wording; customer-safe education; climate/environment documentation without active failure |
| Medium topics | dispatch classification; operator/control intake without bypass/electrical request; service package suggestions; PM program planning; rolling grille/counter door routing |
| High/Critical topics | stuck open / cannot secure; bay/access blocked; business interruption; jammed / crooked / off-track / off-guide; springs / counterbalance / cables; rolling curtain / guides / bottom bar; chain hoist forced or failed; impact damage from forklift/vehicle/equipment; safety edge/photo-eye/reversing failure or bypass; operator runs but door/curtain does not move; electrical/control issue; fire-rated/high-speed/specialty issue; injury/property damage; compliance/certification request |

## Audience / Surface Map

| Audience / surface | Allowed use (candidate context) | Blocked use | Required escalation |
|---|---|---|---|
| Technician mobile | Terminology, observed vs reported wording, safe classification, handoff structure | Procedural repair steps; programming/wiring; bypass | High-risk mechanical/safety/electrical/fire/specialty/injury/property damage |
| Dispatcher workspace | Intake questions, early safety screen, booking category + priority routing, safe scripts | Diagnosis certainty; “try this fix”; bypass; electrical steps; price/stock promises | Any “yes” safety screen; cannot secure; impact; jammed/crooked/off-track/off-guide |
| Owner/admin | SOP framing, program/category governance, CRM fields/tags, quote-review checkpoints | Warranty/contract claims without policy; compliance claims | Fire/specialty/compliance; pricing/warranty disputes; policy-required items (C6/C9/C10) |
| Office CRM | Consistent classification fields, quote-review workflow, documentation traceability | Procedural content; pricing without pricebook | Owner/admin review required; manufacturer manual required |
| Customer portal safe-only | Safety warnings, photo requests, next steps | Any procedures; bypass; electrical; pricing promises; compliance claims | High-risk conditions; cannot secure; injury/property damage |
| Public site high-level only | General education on identification + safety boundaries | Procedures; pricing; compliance; DIY | Direct to professional service; specialty/fire/compliance questions |
| Not-runtime-safe procedural content | None | All procedures/programming/wiring/bypass/force/limit values | Always |

## Promotion Readiness

None of C1–C10 should be promoted automatically.

Checklist for future promotion to approved packs:

- Owner approval
- Expert review where required
- Source verification
- Runtime surface approval
- Audience approval
- Test question review
- Company SOP linkage
- Dispatch SOP linkage
- PM checklist linkage
- Pricebook linkage for C9
- Warranty/terms linkage for C9/C10
- Manufacturer manual linkage for C5 and model-specific items
- Fire/compliance legal review before any fire/code wording
- Manifest update only after explicit approval
- Loader allowlist only after explicit approval
- Field Copilot QA prompts
- Dispatcher Copilot QA prompts
- Customer-safe wording review

## Recommended Approved-Pack Conversion Order

Suggested safe future order (not automatic):

1. C1 commercial diagnostics basics
2. C2 commercial door types/components
3. C8 commercial dispatch intake
4. C10 report wording/customer summaries
5. C6 commercial PM program baseline
6. C9 service packages/SKU/estimate support
7. C7 climate/environment modifiers
8. C3 commercial sectional baseline
9. C4 rolling steel/curtain baseline
10. C5 operators/controls/safety devices

Why this order:

- Start with low-risk classification and workflow value (intake + safety boundary).
- Move into dispatch and reporting before deeper technical runtime content.
- Delay door-family baselines until source/expert review is planned.
- Keep operators/safety devices late because they are manufacturer-specific and safety-sensitive.
- Fire/high-speed/specialty topics should remain future/expert-only.

## Next Gaps After C1–C10

Future commercial candidates to consider:

- Commercial rolling grille baseline
- Commercial counter door baseline
- High-speed / specialty door routing baseline
- Fire-rated door boundary / routing baseline
- Approved PM checklist / runtime QA
- Commercial photo intake standards
- Commercial door inventory/site survey standard
- Manufacturer/manual index strategy
- Regional/jurisdiction-specific commercial guidance if needed
- Alberta / Calgary / Edmonton commercial climate pack if needed
- USA state-specific commercial packs if needed
- Commercial glossary
- Customer portal safe FAQ
- Approved test suite for runtime QA
- Commercial technician report template
- Commercial dispatch script library

## File Inventory

| C# | File path | Status | Committed (git) |
|---|---|---|---|
| C1 | `docs/field-knowledge/_candidate-updates/garage-door/candidate-garage-door-commercial-diagnostics-basics-v1.md` | present | yes |
| C2 | `docs/field-knowledge/_candidate-updates/garage-door/candidate-garage-door-commercial-door-types-components-baseline-v1.md` | present | yes |
| C3 | `docs/field-knowledge/_candidate-updates/garage-door/candidate-garage-door-commercial-sectional-door-baseline-v1.md` | present | yes |
| C4 | `docs/field-knowledge/_candidate-updates/garage-door/candidate-garage-door-commercial-rolling-steel-curtain-baseline-v1.md` | present | yes |
| C5 | `docs/field-knowledge/_candidate-updates/garage-door/candidate-garage-door-commercial-operators-controls-safety-devices-baseline-v1.md` | present | yes |
| C6 | `docs/field-knowledge/_candidate-updates/garage-door/candidate-garage-door-commercial-preventive-maintenance-pm-program-baseline-v1.md` | present | yes |
| C7 | `docs/field-knowledge/_candidate-updates/garage-door/candidate-garage-door-commercial-climate-environment-modifiers-v1.md` | present | yes |
| C8 | `docs/field-knowledge/_candidate-updates/garage-door/candidate-garage-door-commercial-dispatch-intake-booking-classification-v1.md` | present | yes |
| C9 | `docs/field-knowledge/_candidate-updates/garage-door/candidate-garage-door-commercial-service-packages-sku-estimate-support-v1.md` | present | yes |
| C10 | `docs/field-knowledge/_candidate-updates/garage-door/candidate-garage-door-commercial-report-wording-customer-summary-technician-notes-v1.md` | present | yes |

## Final Principle

This commercial candidate set is a structured knowledge foundation. It must not be treated as approved runtime knowledge until **reviewed**, **promoted**, **tested**, **manifest-registered**, **loader-approved**, and connected to business systems/SOPs where required.

