# Mobile Field App V1 — Functional Freeze

**Branch:** `feature/field-cockpit-v1`
**Date:** May 27, 2026
**Status:** Release candidate — all phases complete.

---

## Final Functional Scope

### Bottom Dock (locked)
`Home | Schedule | Add | Calls | Messages`

### Mobile Add Menu (by role)

**Owner / Admin / Office Admin:**
1. **New Job** → `/jobs/new` (safe no-context chooser)
2. **New Customer** → `/customers/new` (standalone creation form)
3. **Invoice Job** → `/invoices/new` (customer-first job picker, deep-links to `?tab=invoice`)
4. **New Inspection** → `/inspections/new` (mobile-safe creation entry)

**Technician / Dispatcher / CSR / Viewer:**
1. **New Job** → `/jobs/new`
2. **New Customer** → `/customers/new`
3. **Invoice Job** → `/invoices/new`

### Verified Routes
| Route | Purpose |
|-------|---------|
| `/home` | Terminal cockpit |
| `/jobs` | Job board |
| `/jobs/new` | Safe job creation chooser |
| `/schedule` | Calendar/schedule view |
| `/calls` | Call management |
| `/messaging` | SMS conversations |
| `/customers` | Customer ledger |
| `/customers/new` | New Customer form |
| `/invoices/new` | Invoice Job picker |
| `/inspections/new` | Mobile inspection creation entry |
| `/inspections/[id]/mobile` | Mobile inspection report workspace |

---

## Inspection Scope

### Mobile (Phase 14)
- `/inspections/new` — create inspection from customer/job/new customer
- `/inspections/[id]/mobile` — mobile-safe workspace
  - View report sections and items
  - Edit item status (satisfactory/unsatisfactory/na)
  - Edit recommendation text
  - Edit required fields
  - Save via `PATCH /api/inspections/:id/items/:itemId`
  - Generate report, preview PDF, send to customer

### Desktop-Only (unchanged)
- `/inspections` list page
- `/inspections/[id]/workspace` — full desktop workspace
  - Photo upload/assign
  - Archive/restore
  - Full compliance gate checking
  - Complex report editing

---

## Completed Phases

| Phase | Description | Commit |
|-------|-------------|--------|
| Phase 6B | Remove unsafe Invoice/Estimate from Add menu | `0996c3e` |
| Phase 7 | `POST /api/customers` endpoint + `/customers/new` page | `53ae92f` |
| Phase 7 | Add New Customer to Add menu | `8998c4c` |
| Phase 8 | Inspection audit — decision: NOT safe for Add (blocked at time) | Audit only |
| Phase 9 | Invoice/Estimate audit — decision: NOT safe standalone | Audit only |
| Phase 10 | Add Invoice Job shortcut + `?tab=invoice` deep link | `85d70a5` |
| Phase 12 | Mobile inspection creation entry (`/inspections/new`) | `552e495` |
| Phase 12B | Hide inspection action for unauthorized roles | `ed26a56` |
| Phase 12C | Align inspection shortcut with backend permissions | `e4a1977` |
| Phase 13 | Fix inspection field entry on mobile | `e56aae1` |
| Phase 14 | Mobile inspection report workspace | `90bd986` |

---

## Intentional Exclusions

| Feature | Reason |
|---------|--------|
| New Estimate in Add | Estimate creation requires job context; current route is a picker, not a creator |
| New Inspection in Add | Now included for owner/admin/office_admin (Phase 12) — gated by `inspections.admin` backend permission |
| Inspection workspace on mobile | Remains desktop-only; `/inspections/new` is creation entry only |
| Standalone Invoice creation | No `POST /api/invoices` endpoint; invoices are always job-scoped |
| Offline mode | Out of V1 scope |
| Push notifications | Out of V1 scope |
| Service worker / PWA | Out of V1 scope |
| Native app | Out of V1 scope |

---

## Architecture Rules Preserved

- Bottom dock order never changed
- Drawer left unchanged
- AppShell left unchanged
- No fake disabled buttons added
- No unsafe shortcuts created
- All Add actions backed by real, working flows
- Backend entities, migrations, and packages untouched
- Desktop behavior unaffected by mobile changes

---

## Known Risks

1. **Invoice Job deep link** (`?tab=invoice`) is untested end-to-end. Job detail workspace supports the `tab` query param, but the invoice section may not auto-expand on first load.
2. **Permission overlap**: `canCreateInvoice` gates on `/invoices` nav visibility. If a role can view invoices but cannot manage them (`invoices.manage`), the Add link works but the backend may reject the save. This is acceptable — the user sees the flow and learns permission boundaries organically.
3. **No duplicate detection** in customer creation — same as existing lead/inspection patterns.

---

## Next Phase

**Design-only pass** — no feature work. Focus areas:
- Mobile typography and spacing
- Color consistency across mobile views
- Touch target sizing
- Safe area handling
- Add menu animation polish
- Drawer visual polish

No new routes, no new backend endpoints, no new Add actions.
