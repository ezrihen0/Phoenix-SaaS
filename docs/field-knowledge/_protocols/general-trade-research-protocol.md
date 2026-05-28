# WizField Field Knowledge Research Protocol

## Status

This document is a **development and documentation methodology file**.

It is **not** an approved trade knowledge pack.  
It is **not** runtime knowledge for the customer-facing WizField AI.  
Agents must **not** treat this file as a source of trade facts, code requirements, permit requirements, clearance numbers, manufacturer requirements, or legal conclusions.

Its only purpose is to define how agents should research, classify, verify, document, and prepare **candidate knowledge** for WizField Field Copilot.

Installed location:

```text
docs/field-knowledge/_protocols/general-trade-research-protocol.md
```

---

## Purpose

WizField is building a North America-ready Field Knowledge system for a **B2B professional trade CRM / Field OS**.

Field Knowledge is designed primarily for **authenticated professional trade users inside business workspaces**—not for public DIY homeowner instruction or generic consumer how-to guides.

The goal is **not** to create one AI that “knows everything.”

The goal is to build a structured, safe, testable knowledge system:

```text
Trade → Country → Province/State → City/AHJ → Topic → Audience → Runtime Surface → Knowledge Pack → Tests → Versioning
```

Agents must follow this protocol whenever working on trade knowledge.

---

## Professional-first positioning

WizField Field Copilot serves technicians, dispatchers, owners/admins, and—where explicitly allowed—customer-facing surfaces inside a **professional business context**.

**Professional-first does not mean unrestricted.** High-risk topics must still be **role-aware**, **surface-aware**, **source-aware**, and **safety-bounded**.

Every knowledge item must classify:

- **Who** may receive it (intended audience, minimum user role)
- **Where** it may appear (allowed and blocked runtime surfaces)
- **Whether** professional workspace context is required

Some information may be safe for qualified technicians on technician mobile but **unsafe** for dispatchers, customers, public pages, or customer portals—even inside the same organization.

---

## Audience & Runtime Safety classification

Every topic must be classified with the following fields (in addition to trade, region, risk, and source rules).

### Intended audience

One or more of:

- `professional_only`
- `licensed_or_qualified_technician`
- `owner_admin_safe`
- `dispatcher_safe`
- `customer_safe`
- `public_marketing_safe`

### Runtime surface

One or more of:

- `technician_mobile`
- `office_crm`
- `dispatcher_workspace`
- `owner_admin`
- `customer_portal`
- `public_site`
- `not_runtime_safe`

### Additional fields

- `professional_context_required`: `true` / `false`
- `minimum_user_role`: `owner` / `admin` / `technician` / `dispatcher` / `customer` / `public`

Approved packs must declare **allowed** and **blocked** runtime surfaces explicitly. Candidate research must propose both before approval.

---

## Supported Trade Domains

Current WizField trade domains:

- chimney
- gas-fireplace
- garage-door
- hvac
- doors-windows
- locksmith
- roofing

All trades are intended to become North America-ready over time.

That means future support for:

- Canada
  - all provinces and territories
- USA
  - all 50 states

---

## Core Rule

Do **not** write random trade knowledge directly into approved packs.

Every new piece of information must go through this flow:

```text
Research → Classification → Candidate Knowledge → Verification → Tests → Approved Knowledge Pack
```

User feedback, technician feedback, customer corrections, field notes, and AI correction forms are **not automatically approved knowledge**.

They are **candidate updates only**.

---

## Agent Responsibilities

When asked to collect, organize, or prepare trade knowledge, the agent must:

1. Identify the trade.
2. Identify the exact topic.
3. Identify the region or jurisdiction.
4. Classify the type of knowledge.
5. Assign a risk level.
6. Decide whether a source is required.
7. Classify **intended audience**, **runtime surface**, **minimum user role**, and **professional context required**.
8. Separate general field knowledge from jurisdictional, legal, code, AHJ, manufacturer, and compliance knowledge.
9. Produce candidate knowledge only unless explicitly instructed to create an approved pack.
10. Add test questions for any proposed knowledge (per audience/surface where they differ).
11. Avoid unsafe, unsupported, or legally risky claims—and never treat WizField as a public DIY assistant.

---

## Knowledge Type Classification

Every topic must be classified as one or more of the following:

