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

WizField is building a North America-ready Field Knowledge system.

The goal is **not** to create one AI that “knows everything.”

The goal is to build a structured, safe, testable knowledge system:

```text
Trade → Country → Province/State → City/AHJ → Topic → Knowledge Pack → Tests → Versioning
```

Agents must follow this protocol whenever working on trade knowledge.

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
7. Separate general field knowledge from jurisdictional, legal, code, AHJ, manufacturer, and compliance knowledge.
8. Produce candidate knowledge only unless explicitly instructed to create an approved pack.
9. Add test questions for any proposed knowledge.
10. Avoid unsafe, unsupported, or legally risky claims.

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
- AI-safe summary
- what AI may say
- what AI must not say
- escalation rule
- test questions

Approved packs must be testable, conservative, and source-aware.

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
- no clear candidate/approved distinction
- runtime behavior changes hidden inside documentation work

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
