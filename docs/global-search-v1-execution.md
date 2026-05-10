# Global Search v1 Execution Tracker

Status markers:
- [ ] Not Started
- [~] In Progress
- [x] Completed

## Scope
Track execution progress for Global Search v1 only.

Included:
- Backend isolated search module
- One search endpoint
- Backend-only normalization
- Jobs + customers only
- Frontend search feature module
- Minimal integration touch
- Validation

Excluded:
- CRM core refactors
- Dashboard reuse
- Leads, invoices, estimates
- Database schema changes
- Auth/session redesign
- Config/deployment changes

## Phase 1 — Backend

- [x] Create search module folder structure  
  Description: Create the isolated backend search feature structure under backend/src/search/ with controller, service, adapters, types, contract, and destination map files.  
  Done when: all planned backend search files exist in the isolated module folder and no CRM core files have been modified except allowed registration wiring.

- [x] Register SearchModule in app.module.ts  
  Description: Add the isolated search module to the backend application module so the endpoint can be served.  
  Done when: SearchModule is imported and registered in backend/src/app.module.ts and no other backend core file is changed.

- [x] Define search request and response contract  
  Description: Establish the final Global Search v1 request and grouped response schema for jobs and customers, including meta fields.  
  Done when: the backend contract file exists and the controller/service use the same contract consistently.

- [x] Implement office-only search controller  
  Description: Add one dedicated GET /api/search endpoint in the isolated module, using existing auth/session patterns without modifying core auth code.  
  Done when: the endpoint is reachable, restricted to office users, and delegates all business logic to the search service.

- [x] Implement search orchestration service  
  Description: Build the service that validates query input, runs entity searches in parallel, applies backend-only normalization, and assembles meta.partial, meta.errors, and meta.tookMs.  
  Done when: the service returns a valid grouped response for jobs and customers and no frontend normalization is required.

- [x] Implement jobs search adapter  
  Description: Add the isolated jobs adapter that performs jobs search using indexed fields only, candidate caps, returned-hit caps, and timeout handling.  
  Done when: jobs results are returned within the contract limits and the adapter does not rely on dashboard or page endpoints.

- [x] Implement customers search adapter  
  Description: Add the isolated customers adapter that performs customer search using indexed fields only, candidate caps, returned-hit caps, and timeout handling.  
  Done when: customer results are returned within the contract limits and the adapter does not rely on dashboard or page endpoints.

- [x] Implement backend-only normalization  
  Description: Ensure all result shaping, grouping, destination assignment, status mapping, and meta generation happen on the backend only.  
  Done when: the frontend client can validate and return the response unchanged.

- [x] Enforce hard query rules  
  Description: Enforce minimum query length, empty-query rejection behavior, whitespace trimming, and case-insensitive handling on the backend.  
  Done when: invalid queries are handled consistently and valid queries return deterministic results.

- [x] Enforce hard data-volume limits  
  Description: Apply candidate caps, returned-hit caps, indexed-field-only predicates, and no-full-table-scan safeguards for jobs and customers.  
  Done when: each entity search stays within defined limits and the implementation does not perform unrestricted scans.

- [x] Enforce hard timeout behavior  
  Description: Apply per-entity and total backend timeouts and return partial responses with meta.errors when timeouts occur.  
  Done when: timeout behavior is observable in the response contract and does not crash the whole request.

- [x] Add destination map ownership  
  Description: Centralize destination generation for jobs and customers in a single backend destination map.  
  Done when: all destination values come from one backend-controlled map and are not composed ad hoc in multiple places.

- [x] Add backend observability for search  
  Description: Record requestId, tookMs, per-entity timing, partial state, timeout state, and per-entity errors for search requests.  
  Done when: slow queries and failures are consistently logged with requestId included.

## Phase 2 — Frontend

- [x] Create frontend search feature module  
  Description: Create the isolated frontend feature files for client access, schema validation, hook state, shell slot, combobox, and results rendering.  
  Done when: all planned frontend search files exist and page components still contain no search logic.

- [x] Implement search client layer  
  Description: Build the client layer that calls only the backend search endpoint and validates the response without reshaping it.  
  Done when: the client returns the backend response unchanged and rejects invalid payloads safely.

- [x] Implement search hook layer  
  Description: Build the hook that owns UI state only, including query state, debounce, loading, active index, transport error state, abort controller, and request sequence lock.  
  Done when: the hook prevents stale responses from overriding newer ones and no normalization exists in the hook.

- [x] Implement search UI component  
  Description: Build the combobox and results UI for grouped jobs and customers, including loading, empty, partial, timeout, and keyboard states.  
  Done when: one component tree can render the full Global Search v1 experience from the backend response contract.

- [x] Choose frontend hosting option  
  Description: Confirm whether execution will use Option A (no route movement) or Option B (route-group restructure).  
  Done when: one hosting option is explicitly approved and the unapproved option is not implemented.

- [x] Option A only: mount search via root layout shell slot  
  Description: Mount one office-aware search instance from the root layout without moving existing route folders.  
  Done when: search renders only on office routes and never renders on login, reset-password, or technician routes.

- [ ] Option B only: create office route-group shell  
  Description: Create one route-preserving office layout and mount the search instance there.  
  Done when: office routes share the shell, the search mounts exactly once, and public URLs remain unchanged.