- Field method
- Measurement / estimation
- Diagnostic symptom
- Parts / components
- Customer explanation
- Report wording
- Sales / service opportunity
- Safety boundary
- Permit / code / AHJ / legal claim
- Manufacturer / manual-dependent claim
- Needs more verification

---

## Scope Classification

Every topic must also be classified as one or more of the following:

- Universal trade knowledge
- Region-specific knowledge
- City/AHJ-specific knowledge
- Manufacturer-specific knowledge
- Safety-sensitive knowledge

If the topic touches permits, code, licensing, clearance, regulated work, manufacturer requirements, warranty requirements, or official safety requirements, it must be treated as **source-required**.

---

## Risk Levels

### Low

General customer education, non-technical explanations, basic terminology, basic report wording.

Example:

```text
Explaining that a roofing square equals 100 square feet.
```

### Medium

General field methods, estimation logic, customer-facing service explanations, common symptoms.

Example:

```text
Explaining how roof pitch affects surface area estimation.
```

### High

Safety-sensitive work, regulated trades, potential property damage, gas, electrical, garage springs, roofing access, chimney fire risk, lock/security work.

Example:

```text
Explaining that garage door torsion springs are dangerous and should be handled by trained technicians.
```

### Critical

Legal/code/permit claims, clearance numbers, gas/electrical procedures, unsafe instructions, bypassing locks, working at height, manufacturer-specific installation requirements.

Example:

```text
Claiming that a gas fireplace permit is or is not required in a city.
```

---

## Source Requirement Rules

### No Source Needed

Only for basic general explanations that do not create safety, legal, code, permit, manufacturer, warranty, or compliance risk.

### Source Recommended

For trade best practices, estimating norms, terminology, or general educational guidance.

### Source Required

Source verification is required for:

- Permit requirements
- Code requirements
- AHJ rules
- Licensing requirements
- Clearance numbers
- Manufacturer instructions
- Safety rules
- Warranty requirements
- Official inspection requirements

### Expert Review Required

Expert review is required for:

- High-risk technical procedures
- Legal/compliance interpretation
- Ambiguous jurisdictional claims
- Conflicting sources
- Anything that could create liability if wrong

---

## Hard Rules

The agent must not:

- Invent legal, code, permit, AHJ, manufacturer, or clearance requirements.
- Say a permit is required unless an approved source supports it.
- Say a permit is not required unless an approved source explicitly supports it.
- Give exact clearance numbers without an approved source.
- Provide unsafe step-by-step procedures for gas, electrical, garage springs, roofing, lock bypass, or regulated work.
- Tell unlicensed users to perform regulated work.
- Treat user feedback as verified knowledge.
- Move candidate knowledge into approved packs without explicit approval.
- Create giant knowledge libraries without tests.
- Mix different jurisdictions in one approved pack unless the pack is clearly marked as general and non-jurisdictional.
- Modify loader logic, allowlists, manifests, or runtime AI behavior unless the task explicitly approves it.
- Expose high-risk professional-only guidance on customer portal, public site, or other blocked surfaces.
- Assume “professional-first” allows DIY or homeowner step-by-step instructions without explicit audience approval.

---

## Required Output Format for Research Tasks

When researching any trade topic, the agent must output the following structure:

```md
# Candidate Knowledge Research

## 1. Request Classification

- Trade:
- Topic:
- Country:
- Province/State:
- City/AHJ:
- Knowledge type:
- Scope type:
- Risk level:
- Source requirement:
- Intended audience:
- Runtime surface:
- professional_context_required:
- minimum_user_role:
- Allowed runtime surfaces (proposed):
- Blocked runtime surfaces (proposed):

## 2. Research Plan

- What to search:
- What sources matter:
- What sources should be avoided:
- What questions must be answered before approval:

## 3. Safe Field Explanation

General explanation that is safe, practical, and does not overclaim.

## 4. Candidate Knowledge Pack

- Suggested pack name:
- Suggested file location:
- Version:
- Status: Candidate only

## 5. AI May Say

List safe statements the AI may say if this knowledge is approved.

## 6. AI Must Not Say

List statements the AI must not say.

## 7. Escalation Rule

When the AI should tell the user to verify with a licensed professional, AHJ, manufacturer manual, official source, or expert reviewer.

## 8. Test Questions

Create test questions that must pass before this knowledge becomes approved.

## 9. Next Best Step

State whether to:

- keep as candidate
- source-verify
- expert-review
- reject
- convert into approved pack
```

