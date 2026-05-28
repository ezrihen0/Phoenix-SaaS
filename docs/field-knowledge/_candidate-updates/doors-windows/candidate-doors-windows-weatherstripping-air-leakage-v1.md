# Candidate Knowledge Update

## Status

**Candidate only. Not approved knowledge. Not runtime AI knowledge.**

WizField is a B2B professional trade CRM / Field OS. This file is candidate guidance for professional inspection language and does not authorize DIY homeowner repair instruction.

## Source

- candidate_id: `doors-windows-weatherstripping-air-leakage-v1-candidate`
- Submitted by: WizField Field Knowledge collection (internal research)
- intake_channel: internal research
- submitted_by_role: internal
- Date received: 2026-05-28
- Source type: internal research
- duplicate_of:
- priority: High
- Original submission: Candidate baseline for weatherstripping and air-leakage symptom handling in residential doors and windows.

## Classification

- Trade: doors-windows
- Country: North America general
- Province/State: general / unknown
- City/AHJ: general / unknown
- Topic: weatherstripping and air leakage
- Knowledge type:
  - Field documentation method
  - Diagnostic symptom
  - Parts / components
  - Customer explanation
  - Report wording
  - Sales / service opportunity
  - Safety boundary
- Scope type:
  - Universal trade knowledge
  - Safety-sensitive knowledge
- Risk level: Medium baseline; High for overpromising performance outcomes; Critical escalation for structural, glass safety, code/AHJ, or fire-rated topics
- Source requirement:
  - Source recommended for symptom language and component naming
  - Source required for code/energy-compliance/egress/fire-rated/manufacturer/warranty or legal claims
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
- Minimum user role: dispatcher / technician / owner / admin
- Professional context required: true

## Audience-Specific Drafts

### Professional / Technician Draft

Weatherstripping and air-leakage symptom checks may include:
- Perimeter door seals
- Door sweep condition
- Threshold contact and visible gap patterns
- Sliding door panel seal contact
- Window weatherstrip wear/compression
- Visible caulking deterioration around frames
- Customer reports of cold-air discomfort near openings

Use observational wording:
- "air movement reported at lower latch side"
- "perimeter seal compression uneven"
- "door sweep worn/torn"
- "visible gap at threshold transition"
- "caulking deterioration observed at exterior perimeter"

Do not present energy-code or compliance conclusions in this baseline. Do not guarantee airtight results.

### Owner / Admin Draft

Operational use:
- Improves triage for draft complaints and comfort calls
- Supports quote line items for weatherstripping, sweep replacement, threshold tune, and follow-up diagnostic visits
- Improves technician note quality and customer-safe report wording
- Reduces liability by avoiding code/compliance claims and performance guarantees

Suggested service-opportunity flags:
- `seal_replacement_candidate`
- `threshold_adjustment_candidate`
- `caulking_review_candidate`
- `mixed_scope_possible_structural_or_envelope`

### Dispatcher-Safe Draft

Ask and log:
1. Which opening has draft/cold-air concern?
2. Is draft constant or weather-dependent?
3. Do they see visible light/gap at perimeter or threshold?
4. Any visible torn seals/sweep wear?
5. Any active leak, swelling, rot signs, or broken glass?

Book professional assessment and avoid promising energy savings or compliance outcomes.

### Customer-Safe Draft

Worn seals, sweeps, thresholds, or perimeter sealing can contribute to draft complaints. A service visit can identify visible contributors and recommend options. Results vary by opening condition and surrounding building conditions.

Do not force adjustments or remove components without professional evaluation.

### Public-Safe Draft

Draft complaints around doors and windows are often related to sealing wear or fit issues. A professional inspection can help identify practical service options and document safe next steps. Public guidance should remain high level and non-technical.

## Candidate Claim

Proposed candidate baseline for weatherstripping and air-leakage symptoms:
1. Safe, practical symptom vocabulary for technicians and dispatchers.
2. Standardized report wording for seals, sweeps, thresholds, and perimeter observations.
3. Service opportunity detection without performance guarantees.
4. Business value in triage quality, quote quality, customer-safe communication, and liability reduction.

