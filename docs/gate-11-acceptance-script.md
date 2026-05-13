# Gate 11 — Owner acceptance script (G11-FINAL)

**Purpose:** Sign off Multi-Business User Experience after Gate 11 implementation.  
**Prerequisites:** Test user with **two or more** active organization memberships (different org names). Optional: second user with exactly one org.

## A. Visibility (shell)

1. Sign in as multi-org user on an office role (e.g. owner).
2. Open any shell route (e.g. `/home`, `/customers`).
3. **Pass:** Header shows **Active workspace** and the current organization name matches the business you expect.

## B. Single-org simplicity

4. Sign in as a user with **one** active membership.
5. **Pass:** Workspace name visible; **no** org dropdown (no chevron menu for switching).

## C. Switching (multi-org)

6. Open the workspace control; note current org name and a short identifying row on `/customers` or `/jobs` (count or first row label if safe).
7. Switch to a **different** organization via the menu.
8. **Pass:** Browser navigates to **`/home`**; session reflects new org name in header; lists on `/customers` (or chosen list) match the **new** org (not the previous).

## D. Forbidden / error

9. (Optional, if testable via API client) Attempt `POST /api/auth/active-organization` with an org UUID the user does **not** belong to.
10. **Pass:** Request fails with a clear error; UI would show that message if triggered from a broken client.

## E. Technician persona

11. Sign in as a user whose destination is **`/technician`** (technician role).
12. **Pass:** Technician header shows **Active workspace**; with multiple orgs, switch behaves as in C (lands on `/home` after switch — office or technician home per session).

## F. Deep link / stale view

13. On org A, open a **detail** URL (e.g. a customer or job id from org A).
14. Use switcher to move to org B.
15. **Pass:** You are on `/home` for org B; navigating manually to org A’s bookmarked id yields **not found** or forbidden from API (no data from org A shown as org B).

## G. Regression spot (optional if DB available)

16. Run the four commands in [gate-11-p6-regression-checklist.md](./gate-11-p6-regression-checklist.md) “Targeted Gate 10 smokes” section.
17. **Pass:** All `ok: true` or recorded skip.

---

**Closure:** Record date, tester, PASS/FAIL per section, and attach smoke JSON or logs if run. Any FAIL is a Gate 11 blocker until fixed or scope is formally adjusted.
