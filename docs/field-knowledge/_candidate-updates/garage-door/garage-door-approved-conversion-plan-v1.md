# Garage Door Approved Conversion Plan — Residential + Commercial v1

## Status

**Planning document only. Not approved knowledge. Not runtime AI knowledge.**

## Purpose

This document defines how garage-door **candidate knowledge** may later be converted into **approved packs** safely. It protects WizField from unsafe runtime activation by separating:

- candidate research
- owner review
- expert/source review
- approved-pack creation
- test coverage
- manifest registration
- loader allowlisting
- runtime surface activation

## Current Candidate Foundation

### Residential (R1–R10)

| Candidate ID | Segment | Topic | Risk level | Primary runtime surface candidate | Conversion blocker | Recommended conversion phase |
|---|---|---|---|---|---|---|
| R1 | residential | Diagnostics Basics | Medium (High escalation) | dispatcher_workspace, technician_mobile | source verification + test review | R-A |
| R2 | residential | Tune-Up Baseline | Medium (High escalation) | dispatcher_workspace, office_crm, technician_mobile | source verification + customer-safe wording review | R-A |
| R3 | residential | Climate Factors | Medium | owner_admin, technician_mobile | climate QA (no city-specific overreach) | R-D |
| R4 | residential | Opener / Sensors / Controls | Medium (High escalation) | dispatcher_workspace, technician_mobile | manufacturer manual boundaries + refusal tests | R-D |
| R5 | residential | Weather Seal / Gaps / Threshold | Low/Medium | dispatcher_workspace, office_crm, customer_portal safe-only | source verification | R-A |
| R6 | residential | Noise / Vibration / Slow Operation | Medium (High escalation) | dispatcher_workspace, technician_mobile | no-procedure constraints + tests | R-A |
| R7 | residential | Springs / Cables / Off-Track Safety Boundary | High/Critical boundary | dispatcher_workspace safety flag, technician_mobile | expert review + strict refusal tests | R-E |
| R8 | residential | Report Wording / Estimate Support | Medium | technician_mobile, office_crm | report QA rules + hallucination tests | R-B |
| R9 | residential | Dispatch Intake / Booking Classification | Medium (High escalation) | dispatcher_workspace | dispatch SOP linkage + test suite | R-B |
| R10 | residential | Service Packages / SKU / Upsell Matrix | Medium (High escalation) | owner_admin, office_crm | pricebook + SKU list + warranty policy + no-downgrade tests | R-C |

### Commercial (C1–C10)

| Candidate ID | Segment | Topic | Risk level | Primary runtime surface candidate | Conversion blocker | Recommended conversion phase |
|---|---|---|---|---|---|---|
| C1 | commercial | Commercial Diagnostics Basics | Medium (High escalation) | dispatcher_workspace, technician_mobile | expert review for high-risk boundary wording | C-A |
| C2 | commercial | Door Types / Components | Medium (High escalation) | dispatcher_workspace, office_crm, technician_mobile | source verification for safety-sensitive terminology | C-A |
| C3 | commercial | Commercial Sectional Door Baseline | Medium (High escalation) | technician_mobile, dispatcher_workspace | expert review + no-procedure tests | C-E |
| C4 | commercial | Rolling Steel / Curtain Baseline | Medium (High escalation) | technician_mobile, dispatcher_workspace | expert review + no-procedure tests | C-E |
| C5 | commercial | Operators / Controls / Safety Devices | Medium (High escalation) | dispatcher_workspace, technician_mobile, owner_admin | manufacturer manual strategy + refusal tests | C-F |
| C6 | commercial | PM Program Baseline | Medium | owner_admin, office_crm, dispatcher_workspace | PM checklist + frequency policy | C-C |
| C7 | commercial | Climate / Environment Modifiers | Medium (High escalation when unsafe) | owner_admin, dispatcher_workspace, technician_mobile | no-causation tests + no universal interval tests | C-D |
| C8 | commercial | Dispatch Intake / Booking Classification | Medium (High escalation) | dispatcher_workspace, office_crm | dispatch SOP linkage + no-phone-diagnosis tests | C-B |
| C9 | commercial | Service Packages / SKU / Estimate Support | Medium (High escalation) | owner_admin, office_crm | pricebook + warranty/terms + scheduling/inventory policy | C-C |
| C10 | commercial | Report Wording / Customer Summary / Technician Notes | Medium (High escalation) | technician_mobile, office_crm | report QA rules + hallucination tests + warranty/terms linkage | C-B |

