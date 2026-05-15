# PhoenixOS / WizField SaaS
# Sign-Up Activation Master Plan
## Product + UX Alignment Plan Before Agent Execution

> Current role: subordinate historical planning context only. This file is not the active execution source of truth.

**Document status:** Product decision locked — ready for PLAN-mode agent analysis  
**Project:** PhoenixOS / WizField SaaS  
**Current canonical status:** Subordinate historical planning artifact, not active execution truth. Current signup, billing, and owner activation truth is governed by `docs/WizField_Master_Source_of_Truth.md`, `docs/WizField_Engineering_Closeout_and_Verification.md`, and `docs/WizField_Owner_Launch_Activation_Checklist.md`.
**Scope:** Self-serve sign-up, subscription activation, unpaid gating, and add-business entitlement alignment  
**Not an execution prompt:** This document preserves the original signup-activation planning target for context. It must not override current canonical SoT or closeout evidence.

---

# 1. Why this plan exists

PhoenixOS has already completed the core SaaS foundation:

- Multi-tenant architecture is closed.
- Multi-org UX is closed.
- Shared billing-account model is established.
- Stripe-first provider architecture is established.
- Self-serve signup and authenticated add-business flows already exist in current repo truth.

This plan does **not** reopen SaaS architecture.  
After the Post-AI documentation topology cleanup, this plan also does **not** reopen the closed Pre-AI correction package, Gate 11-14, AI Phase 0-4, or owner launch activation boundaries.
This plan defines the **final intended product/UX contract** for the Sign-Up flow and instructs the next PLAN-mode pass to verify whether the current implementation matches that contract exactly.

The goal is simple:

> A new business owner creates a WizField account, sees that their workspace is already prepared, activates a subscription through Stripe, and only then receives full CRM access.

---

# 2. Locked product decisions

## 2.1 Authentication method

### Decision
Use:

- Email
- Password

Do **not** add:

- Google sign-in
- Apple sign-in
- Magic-link-first auth
- Social login

### Reason
The immediate product objective is to finalize a reliable self-serve B2B onboarding path tightly integrated with the shared billing-account model. Social authentication adds avoidable account-linking complexity and does not materially improve the first launch funnel enough to justify opening that front now.

---

## 2.2 Flow order

### Final decision
```text
Signup first
→ Workspace created
→ Mandatory plan selection
→ Stripe Checkout
→ Webhook-authoritative activation
→ Full CRM access
```

### Rejected model
```text
Checkout first
→ Signup after payment
```

### Why the rejected model is wrong
Checkout-first would create a messy separation between:

- external payment intent
- internal user identity
- organization ownership
- shared billing-account ownership
- abandoned checkout recovery

PhoenixOS must know who the payer is and which internal billing account is being activated **before** Stripe Checkout begins.

---

# 3. Sign-up form contract

## 3.1 Required fields

The public signup form must ask only for:

1. **Full Name**
2. **Email**
3. **Password**
4. **Business Name**

## 3.2 Business Name copy

Use:

> **Business Name**

Helper text:

> You can update this later in your settings.

## 3.3 Do not add at first launch

Do not add these fields to the initial signup form:

- Phone number
- Country
- Province / State
- Address
- Industry
- Team size
- Number of technicians
- Referral source

Those fields may belong later in post-payment onboarding, account settings, analytics, or lead qualification — not in first-click account creation.

---

# 4. Product psychology and UX principle

## 4.1 Core UX feeling

The correct feeling is:

> “My digital office has already been prepared. I just need to activate it.”

This is **Workspace Ready**, not “registration incomplete.”

## 4.2 Why this matters commercially

The user should not feel that they are merely filling out a form.  
They should feel that WizField has already created something specifically for their business.

This supports:

- stronger completion intent
- lower emotional friction after signup
- stronger loss-aversion effect if they abandon activation
- a more premium SaaS impression

---

# 5. Exact post-signup experience

## 5.1 Immediate success state after account creation

After successful signup, the user should **not** land in the live CRM.

They should move into a subscription activation screen with this product message:

> **Your workspace is ready.**  
> Activate your subscription to start managing your business with WizField.

## 5.2 Screen responsibility

This screen is responsible for:

- confirming that signup succeeded
- reinforcing that the workspace is already created
- presenting Starter / Pro / Business
- forcing the next step: activation through Stripe Checkout

## 5.3 No partial CRM exploration

The product must **not** provide a partially usable CRM before subscription activation.

Do not expose:

- usable dashboard
- live customers module
- live jobs module
- usable invoice creation
- usable scheduling
- operational settings beyond what is strictly necessary to finish activation

The user may be authenticated, but their access to the actual operating system must remain subscription-gated.

---

# 6. Hard Gate policy

## 6.1 Mandatory activation path

Plan selection is not optional.

If the user:

- signs up and closes the tab
- abandons checkout
- returns later
- logs out and logs back in before activating

they should return to the activation flow, not to `/home`.

## 6.2 Core rule

```text
Registered but not activated
= authenticated identity exists
= workspace exists
= CRM access remains locked
```

## 6.3 Routing behavior target

Any attempt to access the live tenant CRM while the subscription is not activated should route to a subscription activation state, for example:

```text
/subscribe
```

or the existing equivalent subscription page already used in repo truth.

The final route name should follow current code structure; do not invent a duplicate activation page if a correct one already exists.

---

# 7. What must exist internally after signup

The exact implementation may already exist, but the final product contract is:

## 7.1 On signup success, the system must have

1. `user`
2. first `organization`
3. owner `membership`
4. authenticated session
5. active organization bound into session truth
6. shared `billing_account`
7. organization-to-billing-account coverage link
8. billing state indicating the account is **not yet activated**

## 7.2 Billing state before payment

The business truth is:

```text
User exists.
Workspace exists.
Billing account exists.
Subscription access is not yet active.
```

The implementation may use existing repo status names. The agent must **not** invent new statuses without checking current billing model truth.

The PLAN-mode pass must determine whether the current implementation already expresses this cleanly and whether any naming/behavior gap remains.

---

# 8. Subscription activation flow

## 8.1 Plan options

The plan cards must reflect the locked shared-business entitlement model:

- **Starter** — 1 business
- **Pro** — up to 3 businesses
- **Business** — expanded model / no fixed local hard cap currently enforced

## 8.2 Trial messaging

The activation screen should support the chosen business offer:

- one month free trial
- credit card required
- cancel before trial ends if applicable to the final pricing policy

The exact pricing copy must match live business policy and not drift from billing implementation.

## 8.3 Stripe Checkout launch

When the user selects a plan:

- backend creates a Stripe Checkout Session
- Checkout is tied to the internal shared billing account
- Stripe provider boundary remains intact
- raw card details are never collected by PhoenixOS

---

# 9. Stripe authority and success page behavior

## 9.1 Success redirect is not activation authority

The redirect page after Stripe Checkout must **never** claim that the subscription is active simply because the browser returned from Stripe.

## 9.2 Activation authority

The local billing state becomes active only after verified Stripe webhook synchronization confirms the valid subscription state.

## 9.3 Success page target behavior

The success page should communicate:

> We received your subscription flow. We are confirming activation.

Then one of two states:

### A. Webhook already processed
Show:

> Your subscription is active.  
> Enter your workspace.

CTA:

> Go to Dashboard

### B. Webhook still processing
Show:

> We are confirming your subscription. This usually completes shortly.

Then poll or refresh billing state only if that behavior already fits current product architecture. Do not add unnecessary complexity without clear need.

---

# 10. Unpaid, failed, or abandoned flows

## 10.1 Registered but never entered Checkout

State meaning:

```text
Workspace created.
No checkout activation completed.
No CRM access.
```

UX copy:

> Your workspace is ready. Choose a plan to activate WizField.

---

## 10.2 Checkout abandoned

The user returns to the activation screen.

UX copy:

> Complete your subscription to activate your workspace.

Do not treat abandoned Stripe Checkout as a permanent terminal failure.

---

## 10.3 Payment incomplete or failed

If Stripe state indicates non-activated payment/subscription status, the user remains blocked from full CRM access.

UX copy:

> Your subscription has not been activated yet. Review your billing details to continue.

The agent should align this copy with existing error surfaces and avoid creating contradictory user messaging.

---

# 11. Add-Business entitlement contract

## 11.1 Core product truth

Add-business is governed by the **shared billing account entitlement**, not merely by whether the current user is logged in.

## 11.2 Entitlement rules

- Starter: maximum 1 business
- Pro: maximum 3 businesses
- Business: expanded / uncapped in current local model

## 11.3 Correct behavior

When the user clicks **Add Business**:

1. backend resolves the active shared billing account
2. backend checks current entitlement
3. backend counts organizations already covered by the billing account
4. if under limit:
   - create new organization
   - create owner membership
   - link new organization to the same billing account
5. if over limit:
   - block creation
   - present upgrade path

## 11.4 Starter limit messaging

Example:

> Your Starter plan supports 1 business. Upgrade to Pro to add another workspace.

## 11.5 Pro limit messaging

Example:

> You’ve reached the 3-business limit on Pro. Upgrade to Business to add more.

## 11.6 Enforcement rule

The entitlement check must happen **before** the organization is created.

No orphan or rollback-style overflow organization behavior should be accepted.

---

# 12. State machine

## 12.1 Simple product state machine

```text
anonymous
→ registered_unpaid
→ checkout_pending
→ active_paid
```

## 12.2 Launch-realistic access state machine

