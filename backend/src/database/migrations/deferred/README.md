# Deferred migrations (not loaded by TypeORM)

Files here are **intentionally excluded** from `typeorm.config.ts`, which only loads `migrations/active/*`.

Do not move a migration into `active/` until its owning program (for example multi-branch Phase 1) is approved for production.

**Finance Phase 15:** `1790000000000-multi-branch-phase1-foundation.ts` stays deferred until the multi-branch workstream ships separately.