## Non-Negotiable Promotion Rules

1. No candidate may be promoted automatically.
2. Approved pack must be created separately from the candidate file.
3. Candidate file remains historical/auditable.
4. Runtime use requires:
   - approved pack
   - explicit owner approval
   - source/expert review where required
   - test questions
   - manifest registration
   - loader allowlist
   - runtime surface gating
5. High-risk procedural content remains blocked.
6. No repair procedures for springs, cables, counterbalance, off-track/off-guide, curtain reset, bottom bracket work, operator programming, wiring, safety-device bypass.
7. No code/AHJ/fire/legal/compliance claims without approved jurisdiction-specific source and expert/legal review.
8. No pricing/warranty/stock/same-day promises without business systems.
9. Customer/public surfaces receive safe explanation only.
10. Professional surfaces still require safety boundaries and role gating.

## Approved Pack Types

1. **Approved Baseline Pack**
   - Low/medium risk
   - Universal baseline
   - Classification, wording, intake, customer-safe explanation

2. **Approved Dispatcher Pack**
   - Intake questions, booking classification, priority routing
   - Must not diagnose definitively
   - Must include escalation rules

3. **Approved Technician Wording Pack**
   - Report wording, technician notes, limitation wording
   - Must separate reported/observed/confirmed/recommended

4. **Approved Owner/Admin SOP Pack**
   - Governance, QA, CRM fields/tags
   - May reference business policies; must not invent them

5. **Approved PM / Service Opportunity Pack**
   - PM and service category logic
   - Requires company SOP; no guarantee language

6. **Approved High-Risk Safety Boundary Pack**
   - Safety warnings and escalation only
   - Never repair procedures
   - Requires expert review

7. **Not Approved / Future Pack**
   - Manufacturer-specific procedures/settings
   - Fire/code/AHJ
   - Exact pricing/warranty
   - Requires future source/business-system/legal review

## Residential Conversion Plan

### Residential Phase R-A — Lowest-Risk Operational Foundation

Candidates:
- R1 Diagnostics Basics
- R2 Tune-Up Baseline
- R5 Weather Seal / Gaps / Threshold
- R6 Noise / Vibration / Slow Operation

Allowed future runtime surfaces after approval:
- dispatcher_workspace
- office_crm
- technician_mobile
- customer_portal safe-only summaries

Blockers:
- source verification
- owner review
- test questions
- customer-safe wording review

Purpose:
Get useful low-risk operational knowledge into approved form first.

### Residential Phase R-B — Dispatch + Report Workflow

Candidates:
- R9 Dispatch Intake / Booking Classification
- R8 Report Wording / Estimate Support

Allowed surfaces:
- dispatcher_workspace
- office_crm
- technician_mobile
- customer_portal safe-only summary

Blockers:
- dispatch SOP
- report QA rules
- test suite
- role/surface gating

Purpose:
Improve booking quality and report language before deeper technical activation.

### Residential Phase R-C — Business / SKU Layer

Candidates:
- R10 Service Packages / SKU / Upsell Matrix

Allowed surfaces:
- owner_admin
- office_crm
- dispatcher_workspace (limited)
- technician_mobile (quote-review prompts)

Blockers:
- pricebook
- service SKU list
- warranty policy
- company SOP
- no high-risk upsell downgrade tests

Purpose:
Monetization layer only after business systems own pricing/warranty.

### Residential Phase R-D — Climate / Manufacturer-Sensitive Topics

Candidates:
- R3 Climate Factors
- R4 Opener / Sensors / Controls

Blockers:
- source verification
- manufacturer manuals for model-specific content
- expert review for safety-sensitive claims
- climate wording QA

Purpose:
Add modifiers carefully; avoid city-specific or manufacturer-specific overreach.

### Residential Phase R-E — High-Risk Safety Boundary

Candidates:
- R7 Springs / Cables / Off-Track Safety Boundary

Allowed surfaces:
- dispatcher_workspace safety flag
- technician_mobile safety boundary
- customer_portal safe-only warning
- public_site high-level safety warning only

Blockers:
- expert review
- strict no-procedure tests
- refusal tests for turn counts / cable repair / off-track reset
- safety wording review

Purpose:
Approved safety boundary only. Never repair instructions.

## Commercial Conversion Plan

### Commercial Phase C-A — Workflow + Identification Foundation

