import type { OrganizationEntity } from "../database/entities/organization.entity";
import type { MembershipEntity } from "../database/entities/membership.entity";

/** Dev/bootstrap tenant — not the Phoenix Fireplace operating workspace. */
export const BOOTSTRAP_ORGANIZATION_SLUG = "phoenix";
export const OPERATING_PHOENIX_ORGANIZATION_SLUG = "phoenix-fireplace";

export function isBootstrapDevelopmentOrganization(
  organization: Pick<OrganizationEntity, "slug"> | null | undefined,
): boolean {
  if (!organization?.slug) {
    return false;
  }

  const slug = organization.slug.trim().toLowerCase();
  return slug === BOOTSTRAP_ORGANIZATION_SLUG || slug === "phoenix-default";
}

export function rankMembershipsForDefaultSelection(memberships: MembershipEntity[]): MembershipEntity[] {
  const eligible = memberships.filter((membership) => membership.organization?.is_active !== false);
  const pool = eligible.length > 0 ? eligible : memberships;

  const nonBootstrap = pool.filter(
    (membership) => !isBootstrapDevelopmentOrganization(membership.organization ?? null),
  );

  if (nonBootstrap.length === 0) {
    return [...pool].sort((left, right) => right.created_at.getTime() - left.created_at.getTime());
  }

  const operatingPhoenix = nonBootstrap.find(
    (membership) => membership.organization?.slug?.trim().toLowerCase() === OPERATING_PHOENIX_ORGANIZATION_SLUG,
  );
  if (operatingPhoenix) {
    return [operatingPhoenix, ...nonBootstrap.filter((membership) => membership.id !== operatingPhoenix.id)];
  }

  return [...nonBootstrap].sort((left, right) => right.created_at.getTime() - left.created_at.getTime());
}

export function selectDefaultMembership(memberships: MembershipEntity[]): MembershipEntity | null {
  return rankMembershipsForDefaultSelection(memberships)[0] ?? null;
}

export function shouldRepairBootstrapOrganizationPreference(
  activeOrganization: Pick<OrganizationEntity, "slug"> | null | undefined,
  memberships: MembershipEntity[],
): boolean {
  if (!isBootstrapDevelopmentOrganization(activeOrganization ?? null)) {
    return false;
  }

  return memberships.some(
    (membership) =>
      membership.status === "active"
      && membership.organization?.is_active !== false
      && !isBootstrapDevelopmentOrganization(membership.organization ?? null),
  );
}

export function filterSwitchableMemberships(memberships: MembershipEntity[]): MembershipEntity[] {
  const active = memberships.filter(
    (membership) =>
      membership.status === "active"
      && membership.organization
      && membership.organization.is_active !== false,
  );

  const nonBootstrap = active.filter(
    (membership) => !isBootstrapDevelopmentOrganization(membership.organization ?? null),
  );

  return nonBootstrap.length > 0 ? nonBootstrap : active;
}

export function shouldBlockBootstrapOrganizationSwitch(
  targetOrganization: Pick<OrganizationEntity, "slug"> | null | undefined,
  memberships: MembershipEntity[],
): boolean {
  if (!isBootstrapDevelopmentOrganization(targetOrganization ?? null)) {
    return false;
  }

  return memberships.some(
    (membership) =>
      membership.status === "active"
      && membership.organization?.is_active !== false
      && !isBootstrapDevelopmentOrganization(membership.organization ?? null),
  );
}
