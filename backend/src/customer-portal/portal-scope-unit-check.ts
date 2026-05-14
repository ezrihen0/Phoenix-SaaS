/**
 * Lightweight assertions for portal org-scoping helpers (no DB).
 * Run: npm run portal:scope-check --workspace backend
 */
import assert from "node:assert/strict";

function portalSideDocumentAllowed(documentOrgId: string | null | undefined, sessionOrgId: string) {
  const scope = sessionOrgId.trim();
  const doc = documentOrgId?.trim() ?? null;
  return !doc || doc === scope;
}

assert.equal(portalSideDocumentAllowed(null, "o1"), true);
assert.equal(portalSideDocumentAllowed(undefined, "o1"), true);
assert.equal(portalSideDocumentAllowed("o1", "o1"), true);
assert.equal(portalSideDocumentAllowed("o2", "o1"), false);

console.log("portal-scope-unit-check: ok");
