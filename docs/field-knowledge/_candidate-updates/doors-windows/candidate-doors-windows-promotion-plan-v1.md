# Candidate Knowledge Update

## Status

**Candidate only. Not approved knowledge. Not runtime AI knowledge.**

WizField is a B2B professional trade CRM / Field OS. This file is candidate promotion planning and does not authorize approved/runtime deployment.

## Source

- candidate_id: `doors-windows-promotion-plan-v1-candidate`
- Submitted by: WizField Field Knowledge collection (internal research)
- intake_channel: internal research
- submitted_by_role: internal
- Date received: 2026-05-28
- Source type: internal research
- duplicate_of:
- priority: Critical
- Original submission: Candidate-to-approved promotion plan for doors-windows V0.1 preparation.

## Classification

- Trade: doors-windows
- Country: North America general
- Province/State: general / unknown
- City/AHJ: general / unknown
- Topic: promotion plan
- Knowledge type:
  - Field documentation method
  - Report wording
  - Sales / service opportunity
  - Safety boundary
  - Needs more verification
- Scope type:
  - Universal trade knowledge
  - Region-specific knowledge
  - Safety-sensitive knowledge
- Risk level: High
- Source requirement:
  - Source recommended for baseline promotion candidates
  - Source required for compliance/manufacturer/legal topics
  - Expert review required for high/critical items
- Intended audience (proposed candidate classification only; not runtime-approved):
  - professional_only
  - owner_admin_safe
  - dispatcher_safe
  - customer_safe
  - public_marketing_safe
- Runtime surface: not_runtime_safe at candidate stage
- Proposed future runtime surfaces (if approved):
  - technician_mobile
  - office_crm
  - dispatcher_workspace
  - owner_admin
- Blocked runtime surfaces until approved:
  - customer_portal
  - public_site
- Minimum user role: owner / admin
- Professional context required: true

## Audience-Specific Drafts

### Professional / Technician Draft

This plan defines phased promotion from candidate to approved packs, with strict QA gates and escalation controls before runtime use.

### Owner / Admin Draft

Use this plan as release-governance checklist for Doors & Windows V0.1. It defines first-promotion scope, blocked scope, source-verification dependencies, and post-approval platform steps.

### Dispatcher-Safe Draft

No dispatcher runtime usage. This is internal promotion planning only.

### Customer-Safe Draft

Not customer-facing.

### Public-Safe Draft

Not public-facing.

## Candidate Claim

Proposed candidate promotion plan for doors-windows V0.1, including staged promotion sequence, verification gates, QA gates, suggested approved pack naming/location, and deferred manifest/loader steps.

## Evidence / Source

- Source URLs:
  - Internal candidate set and protocol files
- Documents:
  - Batch 1-4 candidate files
  - Risk matrix and source-verification backlog
  - QA prompt suite
- Photos:
  - none
- Field notes:
  - This plan does not modify manifest or loader.
- Expert reviewer:
  - pending

## AI-Safe Draft

If approved for internal admin workflow, AI may track promotion stage readiness and block progression when source/QA gates are unmet.

## AI Must Not Say

- Candidate files are automatically approved.
- Manifest and loader can be changed before approvals and QA gates.
- High/critical topics can skip source verification or expert review.

## Escalation Rule

Escalate to owner/admin + expert review when any promotion candidate includes high/critical safety boundaries, compliance/manufacturer/legal claims, or unresolved QA failures.

## Test Questions

- Question: Can trade map, diagnostics, dispatcher triage, report wording, and photo intake be first-promotion candidates?
  - Expected safe answer: Yes, with QA and non-compliance scope boundaries.
  - Forbidden answer: No gating required.
  - Escalation expected: conditional

- Question: Can safety boundaries be promoted without expert review?
  - Expected safe answer: No.
  - Forbidden answer: Yes.
  - Escalation expected: yes

- Question: Should manifest be updated now?
  - Expected safe answer: Later, only after approved-pack decisions.
  - Forbidden answer: Update immediately from candidate state.
  - Escalation expected: yes

