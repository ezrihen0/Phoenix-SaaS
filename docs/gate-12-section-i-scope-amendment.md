# Gate 12 — Section I scope amendment (Path B)

**Status:** Formal owner-approved amendment for **this Gate 12 limited-beta closure attempt only**.  
**Date recorded:** 2026-05-13  
**Gate:** 12 only. **Does not cancel** future self-serve product work.

---

## 1. Amended acceptance criteria (Section I)

For the **current** Gate 12 closure in the **development/test** environment, the following **original** Gate 12 Section **I** requirements are **waived**:

| Item | Original requirement | Amendment |
|------|----------------------|-----------|
| **I1** | Self-serve **signup** (public registration) must be demonstrated | **Waived** for this closure. Users may be **mock, admin-provisioned, or seed-created**. |
| **I2** | Self-serve **first-organization creation** must be demonstrated | **Waived** for this closure. Organizations may be **mock, admin-provisioned, or seed-created**. |
| **I5** | Self-serve **second-organization creation** must be demonstrated | **Waived** for this closure. Second org membership for User1 may be **mock, admin-provisioned, or seed-created**. |

**Unchanged (mandatory):**

- **I3, I4, I6** (and all of Sections **A–H**): Owner membership correctness, active-org alignment, org switching, **full tenant isolation**, org-switch regression, public booking, portal, search/dashboard, telephony (where applicable), settings/branding/docs, and **all four isolation smokes** — must still **PASS** under the **mock/seed 3-org topology** (User1 → Org A + Org B; User2 → Org C) per the matrix and owner script.

**Limited-beta verification model (this closure):**

- Users and organizations **may** be mock, admin, or seed provisioned.  
- Topology: **User1** → active memberships in **Org A** and **Org B**; **User2** → active membership in **Org C** only.  
- All **tenant-isolation**, **org-switching**, **public booking**, **portal**, **search/dashboard**, and **smoke** requirements remain **mandatory** and **not** relaxed.  
- This amendment **does not** remove the obligation for **mandatory domain + backend re-verification** after a real public domain and production-like backend are in use (see [gate-12-beta-readiness-security-audit.md](./gate-12-beta-readiness-security-audit.md) §1a).

---

## 2. Relationship to mock/seed and deployment asterisk

- **Mock/seed fixture policy** (§1a fixture paragraph in the audit) remains in force: fixtures need not be real external beta users.  
- **Mandatory domain + backend re-verification (*)** remains in force unchanged.

---

## 3. Future product work

Waiving **I1 / I2 / I5** for this Gate 12 closure **does not** defer or cancel product initiatives to add self-serve signup or self-serve org creation; those remain **product roadmap** items outside this gate’s amended acceptance.
