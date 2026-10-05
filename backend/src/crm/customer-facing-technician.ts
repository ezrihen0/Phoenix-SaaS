export type CustomerFacingTechnicianIdentity = {
  name: string | null;
  title: string | null;
  photoUrl: string | null;
};

export type CustomerFacingTechnicianFields = {
  customer_facing_name?: string | null;
  customer_facing_title?: string | null;
  customer_facing_photo_url?: string | null;
};

export function normalizeCustomerFacingTechnicianLabel(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

/**
 * Resolves the identity customers may see. Never falls back to internal
 * `display_name`, `profiles.full_name`, or auth identity.
 */
export function resolveCustomerFacingTechnicianIdentity(
  technician: CustomerFacingTechnicianFields | null | undefined,
): CustomerFacingTechnicianIdentity {
  return {
    name: normalizeCustomerFacingTechnicianLabel(technician?.customer_facing_name),
    title: normalizeCustomerFacingTechnicianLabel(technician?.customer_facing_title),
    photoUrl: normalizeCustomerFacingTechnicianLabel(technician?.customer_facing_photo_url),
  };
}

export function toPortalTechnicianIdentity(technician: CustomerFacingTechnicianFields | null | undefined) {
  const identity = resolveCustomerFacingTechnicianIdentity(technician);
  return {
    name: identity.name,
    title: identity.title,
    photo_url: identity.photoUrl,
  };
}