Candidates:
- C1 Commercial Diagnostics Basics
- C2 Commercial Door Types / Components

Allowed future runtime surfaces after approval:
- dispatcher_workspace
- office_crm
- technician_mobile
- customer_portal safe-only summaries

Blockers:
- source verification
- expert review for high-risk terminology
- test questions
- customer-safe wording review

Purpose:
Commercial calls must first identify door family and risk correctly.

### Commercial Phase C-B — Dispatch + Report Workflow

Candidates:
- C8 Commercial Dispatch Intake / Booking Classification
- C10 Report Wording / Customer Summary / Technician Notes

Allowed surfaces:
- dispatcher_workspace
- office_crm
- technician_mobile
- owner_admin
- customer_portal safe-only summary

Blockers:
- dispatch SOP
- report QA rules
- test suite
- role/surface gating
- no diagnosis-from-phone/photo tests

Purpose:
Improve commercial workflow before technical content goes runtime.

### Commercial Phase C-C — PM + Service Opportunity Layer

Candidates:
- C6 Commercial PM Program Baseline
- C9 Commercial Service Packages / SKU / Estimate Support

Allowed surfaces:
- owner_admin
- office_crm
- dispatcher_workspace (limited)
- technician_mobile (quote-review prompts)

Blockers:
- PM checklist
- PM frequency policy
- pricebook
- SKU list
- warranty/terms policy
- scheduling/availability policy
- no guarantee language tests

Purpose:
Monetization layer: recurring PM, quote review, service categories, without promises.

### Commercial Phase C-D — Climate / Environment Modifiers

Candidates:
- C7 Commercial Climate / Environment Modifiers

Allowed surfaces:
- owner_admin
- office_crm
- dispatcher_workspace
- technician_mobile
- customer_portal safe-only

Blockers:
- source verification
- climate wording QA
- no definitive causation tests
- no universal PM frequency tests

Purpose:
Use environment as modifier, not diagnosis.

### Commercial Phase C-E — Door-Family Technical Baselines

Candidates:
- C3 Commercial Sectional Door Baseline
- C4 Commercial Rolling Steel / Curtain Baseline

Allowed surfaces:
- technician_mobile
- dispatcher_workspace safety/intake
- office_crm documentation
- customer_portal safe-only warnings

Blockers:
- expert review
- source verification
- strict no-procedure tests
- manufacturer/manual review for detailed claims
- high-risk escalation QA

Purpose:
Technical baseline only after workflow and wording controls are established.

### Commercial Phase C-F — Operators / Controls / Safety Devices

Candidates:
- C5 Operators / Controls / Safety Devices

Allowed surfaces:
- dispatcher_workspace intake
- technician_mobile professional boundary
- owner_admin
- customer_portal safe-only warning

Blockers:
- manufacturer manual strategy
- UL/safety-device source review if any compliance language appears
- expert review
- refusal tests for bypass/programming/wiring/force/limit/travel
- no compliance claims

Purpose:
Most sensitive commercial pack; keep late.

## Candidate-to-Approved Pack Mapping Table

Proposed path convention (do not create now):

- `docs/field-knowledge/approved/garage-door/north-america-general/residential/`
- `docs/field-knowledge/approved/garage-door/north-america-general/commercial/`

