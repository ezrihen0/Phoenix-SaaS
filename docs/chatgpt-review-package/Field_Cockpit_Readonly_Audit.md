# Field Cockpit Read-only Audit

Workspace: `C:\Projects\WizField-App`  
Date: 2026-05-27

## 1) Current branch and git status

`git branch --show-current`

```txt
feature/field-cockpit-v1
```

`git status --short`

```txt
(clean working tree)
```

## 2) Route map

| Route | Page file | Main component file | Child components imported | Mobile-specific behavior | UI patterns |
|---|---|---|---|---|---|
| `/home` | `frontend/app/home/page.tsx` | `frontend/app/home/page.tsx` | `MobileHomeBoard`, `TechnicianHomeBoard`, `HomeIntelligenceStrip`, `BoardShell` | Yes (`lg:hidden` mobile board, `hidden lg:block` desktop executive board) | Cards/panels, metric tiles, link actions |
| `/jobs` | `frontend/app/jobs/page.tsx` | `frontend/app/jobs/jobs-workspace.tsx` | `MobileJobsFieldCommand`, `BoardShell`, `MetricTile`, `SectionFrame` | Yes (dedicated mobile field command below `lg`) | Mobile cards + detail pane, desktop command panels/forms |
| `/schedule` | `frontend/app/schedule/page.tsx` | `frontend/app/schedule/schedule-workspace.tsx` | `MobileScheduleDayView`, `BoardShell`, `MetricTile`, `ScheduleEditor` | Yes (mobile day-list below `lg`) | Day/week controls, cards, editor panel |
| `/leads` | `frontend/app/leads/page.tsx` | `frontend/app/leads/leads-workspace.tsx` | `LeadsCommandHeader`, `LeadsKpiStrip`, `LeadsPipelineBoard`, `LeadTriagePanel`, `MobileLeadsOperatorFeed`, `MobileLeadsOperatorActionBar`, `MasterTable` | Yes (mobile feed/action bar + desktop table modes) | Table, cards/feed, mode toggles, modal-like intake/edit panels |
| `/calls` | `frontend/app/calls/page.tsx` | `frontend/app/calls/page.tsx` | `CallRowActions`, `CallbackTaskControl`, `QueueCallbackRequestControl`, `CallsCopilotSmsDraft`, `BoardShell`, `MetricTile` | Partial responsive behavior, but no dedicated mobile field shell | Heavy table + hybrid/grid card views + focus panel |
| `/messaging` | `frontend/app/messaging/page.tsx` | `frontend/app/messaging/messaging-dashboard.tsx` | Internal `DeskThreadPanel` + lane/thread/composer surfaces | Yes (`mobileDeskPane`, mobile context bottom sheet/dialog) | Split inbox/thread, cards, dialog sheet, template modal |
| `/customers` | `frontend/app/customers/page.tsx` | `frontend/app/customers/page.tsx` | `DesktopOptimizedNotice`, `MasterTable`, `MasterMobileList`, `MasterTablePagination`, `BoardShell` | Yes (`lg:block` table, `lg:hidden` cards) | Table, cards, pagination, filter chips |

## 3) Component tree summary

### `/home`
- Top-level component: `HomePage` (server component).
- Key children: `MobileHomeBoard`, `OwnerExecutiveDesk`, `TechnicianHomeBoard`.
- Data/state hooks: server role/session branching (`requireServerSession`).
- API/helper calls: `serverApiFetch('/api/dashboard')`, `fetchBrainHomeBriefSilent()`, `canAccessShellHref`.
- Mobile vs desktop: explicit breakpoint split (`lg:hidden` and `hidden lg:block`).

### `/jobs`
- Top-level component: `JobsWorkspace` (client component).
- Key children: `MobileJobsFieldCommand` -> `MobileJobCard`, `MobileJobDetailPane`; desktop board panels in same file.
- Data/state hooks: large client state (`useState`, `useMemo`, `useEffect`, `useTransition`) for queue, detail, status actions.
- API/helper calls: `crmApiFetch('/api/dashboard')`, `crmApiFetch('/api/jobs/:id')`, `crmApiFetch('/api/jobs/:id/status')`.
- Mobile vs desktop: dedicated mobile command surface and desktop-only shell section.

