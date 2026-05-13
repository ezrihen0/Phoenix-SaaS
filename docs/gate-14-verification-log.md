# Gate 14 — Verification log

**Gate:** 14 — Launch preparation / public market readiness  
**Workspace:** Phoenix_SaaS  
**Execution date:** 2026-05-12  
**Executor:** Cursor agent (implementation + static audit + builds)

## 1. Dependency gate (G12 / G13)

| Prerequisite | Status | Evidence |
|--------------|--------|----------|
| Gate 12 formally **GO** | **NOT MET** (as of repo state) | [gate-12-verification-log.md](./gate-12-verification-log.md) records **NO-GO** (2026-05-13): isolation smokes failed, matrix A–H not run, self-serve onboarding blocker sustained. |
| Gate 13 formally **PASS** | **NOT RECORDED** | [gate-13-billing-sync.md](./gate-13-billing-sync.md) is strategy text only; no signed PASS table in repo. |

**Interpretation:** Gate 14 artifacts and UI were implemented in this pass under owner instruction to execute the plan; **controlled public launch / paid acquisition** should still be treated as **HOLD** until G12 **GO** and G13 **PASS** are formally recorded.

## 2. Self-serve signup audit (hidden flow search)

| Area | Result |
|------|--------|
| `frontend/app` routes | No `signup`, `register`, or `create-account` pages in the app directory inventory used for Gate 14. |
| `frontend/lib/auth/client-auth.ts` | Exposes `loginWithPassword`, session, org list/switch, password update — **no** registration API client. |
| `backend/src/auth/auth.controller.ts` | `@Post` / `@Get` routes: `login`, `logout`, `session`, `destination`, `organizations`, `active-organization`, `staff` — **no** public signup endpoint. |

**Classification:** **Prior-gate launch blocker** for frictionless trial self-signup. Marketing and login copy **must not** conceal this; `/landing` and `/login` state assisted access explicitly.

## 3. Packages executed (this pass)

| Package | Files touched (summary) |
|---------|-------------------------|
| **G14-P1** | New `(marketing)/layout.tsx`, `landing`, `pricing`, `terms`, `privacy`, `contact` pages; [frontend/app/login/login-form.tsx](../frontend/app/login/login-form.tsx). |
| **Engineering exception** | [frontend/components/app-shell.tsx](../frontend/components/app-shell.tsx) — added public marketing paths to `HIDDEN_PREFIXES` so marketing pages do not render inside CRM chrome (required for usable public surface). |
| **G14-P2** | [frontend/app/home/page.tsx](../frontend/app/home/page.tsx) — operations home headline and next-step hint. |
| **G14-P3** | [frontend/app/layout.tsx](../frontend/app/layout.tsx) — metadata refresh, optional `NEXT_PUBLIC_ANALYTICS_SCRIPT_URL` script; new docs under `docs/gate-14-*.md`. |

**Not changed:** [frontend/app/page.tsx](../frontend/app/page.tsx) (`/` behavior owner decision pending).

## 4. Builds (fill after CI / local run)

| Command | Result | Log snippet |
|---------|--------|-------------|
| `npm run build --workspace frontend` | **PASS** (exit 0) | Next.js 16.2.4 — compiled, TypeScript finished, static generation included `/landing`, `/pricing`, `/terms`, `/privacy`, `/contact`. |
| `npm run build --workspace backend` | **PASS** (exit 0) | `tsc -p tsconfig.build.json` completed successfully. |

## 5. Git hygiene

| Check | Result |
|-------|--------|
| Unrelated files avoided | Gate 14 implementation touched only: `frontend/app/(marketing)/`, `frontend/app/login/login-form.tsx`, `frontend/app/layout.tsx`, `frontend/app/home/page.tsx`, `frontend/components/app-shell.tsx`, and new `docs/gate-14-*.md`. **Note:** `git status` on this machine may still list **other** modified or untracked files from parallel work — those are outside this Gate 14 pass; do not stage them when committing Gate 14. |

## 6. Gate 14 completion verdict (this pass)

**HOLD** — Public marketing routes, honest copy, legal **draft** shells, support note, and checklists are in place, but:

1. Gate 12 is **not GO** per existing verification log.  
2. Gate 13 **PASS** is not formally on file.  
3. Self-serve signup remains a **prior-gate** gap.  
4. Terms/Privacy require **legal replacement** of placeholders before **PASS** for paid acquisition.

When the above are cleared, owner may re-run this log and set **PASS** with sign-off in [gate-14-launch-readiness-checklist.md](./gate-14-launch-readiness-checklist.md).

## 7. Owner acceptance — Gate 14 engineering implementation

**Recorded:** Owner authorized Gate 14 to be executed in **one combined pass** (G14-P1, G14-P2, and G14-P3). The addition of [frontend/components/app-shell.tsx](../frontend/components/app-shell.tsx) (`HIDDEN_PREFIXES` for public marketing routes) is **retroactively approved** as a necessary engineering dependency so marketing URLs render outside the CRM shell.

**Engineering verdict:** Gate 14 **implementation is accepted as complete** for the scoped deliverables (public routes, login/home copy alignment, readiness docs, optional analytics script hook). **No further Gate 14 application code** is required at this stage unless a closeout item below drives a specific implementation need.

### Remaining owner closeout (before “launch-surface fully closed”)

| # | Item | Owner action |
|---|------|----------------|
| 1 | Terms of Service | Replace placeholder copy in [frontend/app/(marketing)/terms/page.tsx](../frontend/app/(marketing)/terms/page.tsx) with final approved legal text. |
| 2 | Privacy Policy | Replace placeholder copy in [frontend/app/(marketing)/privacy/page.tsx](../frontend/app/(marketing)/privacy/page.tsx) with final approved legal text. |
| 3 | Prospect email | Set production **`NEXT_PUBLIC_SUPPORT_EMAIL`** to the real address used for `/contact` mailto links. |

**Note:** Section **6** remains the **program-level** position until Gate 12 **GO** and Gate 13 **PASS** are formally recorded and prior-gate signup expectations are reconciled with go-to-market; owner acceptance above applies to **Gate 14 engineering scope** only.