| Candidate | Proposed approved pack name | Segment | Proposed path | Allowed surfaces | Blocked surfaces/content | Required review | Required tests | Conversion phase |
|---|---|---|---|---|---|---|---|---|
| R1 | `approved-garage-door-residential-diagnostics-baseline-v1.md` | residential | residential | dispatcher_workspace, technician_mobile, office_crm, customer_portal safe-only | procedures, compliance, pricing | owner + source | safety + hallucination + surface | R-A |
| R2 | `approved-garage-door-residential-tune-up-baseline-v1.md` | residential | residential | dispatcher_workspace, technician_mobile, office_crm, customer_portal safe-only | procedures, spring/cable steps | owner + source | refusal + surface | R-A |
| R3 | `approved-garage-door-residential-climate-modifiers-v1.md` | residential | residential | owner_admin, technician_mobile, dispatcher_workspace, customer_portal safe-only | definitive climate causation, universal regional claims, procedures | owner + source + climate wording QA | no-causation + regional/climate tests | R-D |
| R4 | `approved-garage-door-residential-opener-sensors-controls-v1.md` | residential | residential | dispatcher_workspace, technician_mobile, office_crm, customer_portal safe-only | sensor bypass, force/limit settings, programming without manual, electrical procedures | owner + manufacturer/manual boundaries + expert review for safety-sensitive claims | bypass refusal + manufacturer-specific + surface tests | R-D |
| R5 | `approved-garage-door-residential-weather-seal-gaps-threshold-v1.md` | residential | residential | dispatcher_workspace, office_crm, technician_mobile, customer_portal safe-only | waterproof guarantees, opener force/limit adjustments, unsafe threshold advice | owner + source verification | no-guarantee + safety escalation + surface tests | R-A |
| R6 | `approved-garage-door-residential-noise-vibration-slow-operation-v1.md` | residential | residential | dispatcher_workspace, technician_mobile, office_crm, customer_portal safe-only | repair procedures, spring/cable/off-track downgrade, guaranteed noise elimination | owner + source verification | high-risk escalation + no-procedure + no-guarantee tests | R-A |
| R7 | `approved-garage-door-residential-springs-cables-off-track-safety-boundary-v1.md` | residential | residential | dispatcher_workspace safety flag, technician_mobile safety boundary, customer_portal safe-only warning, public_site high-level warning | spring turns, cable repair, off-track reset, bottom bracket work, DIY repair steps | owner + expert review | strict refusal tests for turn counts / cable repair / off-track reset / bottom bracket work | R-E |
| R8 | `approved-garage-door-residential-report-wording-v1.md` | residential | residential | technician_mobile, office_crm | pricing/warranty claims | owner + QA policy | hallucination + wording structure | R-B |
| R9 | `approved-garage-door-residential-dispatch-intake-v1.md` | residential | residential | dispatcher_workspace | procedures, diagnosis certainty | owner + dispatch SOP | safety screen + surface | R-B |
| R10 | `approved-garage-door-residential-service-categories-v1.md` | residential | residential | owner_admin, office_crm | prices/warranty/stock promises | owner + business systems | pricebook/warranty/scheduling tests | R-C |
| C1 | `approved-garage-door-commercial-diagnostics-baseline-v1.md` | commercial | commercial | dispatcher_workspace, technician_mobile, office_crm, customer_portal safe-only | procedures, compliance | owner + source + expert (high-risk) | safety + surface | C-A |
| C2 | `approved-garage-door-commercial-door-types-components-v1.md` | commercial | commercial | dispatcher_workspace, technician_mobile, office_crm | procedures, compliance | owner + source | classification + surface | C-A |
| C8 | `approved-garage-door-commercial-dispatch-intake-v1.md` | commercial | commercial | dispatcher_workspace, office_crm | diagnosis certainty, DIY steps | owner + dispatch SOP | safety screen + no-phone-diagnosis | C-B |
| C10 | `approved-garage-door-commercial-report-wording-v1.md` | commercial | commercial | technician_mobile, office_crm, owner_admin | invented findings, pricing/warranty claims | owner + QA policy | hallucination + wording structure | C-B |
| C6 | `approved-garage-door-commercial-pm-program-baseline-v1.md` | commercial | commercial | owner_admin, office_crm, dispatcher_workspace limited | universal interval claims, guarantee language | owner + SOP | policy + surface | C-C |
| C9 | `approved-garage-door-commercial-service-categories-estimate-support-v1.md` | commercial | commercial | owner_admin, office_crm, dispatcher_workspace limited | pricing/stock/warranty promises | owner + pricebook/terms | business-system tests | C-C |
| C7 | `approved-garage-door-commercial-climate-modifiers-v1.md` | commercial | commercial | owner_admin, dispatcher_workspace, technician_mobile, customer_portal safe-only | causation certainty, universal PM intervals | owner + source | no-causation + surface | C-D |
| C3 | `approved-garage-door-commercial-sectional-baseline-v1.md` | commercial | commercial | technician_mobile | procedures; spring/cable steps | owner + expert | no-procedure tests | C-E |
| C4 | `approved-garage-door-commercial-rolling-steel-baseline-v1.md` | commercial | commercial | technician_mobile | curtain reset/guide repair steps | owner + expert | no-procedure tests | C-E |
| C5 | `approved-garage-door-commercial-operators-controls-safety-baseline-v1.md` | commercial | commercial | technician_mobile, dispatcher_workspace intake | programming/wiring/bypass/compliance claims | owner + expert + manuals | bypass/programming refusal | C-F |

## Runtime Surface Matrix

Legend: **allowed after approval** / **safe-only** / **blocked** / **owner/admin only** / **expert/manual required**

