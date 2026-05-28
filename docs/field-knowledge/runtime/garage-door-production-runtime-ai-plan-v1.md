# Garage Door Production Runtime AI Plan — v1

## 1) Status

**Planning document only.** Not approved field knowledge. Not runtime AI knowledge.

This document describes the exact path from:

**candidates → approved packs → manifest registration → loader/selector gating → runtime surface + role gating → tests → audit logs → rollback**

Core safety rule (non-negotiable):

> **The loader must never load `docs/field-knowledge/_candidate-updates/` content.**

## 2) Launch Target

**Controlled internal / limited pilot launch** of Garage Door Field Copilot runtime.

- Not a public launch.
- Customer/public surfaces remain safe-only and must not receive professional/mechanical guidance.

## 3) Current State

Garage door candidate foundation (already present):

- **Residential** R1–R10 candidate set + index
- **Commercial** C1–C10 candidate set + index
- **Garage Door Approved Conversion Plan v1** (promotion rules + recommended order)

Runtime state (audit summary):

- Manifest exists: `docs/field-knowledge/manifest/field-knowledge-manifest.v1.json`
- Runtime allowlist enforcement is hard-coded in `backend/src/ai/field-knowledge/field-knowledge.constants.ts` (`FIELD_KNOWLEDGE_ALLOWLISTED_PATHS`)
- Approved domains list is currently **gas-fireplace only** (`FIELD_KNOWLEDGE_APPROVED_DOMAINS` contains only `gas_fireplace`)
- No garage-door approved packs were found under `docs/field-knowledge/approved/garage-door/` at audit time
- No existing `docs/field-knowledge/runtime/` folder existed at audit time (this plan creates the planning doc only)

Implication:

- Garage door candidates are **not runtime activated** today.
- Garage door runtime activation requires deliberate changes to approved packs, manifest, loader allowlist/selection logic, and safety gating (described below, not implemented here).

## 4) Production Readiness Definition

Garage door runtime is “production ready” only when all are true:

- **Approved pack exists** for the initial scope (not a candidate file).
- **Pack metadata** includes: trade/segment/region/topic/version/risk/audience/surface/role gates, last_verified, tests_reference, rollback_key.
- **Test suite exists** for the pack and for refusal boundaries.
- **Manifest includes** the approved pack path(s) only.
- **Loader allowlist** permits only approved pack paths (never candidate/protocol/index/planning).
- **Selector/gating** correctly enforces:
  - runtime surface allow/deny
  - minimum role
  - professional_context_required
  - “no verified match” safe fallback
- **Refusal/escalation** triggers for high-risk requests work.
- **Audit logs** record selected pack IDs, gating decisions, and refusals.
- **Rollback/kill switch** can disable garage-door packs by trade/surface/pack key quickly.

## 5) Phase 0 — Runtime Scope Lock

Start small with **one** approved pack.

Preferred first pack:

- Residential: **R1 (Diagnostics Basics)** → “approved diagnostics baseline” pack

Alternative first pack (if the pilot is commercial dispatch):

- Commercial: **C1 (Commercial Diagnostics Basics)** → “approved commercial diagnostics baseline” pack

Explicit deferrals (do not activate early):

- **R7** (springs/cables/off-track safety boundary): high/critical; safety-boundary-only pack later, expert review required
- **C5** (operators/controls/safety devices): manufacturer-sensitive + safety-sensitive; requires manual strategy and refusal tests

Phase 0 deliverables:

- selected initial pack key (one)
- allowed runtime surfaces (initially: `technician_mobile`, `dispatcher_workspace`, `office_crm` as appropriate)
- blocked runtime surfaces (initially: always include `public_site`; typically include `customer_portal` except safe-only summary mode)
- minimum role (initially: `technician` or `dispatcher` depending on pack)
- risk level & escalation boundary summary

## 6) Phase 1 — Approved Pack Draft Creation

Create an approved pack draft (separate from candidate).

Recommended initial approved-pack path:

- `docs/field-knowledge/approved/garage-door/north-america-general/residential/approved-garage-door-residential-diagnostics-baseline-v1.md`

Required approved-pack metadata (must be present in pack header/metadata section):

