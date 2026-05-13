# Gate 11 — P6 regression checklist (multi-business UX)

Run before merging risky auth/session/frontend-fetch changes. Spot-check after Gate 11 UI work.

## Security and tenancy

- [ ] Org switch uses only `POST /api/auth/active-organization` with body `{ organizationId }` (no ad-hoc org header on CRM APIs).
- [ ] After switch, session cookie drives `GET /api/auth/session` — active org matches chosen business.
- [ ] Forbidden switch shows API error message (e.g. `organization_access_forbidden`); no partial UI state pretending success.

## UX

- [ ] Shell shows **Active workspace** for office routes; technician board shows the same when multiple orgs exist.
- [ ] Single active membership: label only, no misleading dropdown.
- [ ] Zero eligible memberships: empty state + link to Settings.
- [ ] Successful switch performs **full navigation** to `/home` (no stale list data from previous org).

## Targeted Gate 10 smokes (after shared client/auth changes)

From repo root, with MySQL and env configured per each harness:

```bash
npm run inspections:isolation:smoke --workspace backend
npm run document-snapshot:isolation:smoke --workspace backend
npm run telephony-messaging:isolation:smoke --workspace backend
npm run public-booking:isolation:smoke --workspace backend
```

Expect each summary `ok: true` (or document skip reason, e.g. no local DB).