| Row | dispatcher_workspace | technician_mobile | office_crm | owner_admin | customer_portal | public_site |
|---|---|---|---|---|---|---|
| Residential low-risk baseline | allowed after approval | allowed after approval | allowed after approval | allowed after approval | safe-only | high-level only |
| Residential dispatch | allowed after approval | safe-only handoff | allowed after approval | allowed after approval | safe-only | blocked |
| Residential report wording | safe-only | allowed after approval | allowed after approval | allowed after approval | safe-only | blocked |
| Residential SKU/service opportunity | limited | limited | allowed after approval | owner/admin only | safe-only | blocked |
| Residential high-risk safety boundary | safe-only | allowed after approval (no procedures) | allowed after approval | allowed after approval | safe-only warnings | high-level only |
| Commercial low-risk baseline | allowed after approval | allowed after approval | allowed after approval | allowed after approval | safe-only | high-level only |
| Commercial dispatch | allowed after approval | safe-only handoff | allowed after approval | allowed after approval | safe-only | blocked |
| Commercial report wording | safe-only | allowed after approval | allowed after approval | allowed after approval | safe-only | blocked |
| Commercial PM/SKU | limited | quote-review prompts only | allowed after approval | owner/admin only | safe-only | blocked |
| Commercial door-family baselines | safety/intake only | allowed after approval (no procedures) | allowed after approval | allowed after approval | safe-only warnings | blocked |
| Commercial operator/safety devices | intake only | expert/manual required | allowed after approval | owner/admin only | safe-only warnings | blocked |

## Required Test Suite Before Promotion

1. **Safety refusal tests**
   - spring turns
   - cable repair
   - curtain reset
   - off-track/off-guide reset
   - bottom bracket work
   - force/limit/travel adjustment
   - safety-device bypass
   - electrical/wiring
   - fire compliance

2. **Surface tests**
   - customer portal receives safe-only wording
   - public site receives high-level only
   - dispatcher cannot receive repair steps
   - technician receives professional wording but no hazardous procedures

3. **Role tests**
   - dispatcher vs technician vs owner/admin vs customer
   - professional context required
   - high-risk content blocks customer/public

4. **Hallucination tests**
   - no invented measurements
   - no fake photos
   - no nameplate invention
   - no diagnosis from phone/photo
   - no price/warranty/stock claims

5. **Business-system tests**
   - pricebook required
   - warranty policy required
   - scheduling/availability required
   - inventory required
   - PM frequency policy required

6. **Regional/climate tests**
   - Calgary cold not treated as Miami coastal
   - salt/de-icer not treated as cosmetic automatically
   - no universal climate PM interval
   - no definitive climate causation

7. **Commercial-specific tests**
   - business cannot secure opening
   - bay blocked
   - rolling steel vs sectional distinction
   - operator issue after mechanical screen
   - safety edge bypass refusal
   - fire/specialty routing

## Approval Checklist Per Pack

Each approved pack must include:

- approved_pack_id
- source candidate(s)
- approved_by
- review_date
- source verification summary
- expert review summary when applicable
- allowed_runtime_surfaces
- blocked_runtime_surfaces
- minimum_user_role
- professional_context_required
- AI may say
- AI must not say
- escalation rule
- test questions
- promotion decision
- rollback instruction

## Manifest / Loader Strategy

No manifest or loader changes happen in this plan.

Future manifest changes may only happen after:

1. approved pack exists
2. tests pass
3. owner approves runtime activation
4. surface/role gates are defined
5. rollback plan exists

Loader allowlist must never include `_candidate-updates`.

## Rollback Strategy

- Approved pack can be disabled from manifest/loader.
- Candidate records remain for audit.
- Runtime pack removal must not delete candidate history.
- If a safety issue is found: disable runtime pack first, then review sources.

## Recommended Next Action

Create the first approved-pack draft for:

- Residential R1 Diagnostics Basics **OR**
- Commercial C1 Diagnostics Basics

Recommendation: start with **one** pack only (not both at once).

Preferred starting point:

- Residential R1 first if the product is closer to residential garage-door users.
- Commercial C1 first if WizField wants commercial dispatch workflow first.

Do not perform the conversion now.

## Final Principle

Candidate knowledge is not product knowledge. Approved knowledge is not runtime knowledge until manifest-registered, loader-approved, tested, and surface-gated. High-risk trade knowledge must remain safety-boundary first, never procedure-first.

