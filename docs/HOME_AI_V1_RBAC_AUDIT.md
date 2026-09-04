# HOME AI V1 — Pre-Implementation Audit

> **HISTORICAL — pre-implementation audit.**  
> Current Home AI truth is [WizField_AI_Master_Source_of_Truth.md](WizField_AI_Master_Source_of_Truth.md) §1A.  
> Verification: [WIZFIELD_PRODUCTION_CLOSEOUT.md](audit/production-2026-09/WIZFIELD_PRODUCTION_CLOSEOUT.md).  
> Do not treat the gaps below as open product work.

## Current `/home`

- Route: `frontend/app/home/page.tsx`
- Office roles: SSR `/api/dashboard` + optional Brain brief; desktop executive desk vs mobile link board
- Technicians: client `/api/technician/dashboard`
- AI chat panel exists but is owner/admin-only, stateless, and uses preloaded dashboard context (not tool router)

## Reuse (do not duplicate)

| Layer | Location |
|-------|----------|
| Session / org | `AuthService.loadActorContextByUserId`, `request.actor.organization_id` |
| Permissions | `backend/src/auth/permissions.ts`, `listPermissionsForMembership` |
| Resource scope | `canAccessJobResource`, `canAccessEstimateResource`, `canAccessInvoiceResource` |
| DeepSeek | `AiDeepSeekProviderService` |
| Telemetry | `AiActionTelemetryService`, `ai_recommendation_runs` |
| CRM snapshot | `CrmOfficeDashboardService.loadOfficeDashboardSnapshot` |
| Brain (legacy) | `AiBrainBriefService` — keep; HOME V1 replaces primary UX |

## Gaps addressed by HOME V1

1. AI-first `/home` shell with conversation persistence per user + organization
2. Server-side read-only tool router with exactly six CRM tool families
3. Permission enforcement per tool call (not UI-only)
4. Role-aware AI behavior profiles (prioritization only, not authorization)
5. Four independent summary widgets with real API data
6. Safe record links from structured tool results

## Permission mapping (schedule)

No `schedule.view` key exists today. HOME V1 maps schedule reads to `jobs.view` or assigned job permissions consistent with `/schedule` UI.
