/** Mirrors backend organization-resolution.policy.ts for client-side switcher filtering. */

export const BOOTSTRAP_ORGANIZATION_SLUG = "phoenix";
export const OPERATING_PHOENIX_ORGANIZATION_SLUG = "phoenix-fireplace";

export type SwitchableOrganization = {
  status: "active" | "invited" | "suspended";
  organization: {
    slug: string;
    is_active: boolean;
  } | null;
};

export function isBootstrapDevelopmentOrganization(
  organization: Pick<{ slug: string }, "slug"> | null | undefined,
): boolean {
  if (!organization?.slug) {
    return false;
  }

  const slug = organization.slug.trim().toLowerCase();
  return slug === BOOTSTRAP_ORGANIZATION_SLUG || slug === "phoenix-default";
}

export function filterSwitchableMemberships<T extends SwitchableOrganization>(memberships: T[]): T[] {
  const active = memberships.filter(
    (membership) =>
      membership.status === "active"
      && membership.organization
      && membership.organization.is_active !== false,
  );

  const nonBootstrap = active.filter(
    (membership) => !isBootstrapDevelopmentOrganization(membership.organization),
  );

  return nonBootstrap.length > 0 ? nonBootstrap : active;
}

export function canCreateStandaloneOrganization(platformCapabilities: string[] | undefined) {
  return platformCapabilities?.includes("organizations.create_standalone") ?? false;
}

export function canCreateOrganization(
  permissions: string[] | undefined,
  platformCapabilities: string[] | undefined,
  canAddOrganization: boolean,
) {
  const ownerCanManage = permissions?.includes("organizations.manage") ?? false;
  return ownerCanManage && (canAddOrganization || canCreateStandaloneOrganization(platformCapabilities));
}