- `approved_pack_id`
- `source_candidate_path`
- `trade`: `garage-door`
- `segment`: `residential` or `commercial`
- `region`: `north-america-general` (for baseline)
- `topic`: `diagnostics_basics` (or equivalent stable slug)
- `version`
- `status`: `approved_draft` → `approved` → `runtime_active`
- `source_level`: recommended/required/expert_review_required
- `last_verified`
- `intended_audience`
- `allowed_runtime_surfaces`
- `blocked_runtime_surfaces`
- `minimum_user_role`
- `professional_context_required`
- `risk_level`
- `tests_reference` (path to a test spec file or suite)
- `rollback_key`

Hard exclusions (must remain excluded):

- repair procedures (especially spring/cable/counterbalance/off-track/off-guide/curtain reset)
- operator programming and wiring/electrical troubleshooting
- force/limit/travel values
- safety-device bypass
- pricing, warranty, inventory/stock promises, same-day promises
- code/AHJ/licensing/compliance claims
- manufacturer-specific instructions/settings without authoritative sources and explicit approval

## 7) Phase 2 — Manifest Registration Plan

Extend the manifest to reference **approved garage-door packs only**.

Manifest file:

- `docs/field-knowledge/manifest/field-knowledge-manifest.v1.json`

Each manifest entry for garage-door packs must include at minimum:

- `knowledge_key`
- `path` (approved pack path only)
- `trade`, `segment`, `region`, `topic`, `version`
- `status` (draft/approved/runtime_active)
- `allowed_surfaces`, `blocked_surfaces`
- `minimum_role`, `professional_context_required`
- `risk_level`
- `source_level`, `last_verified`
- `tests_reference`
- `rollback_key`

Explicit negative rules:

- Manifest must never reference:
  - `docs/field-knowledge/_candidate-updates/**`
  - `docs/field-knowledge/_protocols/**`
  - index files
  - planning docs (including this file)

## 8) Phase 3 — Loader Allowlist Plan

Current state (audit-backed):

- Allowlist enforcement is hard-coded via `FIELD_KNOWLEDGE_ALLOWLISTED_PATHS`.
- Approved domains list is hard-coded and currently **gas-fireplace only**.

Target state:

- Move from a static, hand-maintained allowlist to an **approved-pack allowlist derived from the manifest**, either:
  - runtime manifest-driven allowlist (load manifest → compute allowed paths), or
  - build-time generated allowlist (manifest → generated constants)

Required loader behaviors:

- Only allow reading files whose paths come from the approved manifest entries.
- Reject any attempt to read:
  - `_candidate-updates`
  - `_protocols`
  - index/planning docs
- Enforce selection keys:
  - trade, segment, region, topic
  - runtime surface, minimum role, professional_context_required
  - risk level constraints
- If no verified match exists, return the standard “no verified guidance” message (do not guess).

Required tests (minimum):

- “candidate path is not allowlisted” test
- “protocol path is not allowlisted” test
- “index/planning doc path is not allowlisted” test
- “manifest path allowlisted” test
- “unknown jurisdiction / no pack match returns safe fallback” test

## 9) Phase 4 — Runtime Selection / Safety Classifier

Implement a runtime safety classifier before answering.

Inputs:

- user role
- runtime surface
- trade/segment/topic
- professional_context_required flag
- request category (diagnostic, booking, report wording, procedural, pricing/warranty, compliance)
- high-risk trigger detection

Outputs:

- allow answer using approved pack(s)
- safe-only answer (customer/public surfaces)
- refuse + escalate (high-risk or disallowed surface/role)
- “no verified guidance” when missing packs

High-risk triggers list (must refuse/escalate; do not provide instructions):

- spring turn counts / winding / adjustment
- cable repair / drum work / bottom bracket work
- off-track/off-guide reseating
- rolling curtain/guide/bottom bar reset
- operator programming, wiring/electrical steps
- safety-device bypass
- force/limit/travel settings
- fire door certification/compliance/code/AHJ/legal/licensing
- exact pricing, warranty terms, inventory/availability promises

## 10) Phase 5 — Answer Contract

All garage-door runtime answers must:

- Use **only approved packs** as sources for trade content.
- State limitations when information is missing or not verified.
- Separate:
  - **reported** (what caller/user says)
  - **observed** (what technician saw)
  - **confirmed** (what is verified)
  - **recommended next step** (non-procedural)
- Avoid “guarantee” language and avoid compliance claims.

Must not:

- quote candidate text
- expose candidate file paths to end users
- imply “we checked code/AHJ” unless an approved jurisdiction pack exists and is selected

## 11) Phase 6 — Runtime Surface Contracts

Surface rules (initial launch):