---

## Candidate Knowledge Location

Candidate knowledge should go under:

```text
docs/field-knowledge/_candidate-updates/
```

Suggested structure:

```text
docs/field-knowledge/_candidate-updates/
  roofing/
  chimney/
  gas-fireplace/
  garage-door/
  hvac/
  doors-windows/
  locksmith/
```

Example:

```text
docs/field-knowledge/_candidate-updates/roofing/candidate-roofing-roof-measuring-basics-v1.md
```

Candidate files must remain clearly marked as:

```text
Status: Candidate only
```

---

## Approved Knowledge Pack Location

Approved trade packs should go under the correct trade folder only after verification and approval.

Example:

```text
docs/field-knowledge/trades/roofing/canada/alberta/roofing-roof-measuring-basics-v1.md
```

Jurisdictional packs should go under:

```text
docs/field-knowledge/jurisdictions/
```

Example:

```text
docs/field-knowledge/jurisdictions/canada/alberta/canada-alberta-roofing-permit-baseline-v1.md
```

---

## Required Fields for Approved Knowledge Packs

Every approved knowledge pack must include:

- knowledge_key
- trade
- country
- province/state
- city/AHJ if applicable
- topic
- version
- source_level
- source_urls if jurisdictional or official
- last_verified
- intended_audience
- allowed_runtime_surfaces
- blocked_runtime_surfaces
- minimum_user_role
- professional_context_required
- AI-safe summary
- what AI may say
- what AI must not say
- escalation rule
- test questions

Approved packs must be testable, conservative, source-aware, **role-aware**, and **surface-aware**. They must declare not only what the AI may say, but also **who may receive it** and **where it may appear**.

---

## Weekly Knowledge Update Workflow

WizField knowledge should be updated through a weekly review cycle.

The weekly process:

1. Collect feedback from:
   - AI correction forms
   - technicians
   - customers
   - field observations
   - internal notes
   - support conversations

2. Convert feedback into candidate updates.

3. Classify each update:
   - trade
   - region
   - topic
   - knowledge type
   - risk level
   - source requirement
   - intended audience
   - runtime surface
   - minimum user role
   - professional context required

4. Verify all source-required claims.

5. Reject unsafe, unsupported, vague, or legally risky claims.

6. Convert approved candidates into knowledge packs only when explicitly approved.

7. Add or update test questions.

8. Update manifest if required.

9. Run loader/selection tests.

10. Run real AI QA prompts.

11. Fix hallucination gaps.

12. Commit cleanly.

---

## Agent Stop Conditions

The agent must stop and ask for approval if:

- The task requires converting candidate knowledge into approved knowledge.
- The topic includes legal, code, permit, AHJ, or manufacturer-specific claims without sources.
- The agent finds conflicting sources.
- The requested change would affect runtime AI behavior.
- The requested change touches loader logic, allowlists, manifests, backend selection logic, or production runtime contracts.
- The task requires deleting, moving, or renaming existing active knowledge packs.
- The task requires broad restructuring of the field knowledge architecture.
- The task would mix candidate knowledge with approved knowledge.

---

## What Good Work Looks Like

Good output is:

- structured
- source-aware
- conservative
- testable
- region-aware
- role-aware and surface-aware
- professional-first (B2B workspace context)
- safe
- easy to convert into a knowledge pack later

Bad output is:

- random notes
- giant unsorted information dumps
- unsupported permit/code claims
- mixed jurisdictions
- unsafe technical instructions
- no tests
- no escalation rules
- no audience or runtime surface classification
- DIY/homeowner instructions presented as universal WizField answers
- no clear candidate/approved distinction
- runtime behavior changes hidden inside documentation work

---

## Garage Door Research Question Gate

Before producing garage-door guidance, the agent must classify the request using this gate. Garage door diagnostics and inspection guidance must **not** be treated as flat North America advice. A baseline tune-up can be general, but real guidance must account for location, climate, regional similarity, door type, symptom, risk level, and audience/surface.

### 1. Segment

- residential
- commercial

### 2. Baseline type

- tune-up baseline
- diagnostics
- opener/sensors
- weather seal
- climate factor
- spring/cable/off-track safety boundary
- report wording
- sales/service opportunity

### 3. Location