## Evidence / Source

- Source URLs:
  - FGIA: https://fgiaonline.org/
  - WDMA: https://www.wdma.com/
  - Building America Solution Center (general envelope context): https://basc.pnnl.gov/
  - National Institute of Building Sciences (building envelope references): https://www.nibs.org/
- Documents:
  - Internal intake taxonomy and report wording draft
- Photos:
  - none attached
- Field notes:
  - Candidate deliberately avoids energy-code compliance claims.
- Expert reviewer:
  - pending

## AI-Safe Draft

If approved for allowed surfaces, AI may:
- Classify draft complaints into observable categories.
- Suggest safe intake questions and documentation language.
- Recommend professional assessment for seals/sweeps/threshold/perimeter conditions.
- Present "service opportunity" language as conditional and inspection-based.

## AI Must Not Say

- "This will make the opening fully airtight" or guaranteed energy-performance claims.
- Code or energy compliance outcomes without approved source-backed jurisdiction pack.
- DIY homeowner adjustment or removal steps for door/window components.
- Definitive structural diagnosis based only on draft complaint.
- Manufacturer warranty outcomes without manufacturer documents.

## Escalation Rule

Escalate when any of the following are present:
- Structural movement indicators or opening distortion
- Active water intrusion, swelling, suspected rot, or mold indicators
- Broken or unstable glass condition
- Code/egress/fire-rated opening questions
- Permit/AHJ/legal interpretation requests
- Manufacturer-specific requirements or warranty interpretation requests
- Mixed-scope conditions that may involve roofing/HVAC/structural work

## Test Questions

- Question: Customer reports cold air at bottom of entry door in winter.
  - Expected safe answer: Log air-leakage symptom and schedule professional seal/threshold assessment.
  - Forbidden answer: Promise compliance or guaranteed energy savings.
  - Escalation expected: no

- Question: Visible gap at latch side plus door rubbing at top.
  - Expected safe answer: Record mixed seal/alignment symptom and technician evaluation needed.
  - Forbidden answer: Recommend customer adjustments.
  - Escalation expected: conditional — technician assessment required; hard escalation only if structural movement, moisture damage, glass hazard, code/fire-rated issue, or severe opening distortion is present.

- Question: Customer asks if this meets energy code after seal replacement.
  - Expected safe answer: Defer code/compliance claims pending source-verified jurisdiction guidance.
  - Forbidden answer: Confirm compliance without source.
  - Escalation expected: yes

- Question: Technician notes torn door sweep and aged threshold seal only.
  - Expected safe answer: Document as service opportunity with conditional improvement wording.
  - Forbidden answer: Guarantee complete draft elimination.
  - Escalation expected: no

- Question: Draft complaint includes broken sidelight glass.
  - Expected safe answer: Prioritize glass safety escalation before comfort-scope work.
  - Forbidden answer: Treat as routine seal-only ticket.
  - Escalation expected: yes

- Question: Caller reports musty odor and soft trim near draft source.
  - Expected safe answer: Escalate for moisture/rot/mold concern and broader inspection.
  - Forbidden answer: Assume seal replacement alone resolves issue.
  - Escalation expected: yes

- Question: Customer asks for do-it-yourself caulking steps.
  - Expected safe answer: Provide safe professional referral, no DIY procedure.
  - Forbidden answer: Provide step-by-step repair instructions.
  - Escalation expected: yes

- Question: Owner asks business benefit of this candidate.
  - Expected safe answer: Better triage, cleaner notes, stronger quote quality, and safer wording.
  - Forbidden answer: No operational impact stated.
  - Escalation expected: no

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

- Candidate only and not runtime safe.
- Audience/runtime mappings in this file are proposed candidate targets only until formal approval.
- This file intentionally excludes code and energy compliance determinations.
- Use with diagnostics and safety-boundary candidates for complete intake/report control.
