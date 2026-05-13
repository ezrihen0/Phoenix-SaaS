# Gate 14 — Launch readiness checklist

**Gate:** 14 — Launch preparation / public market readiness  
**Workspace:** Phoenix_SaaS (not Phoenix_CRM)

## 0. Dependency gate (execution prerequisite)

Per Gate 14 plan: no Gate 14 execution should be treated as **production launch-complete** until **Gate 12 is formally GO** and **Gate 13 is formally PASS**, unless the owner explicitly authorized documentation-only prework.

| Check | Pass / Fail | Notes |
|-------|-------------|--------|
| Gate 12 formally **GO** on file | | See [gate-12-verification-log.md](./gate-12-verification-log.md) — last recorded verdict was **NO-GO** (2026-05-13). Owner must update when cleared. |
| Gate 13 formally **PASS** on file | | [gate-13-billing-sync.md](./gate-13-billing-sync.md) is strategy documentation; record explicit PASS in verification log when owner signs. |

## 1. Public launch surface

| Check | Pass / Fail | Notes |
|-------|-------------|--------|
| `/landing` positions PhoenixOS (not “CRM” as the product category) | | |
| `/pricing` reflects real plan/trial model (aligned with Gate 13; no invented list prices) | | |
| Trial / founding offer communicated (onboarding / contact path) | | |
| Primary CTAs route to real destinations (`/login`, `/contact`, internal anchors) | | |
| `/terms` and `/privacy` load; legal content is counsel-approved (not draft placeholders) | | |
| `/contact` prospect path works (mailto or configured `NEXT_PUBLIC_SUPPORT_EMAIL`) | | |

## 2. Activation readiness

| Check | Pass / Fail | Notes |
|-------|-------------|--------|
| Anonymous → CTA → sign-in path verified | | No self-serve signup in product; do not claim otherwise. |
| After login, user understands next step (role-appropriate) | | |
| No Gate 11 multi-business architecture reopened | | |

## 3. Trust and support

| Check | Pass / Fail | Notes |
|-------|-------------|--------|
| Terms of Service public | | |
| Privacy Policy public | | |
| Support / escalation documented | | See [gate-14-support-escalation-note.md](./gate-14-support-escalation-note.md) |

## 4. Measurement and monitoring

| Check | Pass / Fail | Notes |
|-------|-------------|--------|
| Funnel events defined (CTA click, signup started/completed if applicable, org created, first activation) | | Many steps N/A until self-serve signup exists. |
| Production error monitoring decision recorded | | Optional: `NEXT_PUBLIC_ANALYTICS_SCRIPT_URL` in root layout for third-party snippet without new npm packages. |

## 5. Engineering hygiene

| Check | Pass / Fail | Notes |
|-------|-------------|--------|
| Frontend build passes | | |
| Backend build passes | | |
| `git status` clean of unrelated files (no `git add .`) | | |

## Owner sign-off

- [ ] Gate 14 launch readiness confirmed for controlled public launch / paid acquisition intent  
- **Signature / date:** _________________________