### `/schedule`
- Top-level component: `ScheduleWorkspace` (client component).
- Key children: `MobileScheduleDayView`, `ScheduleEditor`, metric/control panels.
- Data/state hooks: `useState`, `useMemo`, `useEffect`, `useTransition` (date, day/week mode, selected job, paging).
- API/helper calls: refresh/save through `crmApiFetch('/api/jobs')` and `crmApiFetch('/api/jobs/:id')`.
- Mobile vs desktop: mobile day-list under `lg`; desktop control center in `hidden lg:block`.

### `/leads`
- Top-level component: `LeadsWorkspace` (client component).
- Key children: `LeadsCommandHeader`, `LeadsKpiStrip`, `LeadsPipelineBoard`, `LeadTriagePanel`, `MobileLeadsOperatorFeed`, `MasterTable`.
- Data/state hooks: heavy state for filters/search/editing/intake/mode/pagination.
- API/helper calls: `crmApiFetch('/api/leads')`, `crmApiFetch('/api/leads/:id')`, create/update lead actions.
- Mobile vs desktop: mobile operator feed + desktop table/board modes.

### `/calls`
- Top-level component: `CallsPage` (server component).
- Key children: `CallRowActions`, `QueueCallbackRequestControl`, `CallbackTaskControl`, `CallsCopilotSmsDraft`.
- Data/state hooks: primarily server-rendered with action controls delegated to child components.
- API/helper calls: `serverApiFetch('/api/recent-calls...')`, `serverApiFetch('/api/telephony/callback-task-assignees')`.
- Mobile vs desktop: responsive visibility exists, but information density remains desktop-oriented.

### `/messaging`
- Top-level component: `MessagingDashboard` (client component).
- Key children: `DeskThreadPanel`, lane list, thread panel, template bank modal.
- Data/state hooks: many hooks (`useState`, `useMemo`, `useEffect`, `useRef`) for lane/thread/composer/template state.
- API/helper calls: `crmApiFetch` across `/api/messaging/txt/*`, `/api/customers`, conversation short-link, template endpoints.
- Mobile vs desktop: explicit mobile pane model (`inbox`/`thread`) plus mobile dialog sheet.

### `/customers`
- Top-level component: `CustomersPage` (server component).
- Key children: `DesktopOptimizedNotice`, `MasterTable`, `MasterMobileList`, pagination.
- Data/state hooks: server-driven filtering/pagination from query params.
- API/helper calls: `serverApiFetch('/api/customers')`.
- Mobile vs desktop: desktop table vs mobile cards split by breakpoint.

## 4) Field Cockpit evaluation

### `/home`
- 5-second field action: jump to Jobs/Calls/Leads from mobile quick cards.
- Too much scrolling: follow-up + stacked summary cards can get long.
- Action-first today: moderate.
- Admin-heavy/desktop-first: executive analytics and pressure panels.
- Missing for one-thumb use: pinned “next action” + “resume last active job”.

### `/jobs`
- 5-second field action: open list, tap job, call/maps/open job.
- Too much scrolling: long queue + filters + paging.
- Action-first today: strong on mobile detail pane.
- Admin-heavy/desktop-first: status transition cockpit and dense office controls.
- Missing for one-thumb use: faster chip filters and sticky primary action from list.

### `/schedule`
- 5-second field action: Today list, prev/today/next, tap item for detail.
- Too much scrolling: high-volume day lists.
- Action-first today: good for daily execution.
- Admin-heavy/desktop-first: week-pressure analytics + schedule editor.
- Missing for one-thumb use: quicker “next stop” emphasis and technician quick-filter chips.

### `/leads`
- 5-second field action: scan mobile feed, open triage/edit.
- Too much scrolling: dense lead feeds at scale.
- Action-first today: medium.
- Admin-heavy/desktop-first: table modes and full editing workflow.
- Missing for one-thumb use: per-card quick action row (call/message/schedule).

### `/calls`
- 5-second field action: see missed-call pressure, queue callback.
- Too much scrolling: high (table-first data density).
- Action-first today: medium/low for field ergonomics.
- Admin-heavy/desktop-first: high.
- Missing for one-thumb use: dedicated compact mobile triage lane.

