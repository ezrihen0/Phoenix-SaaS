# WizField Owner Launch Activation Checklist

> **HISTORICAL REVIEW COPY — not current authority.** Use [`../WizField_Owner_Launch_Activation_Checklist.md`](../WizField_Owner_Launch_Activation_Checklist.md). The Stripe live-activation checklist below is stale.

## Purpose

This is the single owner-facing launch activation document for everything still pending outside internal engineering closeout.

## 1. Current state

- The engineering foundation phase is closed.
- Gate 11 remains `CLOSED / GO`.
- Gate 12 remains `CLOSED / GO`.
- Gate 13 remains `ENGINEERING PASS`.
- Gate 14 remains `ENGINEERING COMPLETE`.
- Owner launch activation is still pending.

This checklist is intentionally owner-operated. It is not a request to reopen engineering gate status.

## 2. Stripe live activation checklist

Complete all items below with an owner session and an active organization selected:

1. Fill `STRIPE_SECRET_KEY`.
2. Fill `STRIPE_WEBHOOK_SECRET`.
3. Configure the Stripe dashboard webhook endpoint for WizField.
4. Confirm these six event families are subscribed:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Run one real owner checkout through the WizField Stripe-hosted checkout flow.
6. Verify `/billing/success` only shows processing confirmation and does not claim activation from redirect alone.
7. Verify subscription synchronization lands in `billing_accounts`.
8. Re-open billing surfaces and confirm shared billing-account state reflects the Stripe customer, subscription, provider, and plan correctly.

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
| P1 | Billing / Stripe webhook sync unknown |  |  |  |
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
- checkout / activation path failures can be observed
- production errors can be surfaced to the owner/operator

## 6. Paid acquisition GO / NO-GO criteria

Paid acquisition is `GO` only when all are true:

1. Public positioning is honest and current.
2. Signup and checkout claims match the tested product surface.
3. Final Terms and Privacy are live.
4. Support handling is defined and staffed or explicitly time-bounded.
5. Live Stripe checkout and webhook acceptance proof is recorded.
6. Analytics / monitoring is chosen and enabled.

Paid acquisition is `NO-GO` if any one remains open:

- Terms not final
- Privacy not final
- production `NEXT_PUBLIC_SUPPORT_EMAIL` not finalized
- live Stripe activation proof missing
- analytics / monitoring decision missing
- public messaging promises more than current launch operations can safely support

## 7. Final production launch readiness checklist

Use this as the final owner sign-off pass:

- [ ] Final Terms text live
- [ ] Final Privacy text live
- [ ] Production `NEXT_PUBLIC_SUPPORT_EMAIL` set
- [ ] `/contact` points to the real production support path
- [ ] Support / escalation ladder filled
- [ ] Stripe webhook endpoint configured in Stripe
- [ ] Six Stripe event families subscribed
- [ ] One real owner checkout completed
- [ ] `billing_accounts` sync verified after live webhook delivery
- [ ] Funnel / analytics approach enabled
- [ ] Error monitoring approach enabled
- [ ] Production-like reverification evidence recorded where required
- [ ] Owner launch decision recorded

## 8. Explicit decision state

- Engineering closeout is complete.
- Program/public launch remains owner-gated.
- Paid acquisition remains `NO-GO` until the owner items in this checklist are completed.
