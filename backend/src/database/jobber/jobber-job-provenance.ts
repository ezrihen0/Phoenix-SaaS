export const JOBBER_HISTORICAL_IMPORT_SOURCE = "jobber_historical_import";
export const JOBBER_IMPORT_FOOTER_PREFIX = "jobber_import:";

export type JobberJobProvenance = {
  import_source: typeof JOBBER_HISTORICAL_IMPORT_SOURCE;
  visit_key: string;
  job_ref: string | null;
  source_filename: string;
  imported_at: string;
};

export function buildJobberJobDescription(input: {
  bodyLines: string[];
  provenance: JobberJobProvenance;
}): string {
  return [
    ...input.bodyLines.filter(Boolean),
    `${JOBBER_IMPORT_FOOTER_PREFIX}${JSON.stringify(input.provenance)}`,
  ].join("\n");
}

export function parseJobberJobProvenance(description: string | null | undefined): JobberJobProvenance | null {
  if (!description?.includes(JOBBER_IMPORT_FOOTER_PREFIX)) {
    return null;
  }
  const index = description.lastIndexOf(JOBBER_IMPORT_FOOTER_PREFIX);
  const jsonPart = description.slice(index + JOBBER_IMPORT_FOOTER_PREFIX.length).trim();
  try {
    const parsed = JSON.parse(jsonPart) as JobberJobProvenance;
    if (parsed.import_source !== JOBBER_HISTORICAL_IMPORT_SOURCE || !parsed.visit_key) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
