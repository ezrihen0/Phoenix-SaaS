# WizField Owner Launch Activation Checklist

## Purpose

This is the single owner-facing launch activation document for everything still pending outside internal engineering closeout.

Current production verdict: **CONDITIONAL GO / YES WITH CONDITIONS**. Evidence: [WIZFIELD_PRODUCTION_CLOSEOUT.md](audit/production-2026-09/WIZFIELD_PRODUCTION_CLOSEOUT.md). Product truth: [WizField_Master_Source_of_Truth.md](WizField_Master_Source_of_Truth.md).

Closed P0/P1/P2 engineering findings are **not** current launch blockers.

## 1. Current state

- The engineering foundation phase is closed (Gate 11–14 locked).
- September 2026 production closeout is **CONDITIONAL GO**.
- Owner launch activation is still pending.

This checklist is intentionally owner-operated. It is not a request to reopen engineering gate status or closed audit findings.

## 2. SaaS billing provider status

WizField is not using SaaS subscription billing in the active Phoenix runtime.

- Do not configure Stripe secrets for current production access.
- Do not require Stripe Checkout or webhook delivery before Phoenix users enter WizField.
- Keep CRM invoices and tenant customer payments separate from WizField SaaS billing decisions.
- If SaaS subscription billing is reconsidered later, create a new owner-approved provider reactivation checklist and engineering review before adding runtime secrets or webhook routes back.

## 3. Legal closeout

Before public launch:

1. Finalize Terms of Service text.
2. Finalize Privacy Policy text.
3. Replace any placeholder or draft legal copy in the public launch surface with owner-approved final text.

## 4. Support closeout

1. Set production `NEXT_PUBLIC_SUPPORT_EMAIL`.
2. Confirm `/contact` routes prospects to the real production support path.
3. Fill and operationalize the support / escalation ladder:

| Severity | Example | First responder | Escalate to | SLA target |
|---|---|---|---|---|
| P0 | Cannot log in / API down |  |  |  |
| P1 | Workspace access / local billing state unknown |  |  |  |
| P2 | Incorrect job / customer / invoice data |  |  |  |
| P3 | How-to / onboarding question |  |  |  |

4. Decide who owns first-response coverage for initial launch customers.

## 5. Analytics / error monitoring decision

Record the owner decision for:

- analytics / funnel instrumentation
- production error monitoring
- launch KPI visibility

Minimum expectation before public launch:

- landing CTA activity can be observed
- signup attempts can be observed
- signup, login, and workspace-access failures can be observed
- production errors can be surfaced to the owner/operator

## 6. Paid acquisition GO / NO-GO criteria

Paid acquisition is `GO` only when all are true:

1. Public positioning is honest and current.
2. Signup and workspace-access claims match the tested product surface.
3. Final Terms and Privacy are live.
4. Support handling is defined and staffed or explicitly time-bounded.
5. Any future SaaS billing provider decision is documented; none is required for the current Phoenix runtime.
6. Analytics / monitoring is chosen and enabled.

Paid acquisition is `NO-GO` if any one remains open:

- Terms not final
- Privacy not final
- production `NEXT_PUBLIC_SUPPORT_EMAIL` not finalized
- SaaS billing provider decision undocumented if the owner chooses to reactivate subscription billing
- analytics / monitoring decision missing
- public messaging promises more than current launch operations can safely support

## 7. Final production launch readiness checklist

Use this as the final owner sign-off pass:

- [ ] Final Terms text live (remove DRAFT placeholders)
- [ ] Final Privacy text live (remove DRAFT placeholders)
- [ ] Production `NEXT_PUBLIC_SUPPORT_EMAIL` set (do not ship `support@example.com` fallback)
- [ ] `/contact` points to the real production support path
- [ ] Support / escalation ladder filled
- [ ] Signup/login enters the operating workspace without Stripe configuration
- [ ] Local billing/access state and controlled grants are documented for launch users
- [ ] Documented DB backup executed; location and retention recorded
- [ ] Documented uploaded-files backup executed (`uploads/invoice-documents`, `uploads/inspection-photos`, warranty PDFs)
- [ ] Release branch staged from a known baseline; pending migrations applied in the target environment
- [ ] Native payment V1 REJECT policy decided **or** current ALLOW policy (overpay / already-paid / cancelled job) explicitly accepted
- [ ] Funnel / analytics approach enabled
- [ ] Error monitoring approach enabled
- [ ] Production-like reverification evidence recorded where required
- [ ] Owner launch decision recorded

## 8. Explicit decision state

- Engineering closeout is complete. Production closeout is **CONDITIONAL GO**.
- Program/public launch remains owner-gated on the items above.
- Paid acquisition remains `NO-GO` until the owner items in this checklist are completed.
- Stripe reactivation is a future separate project, not a current activation step.
