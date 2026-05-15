# WizField AI — Sales Enablement Risk Register

**Purpose:** Keep demos, videos, website copy, and partner conversations **honest** against current product truth. Aligns with [WizField_Master_Source_of_Truth.md](WizField_Master_Source_of_Truth.md), [WizField_AI_Master_Source_of_Truth.md](WizField_AI_Master_Source_of_Truth.md), and [WizField_Growth_Center_Source_of_Truth.md](WizField_Growth_Center_Source_of_Truth.md).

**How to use:** Before any external AI messaging, scan **Forbidden now** and **Allowed with qualifier**. If unchecked, do not ship copy.

---

## 1. Forbidden claims (current build + near-term integrity)

| # | Forbidden language / claim | Why it is wrong or dangerous |
|---|-----------------------------|------------------------------|
| F1 | “AI reads all your portal conversations / customer chat in the portal” | **No portal conversation analytics pipeline** is defined in repo truth; portal is token/magic-link/session scoped — add product + logging first |
| F2 | “AI auto-posts to Google / Facebook / Meta for you” | **Violates Growth Center rule:** publishing is **explicit** via publish jobs — [Growth Center SoT §1](WizField_Growth_Center_Source_of_Truth.md) |
| F3 | “Autonomous scheduling / dispatch — AI moves your techs” | **Out of bounds** for early phases; dispatch is human-operated product; AI may **suggest**, not execute |
| F4 | “Self-learning AI that gets smarter every day automatically” | Phase 4 adds **read-only** SMS reply observation in-thread — **not** autonomous learning, model retraining, or causal ROI claims — use A6 wording instead |
| F5 | “Guaranteed ROI / guaranteed lead volume from AI” | Unsupported; field-service variance too high |
| F6 | “AI updates your pricebook / pricing automatically” | Not in Brain V1 or foundation — pricing is high-risk and permission-gated |
| F7 | “AI sends SMS/email to customers without you” | Phase 2+ requires **explicit send** confirmation — no silent outbound |
| F8 | “Full AI phone replacement for your staff 24/7” | **Phase 1.5** is a **bounded pilot SKU**, not full replacement; escalation required |
| F9 | “AI books jobs into the calendar with firm commitments” | Voice/intake pilots must avoid **reckless scheduling commits** unless policy-approved + human-ready |
| F10 | “Cross-business insights across all your organizations at once” | **Violates tenant isolation narrative** unless an explicit audited multi-org product exists |

---

## 2. Allowed with qualifiers (safe patterns)

| # | Allowed idea | Required qualifier |
|---|----------------|---------------------|
| A1 | “Money at risk / unpaid invoice focus” | “Based on invoices marked unpaid **in your WizField workspace** — verify totals before acting.” |
| A2 | “Stale estimates / waiting on customer” | “Based on estimates in **sent** status in CRM — rules configurable; not legal advice.” |
| A3 | “Follow-up reminders” | “Highlights records by status — **you** decide when to reach out.” |
| A4 | “Growth suggestions” | “Drafts or opportunities still require **your review**; WizField does not auto-publish.” |
| A5 | “Voice intake (pilot)” | “**Pilot program** — answers/clarifies under script; escalates humans; **no** guaranteed price/time promises.” |
| A6 | “Gets better over time” / “Did the customer reply?” | “Copilot can show **whether an inbound SMS arrived in the same thread after your sent message** (observation only). Product improvements come from **releases we ship**, not magic self-learning.” |

---

## 3. Voice-specific script guardrails

Use in decks and demos:

1. Voice is **Voice Intake Intelligence — pilot**, not “WizField = phone bot.”
2. Pilot **does not require** years of CRM history — outcomes improve as data compounds (master program owner decision — record honestly).
3. Show **handoff**: caller can reach a human / callback path.
4. Show **refusal**: price, warranty, definite booking → defer or escalate.

---

## 4. Growth Center coupling rules

| Topic | Risk | Safe line |
|-------|------|-----------|
| Campaigns | Implies autopublish | “Plan and draft in WizField; you choose when to publish.” |
| Opportunities | Implies robotic posting | “Surfaces ideas from operational signals; publisher roles convert to drafts.” |

---

## 5. Competitive truth boundaries

When comparing to generic CRM AI:

- WizField AI is anchored in **tenant-scoped operational records** already in CRM (calls, jobs, invoices, estimates, Growth opportunities) — **not** a pasted-in chatGPT window.
- **Permissions** mirror existing roles — AI does not invent super-admin access.

---

## 6. Review cadence

- Revisit this register when **shipping:** Brain V1, Voice pilot, Copilot drafts, Growth AI copy.
- Owner / PM signs: “Register reviewed on {date} for {surface}.”

---

## References

- [WizField_AI_Master_Source_of_Truth.md](WizField_AI_Master_Source_of_Truth.md)
- [WizField_AI_Brain_V1_Home_Intelligence_SPEC.md](WizField_AI_Brain_V1_Home_Intelligence_SPEC.md)
- [docs/AI_WORKFLOW_RULES.md](AI_WORKFLOW_RULES.md)
