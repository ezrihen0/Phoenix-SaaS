# Gas Fireplace Internal Text Pilot Plan v1

## Document Status

**Pilot planning document only.** Not approved field knowledge. Not runtime AI knowledge.

This document defines the scope, rules, gates, and checklists for the first controlled runtime pilot of Field Copilot — limited to **gas-fireplace, internal/professional text surfaces, authenticated professional users only**.

---

## 1. Pilot Scope

| Dimension | Value |
|-----------|-------|
| **Trade** | `gas-fireplace` only |
| **Domain** | `gas_fireplace` |
| **Surface** | Professional text only: `technician_mobile`, `office_crm`, `dispatcher_workspace`, `owner_admin` |
| **Users** | Authenticated professional roles only |
| **Field knowledge** | Gas-fireplace approved packs only (legacy + Alberta V1 manifest) |
| **Jurisdiction** | Alberta, Canada only; Calgary/Edmonton permit packs supported |
| **Pilot type** | Internal — no customer, public, or voice exposure |

### Out of scope (blocked)

| Area | Reason |
|------|--------|
| `ai_voice_phone` live booking | Not implemented; not approved; voice gates require dedicated QA pass |
| `customer_portal` | Professional guidance must not leak to customers |
| `public_site` | No anonymous access; no marketing-safe pack metadata yet |
| Chimney runtime | No approved runtime domain wired |
| Garage-door runtime | No approved runtime domain wired |
| Doors-windows text pilot | Separate pilot; different system prompt, pack gates |
| AI Voice live booking | Not enabled; no booking/appointment/customer/calendar/availability tools |
| Candidate pack conversion | All `_candidate-updates/` paths remain blocked at runtime |
| Manifest edits | `field-knowledge-manifest.v1.json` not modified |
| Approved pack edits | No pack content changed |

---

## 2. Allowed Users/Roles

Only authenticated professionals with an active organization context may access the pilot.

| Role | Max Surface |
|------|-------------|
| `owner` | `owner_admin` |
| `admin` | `owner_admin` |
| `office_admin` | `office_crm` |
| `dispatcher` | `dispatcher_workspace` |
| `technician` | `technician_mobile` |
| `csr` | Blocked (not in `FIELD_COPILOT_ALLOWED_ROLES`) |
| `viewer` | Blocked (not in `FIELD_COPILOT_ALLOWED_ROLES`) |

**Enforcement:**

- Role check at `AiFieldCopilotService.enforceFieldCopilotAccess()` — 403 if role not in `FIELD_COPILOT_ALLOWED_ROLES`.
- Active `organization_id` required — 400 if missing.
- `ROLE_MAX_RUNTIME_SURFACE` limits the maximum surface any role may reach.

---

## 3. Allowed Surfaces

| Surface | Purpose | Knowledge Depth |
|---------|---------|-----------------|
| `technician_mobile` | Technician field reference | Full professional (pack-gated) |
| `office_crm` | Office staff CRM support | Professional + CRM context |
| `dispatcher_workspace` | Dispatcher triage | Dispatcher-safe guidance |
| `owner_admin` | Owner/admin oversight | Broad professional |

**Each of these** is a member of `PROFESSIONAL_RUNTIME_SURFACES` and maps to the gas-fireplace system prompt (`FIELD_COPILOT_GAS_SYSTEM_PROMPT`).

---

## 4. Blocked Surfaces

| Surface | Block Mechanism | Fallback Reason |
|---------|----------------|-----------------|
| `customer_portal` | `RESTRICTED_RUNTIME_SURFACES` + `filterPackKeysForRuntime` | `blocked_surface` |
| `public_site` | `RESTRICTED_RUNTIME_SURFACES` + `filterPackKeysForRuntime` | `blocked_surface` |
| `ai_voice_phone` | `RESTRICTED_RUNTIME_SURFACES` + voice-enabled kill switch | `blocked_surface` or `voice_disabled` |

**Enforcement:**

1. `filterPackKeysForRuntime()` returns `[]` for any restricted surface, preventing any pack content from reaching the LLM.
2. `evaluateRuntimeGates()` checks `RESTRICTED_RUNTIME_SURFACES` and returns `fallback` with `blocked_surface` reason.
3. `ai_voice_phone` additionally requires `killSwitches.voiceEnabled === true`, which is driven by `AI_FIELD_COPILOT_VOICE_ENABLED` env var.

---

## 5. Required Environment Flags / Kill Switches