- city
- province/state
- country
- unknown

### 4. Climate profile

- cold freeze-thaw
- hot-humid
- coastal salt-air
- dry-dusty
- mixed/unknown

### 5. Regional similarity

Regional patterns may overlap but are **not interchangeable**:

- Calgary / Edmonton / Winnipeg / Minnesota-style cold climate may share patterns.
- Miami / Florida coastal hot-humid / salt-air conditions are **not** the same as Calgary cold climate.
- Alabama / Gulf / Southeast hot-humid conditions may overlap with Florida humidity but are **not** identical to coastal salt-air conditions.

### 6. Door type

- residential sectional
- one-piece
- commercial sectional
- rolling steel
- unknown

### 7. Symptom

- will not open
- will not close
- reverses
- noisy
- frozen/stuck
- crooked
- off track
- opener runs but door does not move
- remote/keypad issue
- weather seal/gap/water/air issue

### 8. Risk gate

- normal tune-up
- spring involved
- cable involved
- off-track/crooked door
- entrapment/safety reverse issue
- injury/property damage
- manufacturer-specific
- jurisdiction/code/AHJ

### 9. Audience/surface

- technician_mobile
- dispatcher_workspace
- owner_admin
- customer_portal safe-only
- public_site safe-only

### 10. Knowledge classification

- universal baseline
- climate-specific
- jurisdiction/code-specific
- manufacturer-specific
- not-runtime-safe

### Gate rules

- If **location** or **climate** is **unknown**, the agent may provide only **universal baseline** guidance and must **avoid climate-specific conclusions**.
- **Climate-specific** guidance must be **separated** from **jurisdiction/code** guidance (do not blend freeze-thaw service notes with permit/AHJ claims in one undifferentiated answer).
- **Spring / cable / off-track / entrapment** topics always trigger the **high-risk gate** (professional-only, source/expert review as required, no DIY or turn-count guidance).

---

## Example — Garage door torsion spring (audience & surface)

Illustrates professional-first, role-aware, surface-aware classification (methodology only—not approved knowledge):

| Field | Value |
|-------|--------|
| Trade | `garage-door` |
| Topic | torsion spring turn reference |
| Risk level | High / Critical |
| Intended audience | `professional_only` |
| Allowed runtime surfaces | `technician_mobile`, `owner_admin` |
| Blocked runtime surfaces | `customer_portal`, `public_site` |
| Minimum user role | `technician` |
| Professional context required | `true` |
| Source requirement | expert review required |

**Safe runtime principle:**

- A verified technician may receive approved reference guidance **only if** an approved pack exists, surfaces allow it, and sources support the claim.
- A customer or public user must **not** receive spring winding instructions or turn counts.
- The AI must **never invent** exact spring-turn values.

---

## Example Task

User request:

```text
Research roofing: how to measure a roof.
Region: North America general.
Goal: candidate knowledge only.
```

Expected agent behavior:

### 1. Classify

- Trade: roofing
- Topic: roof measurement
- Type: measurement/estimation + field method + safety boundary
- Scope: North America general
- Risk: medium/high
- Source requirement: source recommended for estimating norms; source required for official safety rules

### 2. Produce

- Safe field explanation
- Roof measuring concepts
- What AI may say
- What AI must not say
- Escalation rule
- Candidate pack name
- Test questions

### 3. Do Not

- Claim official safety compliance
- Instruct homeowners to climb roofs
- Create an approved pack without approval
- Mix OSHA, Canadian, provincial, and city rules as if they are universal

---

## Agent Task Prompt Template

When assigning a research task to an agent, use this short prompt:

```text
Read and follow:
docs/field-knowledge/_protocols/general-trade-research-protocol.md

This file is a development/documentation methodology file only.
Do not treat it as approved trade knowledge.
Do not create or modify approved knowledge packs unless this task explicitly asks for candidate-to-approved conversion.

Task:
[describe the trade/topic/region here]

Goal:
Prepare candidate knowledge only, using the required protocol output format.

Do not change loader logic, manifests, runtime AI behavior, or existing approved packs unless explicitly instructed.
```

---

## Final Principle

This protocol protects WizField from becoming a messy AI note dump.

The system must grow like this:

```text
Protocol → Research → Candidate → Verification → Tests → Approved Pack → Runtime AI
```

Never like this:

```text
Random Info → Approved AI Answer
```
