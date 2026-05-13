# Gate 14 — Support / escalation note

**Audience:** Operators handling first real customers outside the controlled beta circle.

## Prospect intake (public site)

- **Primary path:** `/contact` — uses `mailto:` to `NEXT_PUBLIC_SUPPORT_EMAIL` when set; otherwise placeholder `support@example.com` (must be overridden in production).  
- **Positioning:** Do not promise instant self-serve signup; onboarding is assisted until signup exists in product.

## Authenticated customer / tenant users

- **Product issues:** Route through the organization’s internal admin or owner; PhoenixOS does not define a global in-app “help desk” in this gate.  
- **Password reset:** `/reset-password` exists in the app route map; lockout copy on login directs users to an administrator.

## Escalation ladder (template — fill names)

| Severity | Example | First responder | Escalate to | SLA (target) |
|----------|---------|-----------------|-------------|--------------|
| P0 — outage | Cannot log in / API down | | | |
| P1 — revenue | Billing / Clover reconciliation unknown | | | |
| P2 — defect | Incorrect data on job | | | |
| P3 — question | How-to | | | |

## Engineering / security

- **Cross-tenant or auth bypass:** Stop; treat as incident; do not patch under Gate 14 scope without separate approval.  
- **Gate 12 matrix failures:** Prior-gate; not handled as “support workaround.”

## Revision

| Version | Date | Author |
|---------|------|--------|
| 0.1 | 2026-05-12 | Gate 14 implementation pass |