| Variable | Purpose | Pilot Value |
|----------|---------|-------------|
| `AI_FOUNDATION_ENABLED` | Master AI feature toggle | `true` |
| `AI_FIELD_COPILOT_ENABLED` | Field Copilot feature toggle | `true` |
| `AI_FIELD_COPILOT_DISABLED_DOMAINS` | Comma-separated blocked domains | `""` (empty — gas-fireplace allowed) |
| `AI_FIELD_COPILOT_DISABLED_SURFACES` | Comma-separated blocked surfaces | `"customer_portal,public_site,ai_voice_phone"` |
| `AI_FIELD_COPILOT_VOICE_ENABLED` | Voice surface enablement | `false` (voice not ready) |
| `DEEPSEEK_API_KEY` | LLM provider key | Configured per environment |

**Kill switch behavior in code** (`resolveKillSwitches` in `ai-field-copilot.service.ts`):

```typescript
// domainDisabled: disabledDomains.includes(knowledgeDomain.toLowerCase())
// voiceEnabled: AI_FIELD_COPILOT_VOICE_ENABLED === 'true'
// disabledSurfaces: parsed CSV from AI_FIELD_COPILOT_DISABLED_SURFACES
```

If any kill switch triggers, the gate engine returns a fallback/refusal with `skip_llm=true` — the LLM is never called.

---

## 6. Runtime Safety Gates That Must Stay Enabled

All gates in `evaluateRuntimeGates()` must remain active during pilot:

| Order | Gate | Condition | Outcome |
|-------|------|-----------|---------|
| 1 | Domain disabled | `killSwitches.domainDisabled` | `domain_disabled` fallback |
| 2 | Surface disabled | `killSwitches.surfaceDisabled` or surface in `disabledSurfaces` | `surface_disabled` fallback |
| 3 | Voice disabled | `ai_voice_phone` without `voiceEnabled` | `voice_disabled` fallback |
| 4 | Emergency | `emergency_flag === true` | `emergency` fallback — no booking, no troubleshooting |
| 5 | Low trade confidence | `trade_confidence < 0.80` | `low_trade_confidence` fallback |
| 6 | Low risk confidence | `risk_level` high/critical AND `risk_confidence < 0.90` | `low_risk_confidence` fallback |
| 7 | Voice repair request | `ai_voice_phone` AND `repair_guidance_requested` | `voice_repair_request` fallback |
| 8 | Blocked surface (customer/public) | `customer_portal` or `public_site` AND `repair_guidance_requested` | `blocked_surface` fallback |
| 9 | Manufacturer-specific | `isManufacturerSpecificRequest` with no allowed packs | `manufacturer_specific` fallback |
| 10 | Unsupported jurisdiction | No jurisdiction packs matched | `unsupported_jurisdiction` fallback |
| 11 | Blocked surface (final) | Any `RESTRICTED_RUNTIME_SURFACES` | `blocked_surface` fallback |
| 12 | No approved pack | `allowedPackKeys.length === 0` | `no_approved_pack` fallback |
| 13 | Regulated claim without pack | `regulated_claim_requested` without permit/jurisdiction pack | `regulated_claim_without_pack` fallback |
| 14 | High-risk repair | High/critical risk AND `repair_guidance_requested` | `high_risk` fallback |
| 15 | Insufficient role | Role not in `FIELD_COPILOT_ALLOWED_ROLES` | `refused` (403) |

**Path guard** (`assertRuntimeKnowledgePathAllowed`) must remain active to block:
- `_candidate-updates/` paths
- `_protocols/` paths
- `runtime/` planning paths
- Path traversal (`..`)

---

## 7. QA Checks Required Before Pilot

All checks must pass before pilot GO.

| Check | Command | What It Validates |
|-------|---------|-------------------|
| Contract check | `npm run field-knowledge:contract-check --workspace backend` | Manifest expected packs exist on disk |
| Unit check | `npm run field-knowledge:unit-check --workspace backend` | Basic knowledge selection and jurisdiction logic |
| Runtime safety check | `npm run field-knowledge:runtime-safety-check --workspace backend` | All 12+ safety gate unit tests — emergency, surface blocking, path guard, confidence thresholds |
| QA appendix check | `npm run field-knowledge:qa-appendix-check --workspace backend` | Appendix has correct 320 rows (80/trade, 40 voice + 40 text), correct columns, valid severity |
| Adversarial check | `npm run field-knowledge:runtime-adversarial-check --workspace backend` | 46 adversarial scenarios across 6 groups — path leakage, surface escalation, voice repair, emergency hard-stop, jurisdiction, regression |

### Acceptance criteria for pilot GO

| Metric | Threshold |
|--------|-----------|
| **S0 Critical failures** | **Zero** |
| **S1 High failures** | **Zero** |
| Emergency trap prompts (gas-fireplace) | 100% must escalate |
| Repair steps on blocked surfaces | 0% allowed |
| Build | Must pass |
| All 5 field-knowledge check scripts | Must all pass |

---

## 8. Daily Review Workflow

Each day during pilot:

1. **Review telemetry** (see §9) — inspect gate outcomes, fallback rates, refusal reasons.
2. **Check for new candidate updates** — candidates in `_candidate-updates/` remain blocked; no manual loading.
3. **Verify kill switches** — confirm `AI_FIELD_COPILOT_DISABLED_SURFACES` still includes `customer_portal,public_site,ai_voice_phone`.
4. **Run safety checks** — re-run `runtime-safety-check` and `runtime-adversarial-check` if any code or pack changes occurred.
5. **Log fallback patterns** — document any user messages that unexpectedly triggered fallbacks or refusals.
6. **File feedback candidates** — user feedback becomes `_candidate-updates/` content (never loaded at runtime).

---

## 9. Telemetry Fields to Inspect

Every Field Copilot call records a `FieldKnowledgeRuntimeAudit` envelope. Key fields for pilot monitoring:

| Field | What to Watch For |
|-------|-------------------|
| `gate_outcome` | Ratio of `allowed` vs `fallback`/`refused` |
| `fallback_reason` | Distribution — which gates trigger most often |
| `refusal_reason` | Content of refusal message |
| `trade_confidence` | Are users getting low-confidence classifications? |
| `risk_confidence` | Are safety-classified calls hitting the confidence threshold? |
| `emergency_flag` | Count of emergency triggers |
| `booking_eligibility` | Must always be `false` (no booking in this pilot) |
| `lead_capture_only` | Must always be `false` (no lead capture in this pilot) |
| `booking_outcome` | Must always be `"none"` |
| `runtime_surface` | Verify only professional surfaces are used |
| `user_role` | Verify only allowed roles are accessing |
| `used_llm` | Did the call reach the LLM or was it blocked by a gate? |
| `knowledge_domain` | Must only be `gas_fireplace` during pilot |
| `response_length` | Monitor for unexpectedly empty or truncated responses |

### Alert conditions

- `booking_eligibility === true` → **IMMEDIATE STOP** (booking should not be possible)
- `gate_outcome === "allowed"` on `customer_portal` or `public_site` or `ai_voice_phone` → **IMMEDIATE STOP**
- `emergency_flag` detected but `gate_outcome !== "fallback"` → **IMMEDIATE STOP**
- `used_llm === true` with empty `allowed_pack_keys` → review (should have been blocked)
- S0/S1 failure in any QA re-run → pause pilot

---

## 10. Fallback/Refusal Review Process

When a user receives a fallback or refusal:

1. **Log the event** — telemetry captures `fallback_reason`, `refusal_reason`, `user_role`, `runtime_surface`.
2. **Review the trigger** — was the gate correct? Was the user asking for something outside scope?
3. **Document patterns** — if the same fallback triggers repeatedly, consider:
   - Adding a clarifying question to the system prompt (no pack changes)
   - Filing a candidate update for future approval
   - Adjusting confidence overrides only if validated
4. **Never** bypass gates by:
   - Removing fallback logic
   - Adding candidate paths to the allowlist
   - Modifying pack gates to allow blocked surfaces
   - Enabling voice or booking tools

---

## 11. How User Feedback Becomes Candidate Updates Only

**Rule: User feedback must never directly modify approved packs or runtime behavior.**

Workflow:

```text
User feedback → Reviewed by team → Candidate update written to
  docs/field-knowledge/_candidate-updates/gas-fireplace/
  → Candidate goes through verification → QA → Owner approval
  → If approved: manifest registration → allowlist addition → pack becomes runtime-safe
  → If not approved: remains candidate, never loaded at runtime
```

**Blocked paths (hard-coded in path guard):**
- `_candidate-updates/` — never load at runtime
- `_protocols/` — methodology only
- `runtime/` — planning docs only

**Protected paths (only manifest-registered packs):**
- `trades/gas-fireplace/canada/alberta/` — approved packs
- `jurisdictions/canada/alberta/` — approved jurisdiction packs
- `gas-fireplace/` — legacy flat packs

---

## 12. Rollback Plan

### Immediate rollback (within minutes)

If any alert condition from §9 triggers, or an S0/S1 failure is discovered:

1. **Set `AI_FIELD_COPILOT_ENABLED=false`** — disables Field Copilot entirely at the environment level.
2. **Or set `AI_FIELD_COPILOT_DISABLED_DOMAINS=gas_fireplace`** — disables gas-fireplace only.
3. **Or add surfaces to `AI_FIELD_COPILOT_DISABLED_SURFACES`** — selectively disable surfaces.

### Within 1 hour

4. **Revert the commit** if the issue is in code/pack changes.
5. **Re-run all safety checks** to confirm the rollback is clean.
6. **Notify pilot users** of the pause via internal channel.

### Within 24 hours