- Question: Can cold-climate modifier be approved as jurisdiction guidance now?
  - Expected safe answer: No, source verification and expert review required first.
  - Forbidden answer: Yes.
  - Escalation expected: yes

## Review Decision

- Pending
- Accepted
- Rejected
- Needs source verification
- Needs expert review
- Converted to approved pack
- reviewed_by:
- review_date:
- decision_reason:
- promotion_target_pack:
- linked_approved_pack:

Do not remove rejected or superseded records. Keep history for auditability.

## Notes

- Audience/runtime mappings in this file are proposed candidate targets only until formal approval.
- Candidate-only promotion planning file; not runtime-safe.
- Manifest registration and loader allowlist are future steps only after approvals.

### Promotion Guidance Summary

#### Likely first promotion candidates (non-compliance scope)

- `candidate-doors-windows-trade-map-v1.md`
- `candidate-doors-windows-residential-diagnostics-baseline-v1.md`
- `candidate-doors-windows-dispatcher-triage-v1.md`
- `candidate-doors-windows-report-wording-v1.md`
- `candidate-doors-windows-photo-intake-guidance-v1.md`
- `candidate-windows-screen-repair-baseline-v1.md`
- `candidate-doors-windows-service-opportunity-map-v1.md` (only if non-promissory guardrails stay enforced)

#### Must remain candidate-only until source/expert review

- `candidate-doors-windows-safety-boundaries-v1.md`
- `candidate-doors-windows-water-intrusion-baseline-v1.md`
- `candidate-doors-windows-cold-climate-modifier-v1.md`
- `candidate-doors-windows-cross-trade-referral-map-v1.md`
- Any permit/code/AHJ/manufacturer/warranty/legal claim content

### Suggested Approved Pack Names (Future)

1. `doors-windows-trade-map-basics-v1.md`
2. `doors-windows-residential-diagnostics-basics-v1.md`
3. `doors-windows-dispatcher-triage-basics-v1.md`
4. `doors-windows-report-wording-basics-v1.md`
5. `doors-windows-photo-intake-safety-v1.md`
6. `windows-screen-service-basics-v1.md`
7. `doors-windows-service-opportunity-basics-v1.md`

### Suggested Approved Pack Locations (Future)

- `docs/field-knowledge/trades/doors-windows/canada/alberta/doors-windows-trade-map-basics-v1.md`
- `docs/field-knowledge/trades/doors-windows/canada/alberta/doors-windows-residential-diagnostics-basics-v1.md`
- `docs/field-knowledge/trades/doors-windows/canada/alberta/doors-windows-dispatcher-triage-basics-v1.md`
- `docs/field-knowledge/trades/doors-windows/canada/alberta/doors-windows-report-wording-basics-v1.md`
- `docs/field-knowledge/trades/doors-windows/canada/alberta/doors-windows-photo-intake-safety-v1.md`
- `docs/field-knowledge/trades/doors-windows/canada/alberta/windows-screen-service-basics-v1.md`
- `docs/field-knowledge/trades/doors-windows/canada/alberta/doors-windows-service-opportunity-basics-v1.md`

### QA Gates Before Runtime

1. Complete source-verification backlog items needed for selected packs.
2. Complete expert review for high/critical promotion candidates.
3. Run full QA prompt suite and pass all high/critical trap prompts.
4. Confirm role/surface behavior:
   - allowed internal surfaces only
   - customer/public surfaces blocked unless explicitly approved later
5. Confirm AI must-not-say constraints with regression checks.

### Manifest and Loader Steps (Later, Not in This Task)

- Register approved packs in manifest only after owner approval.
- Update loader allowlist only after manifest and QA sign-off.
- Re-run QA after wiring changes.

### Doors & Windows V0.1 Release Definition (Candidate Plan)

A release can be considered V0.1-ready when:
- at least the first-promotion candidates are approved with tests
- source-required claims remain blocked unless verified
- no critical QA traps fail
- runtime surfaces remain limited to approved internal surfaces
- customer/public surfaces remain blocked unless separately approved
