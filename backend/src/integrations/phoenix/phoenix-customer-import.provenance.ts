export const PHOENIX_WORKIZ_IMPORT_NOTES_MARKER = "[phoenix_workiz_import:v1]";

export type PhoenixWorkizImportProvenance = {
  sourceSystem: "workiz";
  sourceCustomerId: string;
  sourceReference: string;
  importBatch: string;
  importedAt: string;
};

export function buildPhoenixWorkizImportNotes(provenance: PhoenixWorkizImportProvenance) {
  return `${PHOENIX_WORKIZ_IMPORT_NOTES_MARKER}${JSON.stringify(provenance)}`;
}

export function parsePhoenixWorkizImportNotes(notes: string | null | undefined): PhoenixWorkizImportProvenance | null {
  if (!notes?.includes(PHOENIX_WORKIZ_IMPORT_NOTES_MARKER)) {
    return null;
  }

  const jsonStart = notes.indexOf(PHOENIX_WORKIZ_IMPORT_NOTES_MARKER) + PHOENIX_WORKIZ_IMPORT_NOTES_MARKER.length;
  const jsonText = notes.slice(jsonStart).trim();

  try {
    const parsed = JSON.parse(jsonText) as Partial<PhoenixWorkizImportProvenance>;
    if (
      parsed.sourceSystem !== "workiz"
      || typeof parsed.sourceCustomerId !== "string"
      || typeof parsed.sourceReference !== "string"
      || typeof parsed.importBatch !== "string"
      || typeof parsed.importedAt !== "string"
    ) {
      return null;
    }

    return parsed as PhoenixWorkizImportProvenance;
  } catch {
    return null;
  }
}

export function provenanceMatchesBatch(
  notes: string | null | undefined,
  sourceCustomerId: string,
  importBatch: string,
) {
  const parsed = parsePhoenixWorkizImportNotes(notes);
  if (!parsed) {
    return false;
  }

  return parsed.sourceCustomerId === sourceCustomerId && parsed.importBatch === importBatch;
}
