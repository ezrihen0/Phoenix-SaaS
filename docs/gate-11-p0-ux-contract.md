# Gate 11 — P0 UX and technical contract (Multi-Business)

**Status:** Implemented baseline for G11-P1–P6.  
**Baseline:** Gate 10 closed; org switching is server-validated via `POST /api/auth/active-organization` ([backend/src/auth/auth.controller.ts](../backend/src/auth/auth.controller.ts)).

## 1. Source of truth

- **Active tenant** comes only from the **session** returned by `GET /api/auth/session` (`active_organization`, `active_membership`), populated by the backend from `active_organization_id` on the auth session row.
- The client **never** chooses an organization for API authorization by passing a free-form org id on tenant CRM routes; org context is implied by the session cookie after login/switch.

## 2. Where the current business appears

| Surface | Behavior |
|---------|----------|
| **Main CRM shell** ([frontend/components/app-shell.tsx](../frontend/components/app-shell.tsx)) | `OrganizationSwitcher` shows the active organization name (or a clear empty state). |
| **Technician board** ([frontend/app/technician/technician-workspace.tsx](../frontend/app/technician/technician-workspace.tsx)) | Same component in `technician` variant so field users see the active workspace outside the shell. |

## 3. Switcher visibility (0 / 1 / many)

| Memberships eligible to switch | UI |
|---------------------------------|-----|
| **0** active, in-business orgs (`status === "active"` and `organization.is_active`) | Message: no workspace available; link to **Settings** if signed in. |
| **1** | Read-only label of current org (no dropdown). |
| **2+** | Dropdown (or menu) listing eligible orgs; changing selection calls **`setClientActiveOrganization`** only. |

## 4. Post–org-switch navigation (reload semantics)

- On **successful** switch: perform a **full page navigation** to **`/home`** (`window.location.assign("/home")`).
- **Rationale:** Clears client component state, in-flight lists, and any module-level caches so CRM lists cannot show stale rows from the previous org. `/home` renders the correct office vs technician dashboard from server session.
- **Technician route:** After switch from `/technician`, user still lands on `/home`; if the new membership is technician-only, home shows the technician dashboard.

## 5. Deep-link and cross-org matrix (client)

| Situation | Expected behavior |
|-----------|---------------------|
| User switches org while on a detail URL (e.g. `/customers/:id`) | Full reload to `/home`; user re-navigates. Stale detail view from old org is not retained. |
| User bookmarks a URL in org A, session is org B | Server returns **404 / forbidden** for resources outside org B; UI shows API error message. No silent data from org A. |
| Invalid switch (not a member) | Backend **`organization_access_forbidden`**; UI shows returned **message** from `authFetch`. |

Server-side enforcement remains authoritative (Gate 10); this contract only defines **client** coherence after switch.

## 6. Error copy alignment

| Code (examples) | User-facing direction |
|-----------------|------------------------|
| `organization_access_forbidden` | Show API `error.message` (non-leaky). |
| `organization_id_required` | Same. |
| `unauthenticated` | Redirect to login (existing flows). |

## 7. Route inventory (authenticated CRM shell)

Shell is shown for all app routes **except** prefixes in `HIDDEN_PREFIXES` in `app-shell.tsx`: `/access`, `/book`, `/login`, `/portal`, `/reset-password`, `/technician`, `/warranty-certificate`.

**Shell-covered app pages (representative):** `/`, `/home`, `/jobs`, `/jobs/new`, `/jobs/[jobId]`, `/customers`, `/customers/[customerId]`, `/leads`, `/inventory`, `/pricebook`, `/pricebook/new`, `/pricebook/[itemId]`, `/pricebook/bundles`, `/pricebook/bundles/[bundleId]`, `/invoices`, `/invoices/new`, `/invoices/[invoiceId]`, `/estimates`, `/estimates/new`, `/estimates/[estimateId]`, `/calls`, `/messaging`, `/messaging/[conversationId]`, `/inspections`, `/inspections/[inspectionId]/workspace`, `/automations`, `/dispatch`, `/schedule`, `/settings`, `/admin/import/customers`.

**Outside shell (no switcher in chrome):** `/technician` (switcher embedded in workspace), `/book`, `/book/[organizationSlug]`, `/login`, `/portal`, `/access/[token]`, `/reset-password`, `/warranty-certificate` (and similar).

## 8. Telephony / office alignment

- **Calls** and **Messaging** in the shell use the same **session active org** as the rest of CRM; telephony APIs use `ActorContext.organization_id` on the server ([backend/src/telephony/telephony-org-scope.ts](../backend/src/telephony/telephony-org-scope.ts)).
- No separate “telephony org id” in the client for Gate 11; office users switch org once, then open Calls.

## 9. Non-goals (unchanged)

Billing, pricing, new auth protocols, full redesign, broad Gate 10 refactors except hotfixes.