Because a free trial may exist, runtime access truth should support:

```text
anonymous
→ registered_unpaid
→ checkout_pending
→ active_trialing OR active_paid
```

Later lifecycle states may include:

```text
past_due
unpaid
canceled
```

Those later lifecycle states are billing management concerns, not first-click signup UX redesign.

---

# 13. Access rules by state

| State | User exists | Workspace exists | Can reach CRM | Sees activation screen |
|---|---:|---:|---:|---:|
| anonymous | No | No | No | No |
| registered_unpaid | Yes | Yes | No | Yes |
| checkout_pending | Yes | Yes | No | Yes |
| active_trialing | Yes | Yes | Yes | No |
| active_paid | Yes | Yes | Yes | No |

---

# 14. Desired UX screens

## 14.1 `/signup`

Purpose:
- create identity
- create first workspace
- lower signup friction

Suggested heading:

> Create your WizField workspace

CTA:

> Create My Workspace

Fields:
- Full Name
- Email
- Password
- Business Name

Helper under Business Name:

> You can update this later in your settings.

---

## 14.2 Subscription activation page

Purpose:
- declare workspace is ready
- force plan selection
- lead into Stripe Checkout

Suggested heading:

> Your workspace is ready.

Suggested body:

> Activate your subscription to start running your business with WizField.

Plan cards:
- Starter
- Pro
- Business

CTA:
- Start Free Trial
- or Start Plan, depending on the final pricing language already chosen by the owner

---

## 14.3 `/billing/success`

Purpose:
- reflect that Stripe redirect returned
- never overclaim activation
- gracefully move user into workspace once webhook sync confirms billing state

---

# 15. What the next PLAN-mode agent pass must do

The next agent must **not** blindly rebuild Signup.

It must audit current repo truth against this locked product contract.

## 15.1 Required PLAN-mode audit questions

The agent should determine:

1. Does the existing `/signup` page already ask for exactly:
   - Full Name
   - Email
   - Password
   - Business Name?

2. Is the copy aligned with:
   - “Create your WizField workspace”
   - Business Name, not Workspace Name
   - editable-later reassurance?

3. After signup:
   - is the user redirected into the activation flow?
   - or incorrectly into live CRM?

4. Is the unpaid user hard-gated from CRM routes?

5. Does returning unpaid user land back on activation, not `/home`?

6. Does current billing state already model:
   - workspace exists
   - billing exists
   - subscription not active?

7. Does the activation screen present plans according to:
   - Starter = 1 business
   - Pro = 3 businesses
   - Business = expanded/no fixed local hard cap?

8. Does plan selection correctly launch Stripe Checkout against the internal shared billing account?

9. Does `/billing/success` avoid claiming activation before webhook confirmation?

10. Does add-business enforce entitlement **before** org creation?

11. Do add-business messages tell the owner clearly when an upgrade is required?

12. Are any current signup/onboarding copy pieces still inconsistent with the final locked UX?

---

# 16. Expected output of the PLAN-mode agent

The agent must return:

## 16.1 Work Mode
The agent should classify the task correctly.  
Most likely:

- **New Feature Alignment / UX + Flow Refinement**
- or a combination of **UI Change** and **Bug Fix**, only if the audit shows mismatches

The agent must not begin code before scope approval.

## 16.2 Current repo audit
A concise audit of:

- what already matches this plan
- what does not match
- what is missing
- what should remain untouched

## 16.3 Exact proposed execution slice
The agent must propose:

- exact files to touch
- why each file is needed
- risk rating
- protected area status
- test plan
- rollback point

## 16.4 Explicit non-goals
The agent must not reopen:

- SaaS tenant architecture
- shared billing-account architecture
- Stripe provider strategy
- Gate 11–14 closure statuses
- social login
- unrelated pricing redesign
- unrelated legal/support launch activation tasks

---

# 17. Done criteria

This plan is considered successfully aligned when:

1. Signup remains simple and business-owner friendly.
2. The workspace-ready emotional hook is visible in the UX.
3. The flow hard-gates unpaid users before live CRM access.
4. Stripe activation remains webhook-authoritative.
5. Success redirect copy remains honest.
6. Add-business correctly respects shared billing entitlement.
7. Existing repo truth is preserved wherever it already matches the target.
8. No duplicated or conflicting onboarding flow is introduced.
9. No architecture already closed in Gates 11–14 is reopened.

---

# 18. Final product verdict

The correct WizField onboarding model is:

```text
Create my workspace
→ See that it is ready
→ Choose a plan
→ Activate through Stripe
→ Enter the operating system
```

And the engineering truth is:

```text
User identity + first organization + shared billing anchor exist before checkout.
Stripe activates access.
The webhook is authoritative.
The CRM remains locked until activation.
```

This is the correct self-serve activation model for WizField / PhoenixOS SaaS.
