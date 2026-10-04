export const PHOENIX_MICHAEL_FIELD_REPORT_NOTES_MARKER = "[phoenix_michael_field_report:v1]";

export type PhoenixMichaelFieldReportProvenance = {
  sourceSystem: "michael_field_report";
  batchId: string;
  entryId: string;
  clientRowKey: string;
  submittedAt: string;
};

export function buildPhoenixMichaelFieldReportNotes(provenance: PhoenixMichaelFieldReportProvenance) {
  return `${PHOENIX_MICHAEL_FIELD_REPORT_NOTES_MARKER}${JSON.stringify(provenance)}`;
}
