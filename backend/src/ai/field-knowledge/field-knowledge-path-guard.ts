/**
 * Path safety guard — explicit forbidden folders and root planning docs only.
 * Does not use broad substring matching that could block legitimate approved packs.
 */

const FORBIDDEN_FOLDER_PREFIXES = [
  "_candidate-updates/",
  "_protocols/",
  "runtime/",
] as const;

/** Basenames blocked only at the field-knowledge repo root (not inside pack paths). */
const FORBIDDEN_ROOT_BASENAMES = new Set([
  "README.md",
]);

export type PathGuardResult = { ok: true } | { ok: false; reason: string };

export function normalizeKnowledgeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function assertRuntimeKnowledgePathAllowed(relativePath: string): PathGuardResult {
  const normalized = normalizeKnowledgeRelativePath(relativePath);

  if (normalized.includes("..")) {
    return { ok: false, reason: "path_traversal" };
  }

  for (const prefix of FORBIDDEN_FOLDER_PREFIXES) {
    if (normalized.startsWith(prefix) || normalized.includes(`/${prefix}`)) {
      return { ok: false, reason: `forbidden_folder:${prefix.replace(/\/$/, "")}` };
    }
  }

  const segments = normalized.split("/");
  if (segments.length === 1 && FORBIDDEN_ROOT_BASENAMES.has(segments[0]!)) {
    return { ok: false, reason: "forbidden_root_planning_doc" };
  }

  return { ok: true };
}

export function isRuntimeKnowledgePathAllowed(relativePath: string): boolean {
  return assertRuntimeKnowledgePathAllowed(relativePath).ok;
}