### `/messaging`
- 5-second field action: open thread and reply quickly.
- Too much scrolling: long threads + template management surface.
- Action-first today: medium/high for core messaging.
- Admin-heavy/desktop-first: template governance and deep compose controls.
- Missing for one-thumb use: reduced control density + persistent quick-reply chips.

### `/customers`
- 5-second field action: call/message/open profile directly from card.
- Too much scrolling: large directory/filter combinations.
- Action-first today: medium.
- Admin-heavy/desktop-first: profile depth and table-heavy browsing.
- Missing for one-thumb use: “recent customers” pin + direct “open active jobs” CTA.

## 5) Global search audit

Reviewed:
- `frontend/features/global-search/*`
- `frontend/lib/search/*`

Summary:
- Entities searched: `jobs`, `customers` (from `global-search-contract` and `use-global-search` flattening).
- Action paths supported: result `destination` navigation via click/Enter.
- Transport path: `fetchGlobalSearch` -> `/api/search?q=...`.
- Mobile command-surface viability: high (`GlobalSearchShell` already supports `mode='sheet'` with safe-area-aware full-screen UI).
- Core files if used in Field Cockpit:
  - `frontend/features/global-search/global-search-shell.tsx`
  - `frontend/features/global-search/global-search-combobox.tsx`
  - `frontend/features/global-search/global-search-results.tsx`
  - `frontend/features/global-search/use-global-search.ts`
  - `frontend/lib/search/global-search-client.ts`
  - `frontend/lib/search/global-search-contract.ts`
  - `frontend/lib/search/global-search-validation.ts`
  - `frontend/features/global-search/global-search.constants.ts`

## 6) Home Cockpit opportunity

Recommended mobile-first order:
1. Immediate “Today Now” strip (jobs today, active jobs, urgent follow-ups).
2. Top 3 action cards (next job path, calls recovery, schedule entry).
3. One-thumb CTA row (`Jobs`, `Schedule`, `Calls`, `Search`).

Hide behind details:
- Deep pressure analytics and long executive summaries.
- Extended follow-up lists beyond top 3.

CTA buttons that should exist:
- Resume last active job.
- Open today schedule.
- Start callback recovery.
- Open command search.

Data already available now:
- Dashboard summary counts, follow-ups, quote/invoice signals, role-aware route access.

Data that appears missing for stronger cockpit:
- User-specific “my next task/job” priority signal.
- Last-opened operational context shortcut.
- Explicit urgency ranking per row for one-thumb triage.

## 7) Recommended Slice 1 (smallest safe implementation)

- Business goal:
  - Make mobile Home a true field launchpad with <5-second path to next action.

- User flow:
  - Login -> mobile Home cockpit -> tap top action card or command search -> open actionable record.

- Exact files likely needed:
  - `frontend/components/home/mobile-home-board.tsx`
  - `frontend/app/home/page.tsx`
  - `frontend/features/global-search/global-search-shell.tsx`
  - `frontend/features/global-search/global-search-combobox.tsx`
  - `frontend/features/global-search/global-search-results.tsx`
  - `frontend/features/global-search/use-global-search.ts`
  - `frontend/lib/search/global-search-client.ts`
  - `frontend/messages/en.ts`

- Files that must not be touched:
  - `backend/**`
  - auth/server-session and permission internals
  - database/migrations
  - billing logic
  - package/deployment files

- Risk level:
  - Low/Medium (frontend composition + prioritization only).

- Test plan:
  - Mobile widths: 375/390/430/768.
  - Role coverage: owner/admin/office_admin/dispatcher/technician.
  - Validate CTA navigation, search sheet behavior, and no bottom-nav overlap.
  - Confirm desktop home behavior remains unchanged.

- Rollback point:
  - Revert Slice 1 cockpit commits only (no backend contract change needed).

## 8) Next file request (max 8 for Slice 1 review)

1. `frontend/components/home/mobile-home-board.tsx`
2. `frontend/app/home/page.tsx`
3. `frontend/features/global-search/global-search-shell.tsx`
4. `frontend/features/global-search/global-search-combobox.tsx`
5. `frontend/features/global-search/global-search-results.tsx`
6. `frontend/features/global-search/use-global-search.ts`
7. `frontend/lib/search/global-search-client.ts`
8. `frontend/messages/en.ts`