7. **Root cause analysis** — identify why the gate or check failed.
8. **File fix as candidate update** or code fix PR.
9. **Re-verify** before unpausing pilot.

### Rollback must restore

- All runtime safety gates enabled
- No voice/customer/public surface access
- Gas-fireplace only (no chimney, garage-door, or all-trades)
- No booking or appointment tools

---

## 13. GO / NO-GO Checklist

### Environment configuration

- [ ] `AI_FOUNDATION_ENABLED=true`
- [ ] `AI_FIELD_COPILOT_ENABLED=true`
- [ ] `AI_FIELD_COPILOT_DISABLED_DOMAINS` does not include `gas_fireplace`
- [ ] `AI_FIELD_COPILOT_DISABLED_SURFACES` includes `customer_portal,public_site,ai_voice_phone`
- [ ] `AI_FIELD_COPILOT_VOICE_ENABLED=false`
- [ ] `DEEPSEEK_API_KEY` configured

### Build & checks (must all pass)

- [ ] `npm run build --workspace backend`
- [ ] `npm run field-knowledge:contract-check --workspace backend`
- [ ] `npm run field-knowledge:unit-check --workspace backend`
- [ ] `npm run field-knowledge:runtime-safety-check --workspace backend`
- [ ] `npm run field-knowledge:qa-appendix-check --workspace backend`
- [ ] `npm run field-knowledge:runtime-adversarial-check --workspace backend`

### Safety gate verification

- [ ] `emergency_flag=true` blocks LLM call (tested — S0=0)
- [ ] `customer_portal` returns `blocked_surface` fallback (tested — S1=0)
- [ ] `public_site` returns `blocked_surface` fallback (tested — S1=0)
- [ ] `ai_voice_phone` returns `blocked_surface` or `voice_disabled` (tested — S1=0)
- [ ] `_candidate-updates/` paths blocked (tested — 8/8 path leakage pass)
- [ ] `_protocols/` paths blocked (tested)
- [ ] `runtime/` planning docs blocked (tested)
- [ ] `trade_confidence < 0.80` triggers fallback (tested)
- [ ] `risk_confidence < 0.90` on safety issue triggers fallback (tested)
- [ ] Regulated claims without approved pack blocked (tested)
- [ ] Manufacturer-specific without pack blocked (tested)
- [ ] Unknown jurisdiction returns fallback (tested — 8/8 jurisdiction pass)
- [ ] `booking_eligibility=false` always (verified — no booking tools exist)
- [ ] `booking_outcome="none"` always (verified — no booking tools exist)

### Pilot scope constraints

- [ ] Gas-fireplace only (no chimney, garage-door, doors-windows)
- [ ] Professional surfaces only (not customer/public/voice)
- [ ] Authenticated professional roles only
- [ ] Active organization context required
- [ ] No candidate packs loaded at runtime
- [ ] No manifest edits made
- [ ] No approved pack edits made
- [ ] No AI Voice live booking enabled
- [ ] No appointment/customer/calendar/availability tools implemented
- [ ] No frontend changes deployed

### Operations

- [ ] Telemetry pipeline confirmed receiving audit envelopes
- [ ] Alert conditions documented and monitored
- [ ] Rollback plan accessible to operations team
- [ ] Pilot users briefed on scope and limitations
- [ ] Feedback channel documented (candidate updates only)

---

## Hard NO-GO Conditions

Any of these immediately block pilot start or require immediate rollback:

- AI Voice live booking enabled or planned
- Customer/public surface exposed to professional guidance
- Candidate/protocol/runtime planning docs loaded at runtime
- Manifest edited as part of pilot
- Approved packs edited as part of pilot
- Chimney or garage-door enabled at runtime
- Any S0 or S1 failure in QA checks
- `booking_eligibility=true` observed in any call
- Emergency keyword matched but `emergency_flag` not set

---

## References

- [`field-copilot-runtime-safety-and-voice-plan-v1.md`](field-copilot-runtime-safety-and-voice-plan-v1.md) — full safety plan
- [`field-copilot-runtime-safety-qa-results-v1.md`](field-copilot-runtime-safety-qa-results-v1.md) — QA results
- [`field-copilot-runtime-pilot-readiness-v1.md`](field-copilot-runtime-pilot-readiness-v1.md) — overall readiness assessment
- `backend/src/ai/field-knowledge/field-knowledge-runtime-gate.engine.ts` — runtime gate engine
- `backend/src/ai/field-knowledge/field-knowledge-runtime.constants.ts` — thresholds, surfaces, roles
- `backend/src/ai/field-knowledge/field-knowledge-runtime.types.ts` — type definitions
- `backend/src/ai/field-knowledge/field-knowledge-path-guard.ts` — path safety guard
- `backend/src/ai/ai-field-copilot.service.ts` — Field Copilot service implementation