- [ ] Option B only: move office route folders into route group  
  Description: Move the active office routes into the approved route-group structure without changing route behavior.  
  Done when: jobs, customers, schedule, and dispatch still resolve at the same URLs and their page internals remain functionally unchanged.

- [x] Implement frontend timeout handling  
  Description: Apply the agreed frontend timeout behavior so the UI handles transport timeout cleanly without fabricating data.  
  Done when: timed-out requests abort cleanly and surface the correct UI state.

- [x] Implement navigation from search results  
  Description: Ensure the UI navigates only to valid job and customer destinations returned by the backend.  
  Done when: selecting a result opens the correct detail route for jobs or customers.

## Phase 3 — Integration

- [x] Verify no page-level search logic was introduced  
  Description: Confirm that jobs, customers, schedule, dispatch, and detail pages do not own search fetching, search state, or result rendering.  
  Done when: search remains mounted once in the approved shell location only.

- [x] Connect frontend client to backend endpoint  
  Description: Wire the frontend feature module to the isolated backend search endpoint using the approved transport path only.  
  Done when: frontend search requests reach GET /api/search successfully with no client fan-out.

- [x] Validate destination-route alignment  
  Description: Confirm backend destinations match active frontend routes for jobs and customers only.  
  Done when: every returned destination opens a real active route and no dead link is possible in normal operation.

- [x] Confirm auth/session behavior is unchanged  
  Description: Verify the search feature works within existing auth/session behavior and does not alter redirects or session handling.  
  Done when: existing protected page behavior remains unchanged and search respects the same session boundaries.

- [x] Confirm zero core-flow regression  
  Description: Verify that the existing dashboard, leads, jobs, reports, auth, and other production flows remain unaffected by the new feature.  
  Done when: the search feature is additive only and no existing production contract has changed.

## Phase 4 — Validation

- [x] Validate office-only backend access  
  Description: Test search as an office user and as a technician to confirm the backend is the only authority for access control.  
  Done when: office users receive valid results and technician users cannot access office-only search data.

- [x] Validate grouped response contract  
  Description: Confirm the endpoint returns the expected grouped jobs/customers contract with meta fields present.  
  Done when: the response matches the agreed schema exactly for valid searches.

- [x] Validate empty and whitespace queries  
  Description: Confirm empty and whitespace-only queries are handled by the agreed rules and do not produce improper search behavior.  
  Done when: invalid query input behaves consistently across backend and frontend.

- [x] Validate concurrency and race protection  
  Description: Test rapid typing and overlapping requests to confirm stale responses never overwrite newer ones.  
  Done when: abort and sequence-lock behavior prevent stale UI state.

- [x] Validate partial failure handling  
  Description: Simulate one-entity failure and confirm the UI still renders partial results while meta.partial and meta.errors are accurate.  
  Done when: one failed entity does not break the entire search experience.

- [x] Validate timeout handling  
  Description: Simulate slow and timed-out searches on backend and frontend.  
  Done when: timeout behavior matches the defined rules and the UI surfaces the correct state.

- [x] Validate navigation to job results  
  Description: Verify search results for jobs open the correct job detail route.  
  Done when: each tested job result lands on the expected job detail page successfully.

- [x] Validate navigation to customer results  
  Description: Verify search results for customers open the correct customer detail route.  
  Done when: each tested customer result lands on the expected customer detail page successfully.

- [x] Validate search shell visibility boundaries  
  Description: Confirm the search UI appears only where approved and does not leak into disallowed surfaces.  
  Done when: visibility matches the approved frontend hosting option exactly.

- [x] Validate observability outputs  
  Description: Confirm requestId, timing, slow-query logging, timeout logging, and per-entity errors are emitted as planned.  
  Done when: logs contain the required observability data for search requests.

## Blockers

- Frontend hosting option approval: resolved
  - Option A approved for this implementation pass
  - Option B is not in scope for this implementation pass
- Any requirement that would force modification of core CRM controllers, services, DTOs, entities, schema, auth/session, or deployment/config
- Any required database/index change that has not been separately proposed and approved
- Any route validation gap that shows a backend destination does not map to a real active frontend route

## Notes / Decisions

- Backend normalization is authoritative and exclusive
- Frontend may validate the response but must not normalize it
- One search endpoint only
- Jobs + customers only for v1
- No dashboard reuse
- No client fan-out
- No page-level search logic
- One mounted instance only
- Backend is the only source of truth
- Existing backend core remains locked except for approved module registration
- Record chosen frontend hosting option here before implementation starts
- Record any approved deviations here before execution continues
- Frontend hosting option for this pass: Option A approved (no route-group restructure)
- Option B is not in scope for this implementation pass
- Phase 4 blocker observed and addressed: search endpoint now returns standard API envelope `{ data: ... }` to match shared frontend transport unwrapping
- Exact blocked scenario retest passed on active backend: office login + `GET /api/search?q=jo` now returns enveloped payload with `data.jobs`, `data.customers`, and `data.meta`
- Remaining Phase 4 validation items completed:
  - Technician denial runtime check returned `403` with `{ error: { code: "forbidden" } }`
  - Partial-failure simulation produced `meta.partial=true` with one-entity error while preserving other entity results
  - Timeout simulation produced `meta.partial=true` with timeout error while preserving other entity results
- Release gate reminder: strict DB/index proof for no-full-table-scan remains a separate approval gate if required
