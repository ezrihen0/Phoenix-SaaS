# Mobile Field App V1 — Design Freeze

**Branch:** `feature/field-cockpit-v1`
**Date:** May 27, 2026
**Status:** Release candidate ready for pilot / design review.

---

## Commit Timeline

| Phase | Commit | Description |
|-------|--------|-------------|
| 6B | `0996c3e` | `fix(mobile): restrict add menu to safe job action` |
| 7 | `53ae92f` | `feat(customers): add safe customer creation flow` |
| 7 | `8998c4c` | `feat(mobile): add safe customer shortcut` |
| 10 | `85d70a5` | `feat(mobile): add invoice job shortcut` |
| 11 | `06b7312` | `docs(mobile): record field app v1 functional freeze` |
| DP1 | `7414dfd` | `style(mobile): polish field app v1 experience` |
| DP2 | `ea38260` | `style(mobile): polish operational screens` |
| 12 | `552e495` | `feat(mobile): add safe inspection entry flow` |
| 12B | `ed26a56` | `fix(mobile): hide inspection action for unauthorized roles` |
| 12C | `e4a1977` | `fix(mobile): align inspection shortcut with permissions` |
| 13 | `e56aae1` | `fix(mobile): allow inspection field entry on mobile` |
| 14 | `90bd986` | `feat(inspections): add mobile report workspace` |
| 14D | `ef824bb` | `feat(inspections): support mobile gas report metadata and section labels` |
| 15 | `847caf7` | `feat(inspections): add mobile inspection photos` |

---

## Final Add Menu (by Role)

### Owner / Admin / Office Admin
1. **New Job** → `/jobs/new`
2. **New Customer** → `/customers/new`
3. **Invoice Job** → `/invoices/new`
4. **New Inspection** → `/inspections/new`

### Technician / Dispatcher / CSR / Viewer
1. **New Job** → `/jobs/new`
2. **New Customer** → `/customers/new`
3. **Invoice Job** → `/invoices/new`

> New Inspection is gated by `INSPECTION_CREATE_ROLES = { owner, admin, office_admin }`, matching the backend `inspections.admin` permission exactly.

## Final Dock Order (Locked)
`Home | Schedule | Add | Calls | Messages`

---

## Screens Visually Checked

| Route | Mobile Layout | Dock Safety | Notes |
|-------|--------------|-------------|-------|
| `/home` | ✅ Terminal cockpit with stats + queue | `pb-28` | Queue items have accent border, CTA button has glow shadow |
| `/jobs/new` | ✅ No-context chooser + create form | Handled by AppShell | Theme tokens consistent, no hardcoded colors |
| `/customers/new` | ✅ Clean form with required fields | Handled by BoardShell | Submit button `min-h-12`, subtitle `leading-relaxed` |
| `/invoices/new` | ✅ Customer picker + job list | Responsive tables, `overflow-x-auto` | Contact/Location columns hidden on mobile (`sm:table-cell`, `md:table-cell`) |
| `/schedule` | ✅ Mobile day view with job cards | BoardShell | Already had mobile-specific view, no changes needed |
| `/calls` | ✅ Recovery command desk | `pb-24 lg:pb-8` | Added bottom padding for dock clearance |
| `/inspections/new` | ✅ Mobile creation entry | N/A (standalone page) | Source cards, report type selector, "Open report" CTA |
| `/inspections/[id]/mobile` | ✅ Mobile report workspace | N/A (standalone route) | Section cards, item editing, save, generate/send/PDF |
| `/inspections/[id]/workspace` | ❌ Desktop-only | UA block | Full desktop workspace preserved |
| `/messaging` | ✅ Conversation inbox + thread | `pb-24 lg:pb-0` | Added bottom padding; dual-pane mobile refactor deferred |

---

## Inspection Constraints (Updated)

### Mobile (Phase 14)
- `/inspections/[id]/mobile` — mobile-safe workspace for report editing
- Editable: item status, recommendation text, required fields
- Actions: generate report, preview PDF, send to customer
- No photo upload, no archive/restore, no compliance finalization on mobile

### Desktop-Only
- `/inspections` list page (mobile UA block preserved)
- `/inspections/[id]/workspace` — full desktop workspace (UA block preserved)
- Photo upload/assign, archive/restore, full compliance gate checking
- PDF/report rendering engine unchanged

---

## Design Pass 1 Files Changed
- `frontend/app/invoices/new/page.tsx` — Responsive headings, overflow-x-auto
- `frontend/components/home/mobile-home-board.tsx` — Stats card padding, CTA size, queue items, safe area
- `frontend/app/jobs/new/page.tsx` — Theme token consistency (NoContextPanel)
- `frontend/app/jobs/new/create-job-form.tsx` — Input classes → `theme-input-control`
- `frontend/app/customers/new/page.tsx` — Subtitle readability, button min-height
- `frontend/components/mobile-shell-nav.tsx` — Action sheet button height + min-height

## Design Pass 2 Files Changed
- `frontend/app/jobs/new/create-job-form.tsx` — Hardcoded colors → theme tokens
- `frontend/components/home/mobile-home-board.tsx` — Queue accent always visible
- `frontend/app/invoices/new/page.tsx` — Responsive table column hiding
- `frontend/app/calls/page.tsx` — Bottom padding for dock
- `frontend/app/messaging/page.tsx` — Bottom padding for dock

---

## Intentionally Excluded

| Feature | Reason |
|---------|--------|
| New Estimate in Add | Estimate creation requires job context; current route is a picker only |
| New Inspection in Add | Mobile blocked by design; office-only permission; no standalone route |
| Standalone invoice creation | Invoices are always job-scoped (`PUT /api/jobs/:jobId/invoice`) |
| PWA / Offline / Push | Out of V1 scope |
| Native app | Out of V1 scope |
| Backend changes | None needed for mobile V1 |
| Database / migrations | None needed |
| Package changes | None needed |

---

## Known Remaining Non-Blockers

1. `/messaging` deeper dual-pane mobile refactor is out of scope for V1. Current layout is functional with `pb-24` dock clearance.
2. `/invoices/new` may still use horizontal scroll for some table data on very narrow screens (<375px).
3. Calls page has some hardcoded inline color classes in operational state badge utility functions — these are low priority and affect desktop equally.
4. `/schedule` needed no changes because the existing `MobileScheduleDayView` already provides acceptable mobile layout.
5. The mobile bottom dock uses `pb-[calc(0.6rem+env(safe-area-inset-bottom))]` which is adequate for most devices, but extremely deep safe areas (iPhone 14 Pro Max in landscape) may still overlap slightly.

---

## Release Candidate Status

**✅ Mobile Field App V1 is release-candidate ready.**

All functional feature work is complete. All visual polish passes are applied. Builds pass clean. Working tree is clean. The app is ready for pilot deployment and/or design review.

### Build Verification
- **Frontend:** Next.js 16.2.4 (Turbopack) — 40 static pages, 0 TypeScript errors
- **Backend:** `tsc -p tsconfig.build.json` — 0 errors

### Next Recommended Action
Pilot deployment or design stakeholder review. No further feature or polish work needed for V1.
