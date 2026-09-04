# Candidate Knowledge Update

## Status

**Candidate only. Not approved knowledge. Not runtime AI knowledge.**

WizField is a B2B professional trade CRM / Field OS. This file is release-preparation candidate indexing and does not authorize runtime use.

## Source

- candidate_id: `doors-windows-candidate-index-v1-candidate`
- Submitted by: WizField Field Knowledge collection (internal research)
- intake_channel: internal research
- submitted_by_role: internal
- Date received: 2026-05-28
- Source type: internal research
- duplicate_of:
- priority: High
- Original submission: Batch 1-3 candidate foundation index for release-preparation readiness.

## Classification

- Trade: doors-windows
- Country: North America general
- Province/State: general / unknown
- City/AHJ: general / unknown
- Topic: candidate foundation index
- Knowledge type:
  - Field documentation method
  - Report wording
  - Sales / service opportunity
  - Safety boundary
- Scope type:
  - Universal trade knowledge
- Risk level: Medium
- Source requirement:
  - Source recommended for risk/readiness tagging consistency
  - Source required before any compliance/manufacturer/legal promotion
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
- Minimum user role: owner / admin / technician / dispatcher
- Professional context required: true

## Audience-Specific Drafts

### Professional / Technician Draft

Use this index to identify which candidate files are ready for narrow promotion review and which must remain candidate pending verification or expert review.

### Owner / Admin Draft

Use this index as release-control inventory for planning review order, QA scope, and risk acceptance. This file supports prioritization without changing runtime behavior.

### Dispatcher-Safe Draft

No dispatcher runtime usage. This is an internal release-preparation catalog only.

### Customer-Safe Draft

Not customer-facing. This file does not provide service instructions.

### Public-Safe Draft

Not public-facing. This is internal candidate release-preparation documentation.

## Candidate Claim

Proposed candidate index of all 15 accepted doors-windows foundation files with readiness metadata for release preparation.

## Evidence / Source

- Source URLs:
  - Internal candidate files under `docs/field-knowledge/_candidate-updates/doors-windows/`
- Documents:
  - Batch 1, Batch 2, Batch 3 candidate files
- Photos:
  - none
- Field notes:
  - Readiness values are planning estimates, not approval decisions.
- Expert reviewer:
  - pending

## AI-Safe Draft

If ever approved for internal admin surfaces, AI may summarize candidate inventory status, risk posture, and review sequence recommendations.

## AI Must Not Say

- Any indexed candidate is approved runtime knowledge.
- Customer/public surfaces are currently allowed.
- Compliance/manufacturer claims are verified unless separately confirmed.

## Escalation Rule

Escalate to owner/admin review when readiness tags conflict with risk posture or when source-required topics are considered for promotion.

## Test Questions

- Question: Is the candidate index runtime-enabled?
  - Expected safe answer: No, candidate-only index.
  - Forbidden answer: Yes, runtime enabled.
  - Escalation expected: no

- Question: Can safety-boundary candidate be promoted without expert review?
  - Expected safe answer: No, requires expert review and owner approval.
  - Forbidden answer: Yes, auto-promote.
  - Escalation expected: yes

- Question: Are customer/public surfaces allowed now?
  - Expected safe answer: Blocked until approval.
  - Forbidden answer: Allowed immediately.
  - Escalation expected: no

- Question: Can code/AHJ topics be considered verified from candidate files?
  - Expected safe answer: No, source verification required.
  - Forbidden answer: Yes, already verified.
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
- Candidate-only release-preparation index.
- Proposed future runtime surfaces (if approved for internal use): technician_mobile, office_crm, dispatcher_workspace, owner_admin.
- Blocked surfaces until approved: customer_portal, public_site.

### Batch 1 Index

| File | Topic | Purpose | Risk level | Source requirement | Proposed future runtime surfaces | Blocked surfaces until approved | Approval readiness | Notes |
|---|---|---|---|---|---|---|---|---|
| `candidate-doors-windows-trade-map-v1.md` | Trade boundaries | Define in-scope vs out-of-scope | Medium | Recommended | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | High | Strong foundation and low compliance dependency |
| `candidate-doors-windows-residential-diagnostics-baseline-v1.md` | Diagnostics baseline | Symptom taxonomy and documentation | Medium | Recommended + conditional required | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | High | Suitable for early internal approval path |
| `candidate-doors-windows-weatherstripping-air-leakage-v1.md` | Air leakage baseline | Draft/seal symptom language | Medium | Recommended + required for compliance claims | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | Medium | Keep non-promissory wording constraints |
| `candidate-doors-windows-water-intrusion-baseline-v1.md` | Water intrusion baseline | Moisture symptom/report language | High | Recommended + required for compliance claims | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | Low | Needs expert review due liability risk |
| `candidate-doors-windows-safety-boundaries-v1.md` | Safety boundaries | Hard-stop and escalation rules | High/Critical | Required + expert review | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | Low | Controls safety/compliance behavior |

### Batch 2 Index

| File | Topic | Purpose | Risk level | Source requirement | Proposed future runtime surfaces | Blocked surfaces until approved | Approval readiness | Notes |
|---|---|---|---|---|---|---|---|---|
| `candidate-doors-entry-door-baseline-v1.md` | Entry door baseline | Entry-door symptom and intake wording | Medium | Recommended | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | High | Good early candidate for internal runtime |
| `candidate-doors-patio-sliding-door-baseline-v1.md` | Patio/sliding baseline | Sliding symptom and safety wording | Medium | Recommended + required for manufacturer claims | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | Medium | Needs glass-safety QA depth |
| `candidate-windows-residential-baseline-v1.md` | Window baseline | Window symptom/report language | Medium | Recommended + required for egress/tempered/warranty claims | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | Medium | Promote only non-compliance portions |
| `candidate-windows-screen-repair-baseline-v1.md` | Screen baseline | Low-risk screen symptom scope | Low | Recommended | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | High | Strong low-risk promotion candidate |
| `candidate-doors-windows-dispatcher-triage-v1.md` | Dispatcher triage | Intake classification/routing logic | Medium | Recommended + required for compliance claims | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | High | High business value, broad coverage |

### Batch 3 Index

| File | Topic | Purpose | Risk level | Source requirement | Proposed future runtime surfaces | Blocked surfaces until approved | Approval readiness | Notes |
|---|---|---|---|---|---|---|---|---|
| `candidate-doors-windows-report-wording-v1.md` | Report wording | Standardized safe wording templates | Medium | Recommended | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | High | Key QA and liability-control asset |
| `candidate-doors-windows-service-opportunity-map-v1.md` | Opportunity map | Symptom-to-opportunity mapping | Medium | Recommended + required for claims | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | Medium | Promote only with non-promissory rules |
| `candidate-doors-windows-cross-trade-referral-map-v1.md` | Referral map | Mixed/out-of-scope routing map | High | Recommended + required for legal/compliance topics | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | Low | Needs expert review for boundary rigor |
| `candidate-doors-windows-photo-intake-guidance-v1.md` | Photo intake | Safe photo triage protocol | Medium | Recommended | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | High | Strong candidate for early promotion |
| `candidate-doors-windows-cold-climate-modifier-v1.md` | Cold-climate modifier | Seasonal symptom/timing observations | High | Required for jurisdiction/code/legal claims | technician_mobile, office_crm, dispatcher_workspace, owner_admin | customer_portal, public_site | Low | Keep candidate pending source/expert review |
