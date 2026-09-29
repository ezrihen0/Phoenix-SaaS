/**
 * Shared guard for future historical import entrypoints — explicit tenant target only.
 */
export function assertHistoricalImportTargetOrganizationId(
  organizationId: string | null | undefined,
): asserts organizationId is string {
  if (!organizationId?.trim()) {
    throw new Error("historical_import_requires_explicit_organization_id");
  }
}