- **technician_mobile**: allowed approved professional guidance (still no high-risk procedures); include safety boundaries and escalation rules
- **dispatcher_workspace**: intake questions + booking classification + safety screen; no diagnostic certainty and no procedures
- **office_crm**: documentation, tags, handoff, quote-review checkpoints; no procedures
- **owner_admin**: governance/checklists/QA rules; no pricing/warranty claims without business systems
- **customer_portal**: safe-only summaries; scheduling guidance; strong safety warnings; no professional procedural content
- **public_site**: safe-only marketing education; no technical guidance beyond safety boundary and “contact a pro”

## 12) Phase 7 — Test Suite Implementation Plan

Minimum test categories for initial pack activation:

- **Pack selection tests**
  - selects correct pack for trade/segment/topic
  - denies if surface not allowed
  - denies if role insufficient
- **Negative path tests**
  - cannot load `_candidate-updates`
  - cannot load `_protocols`
  - cannot load index/planning docs
- **Refusal boundary tests**
  - refuses spring turns, cable repair, off-track reset, operator programming, wiring, bypass, force/limit values
- **“No verified match” tests**
  - returns safe fallback message without hallucinated jurisdiction/code guidance
- **Leakage tests**
  - does not reveal candidate content
  - does not reveal internal pack IDs on customer/public surfaces (unless explicitly allowed)

Launch minimums (initial pilot):

- At least 25 test prompts for the first pack, including at least 10 refusal/edge cases.

## 13) Phase 8 — Audit Logging / Observability

Log every garage-door knowledge decision with:

- selected pack IDs / knowledge_keys
- manifest version hash/identifier
- trade/segment/topic/region
- runtime surface
- user role
- gating outcome (allowed/safe-only/refused/no-verified-match)
- refusal reason category (high-risk trigger, role, surface, missing pack)
- jurisdiction notice (if used)

Implementation guidance (existing telemetry pattern):

- Align with `backend/src/ai/ai-field-copilot.service.ts` telemetry structure (it already logs `topics_used`, `jurisdiction_notice`, etc.); extend to include selected pack IDs and safety decisions for garage-door.

## 14) Phase 9 — Feedback Loop

Feedback sources:

- dispatcher notes
- technician corrections
- QA prompt failures
- customer-safe confusion reports

Rules:

- All feedback becomes **candidate updates only** under `_candidate-updates/`.
- Promotion path remains: candidate → review → approved pack update → tests → manifest update → allowlist update → runtime activation.

## 15) Phase 10 — Rollback / Kill Switch

Rollback must support:

- disable by pack (`rollback_key`)
- disable by trade (`garage-door`)
- disable by surface (e.g., disable garage-door on dispatcher if needed)

Rollback behavior:

- immediate safe fallback response
- no partial load of candidate content
- audit log entry indicating rollback state

## 16) Phase 11 — Launch Gates

Gate A — Internal demo:

- single approved pack
- tests passing
- logging enabled
- surfaces limited to professional only

Gate B — Controlled pilot:

- limited tenants/workspaces
- monitoring dashboards in place
- clear escalation workflows

Gate C — Wider launch:

- additional approved packs (one at a time)
- expanded test suite and regression prompts
- explicit surface-by-surface approvals

## 17) Required Agent Audit (repo findings)

This plan is grounded in repo findings at audit time:

- Manifest exists: `docs/field-knowledge/manifest/field-knowledge-manifest.v1.json`
- Loader/selector code exists in backend field-knowledge modules (not modified by this doc)
- Allowlist enforcement is currently static (`FIELD_KNOWLEDGE_ALLOWLISTED_PATHS`)
- Approved domain list is currently **gas-fireplace only** (`FIELD_KNOWLEDGE_APPROVED_DOMAINS`)
- Garage-door approved pack directory did not exist / was empty at audit time
- `docs/field-knowledge/runtime/` directory did not exist at audit time

## 18) Final Report Checklist (must be satisfied before activation)

- [ ] At least one garage-door approved pack exists
- [ ] Pack declares audience/surface/role/risk gates
- [ ] Pack has tests and refusal cases
- [ ] Manifest references approved pack path(s) only
- [ ] Allowlist/loader cannot read candidate/protocol/index/planning docs
- [ ] Selector enforces surface + role gates
- [ ] High-risk triggers refuse/escalate (no procedures)
- [ ] Audit logs include selected pack IDs and safety decisions
- [ ] Rollback works and is tested
