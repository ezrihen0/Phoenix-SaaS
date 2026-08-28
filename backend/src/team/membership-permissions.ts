import type { MembershipEntity } from "../database/entities/membership.entity";
import type { OrganizationCustomRoleEntity } from "../database/entities/organization-custom-role.entity";
import {
  listPermissionsForRole,
  normalizePermissionKeys,
  type RoleModePermission,
} from "../auth/permissions";

type MembershipPermissionSource = Pick<
  MembershipEntity,
  "role" | "custom_permission_keys" | "custom_role_id"
> & {
  custom_role?: Pick<OrganizationCustomRoleEntity, "permission_keys"> | null;
};

export function listPermissionsForMembership(
  membership: MembershipPermissionSource | null | undefined,
): RoleModePermission[] {
  if (!membership) {
    return [];
  }

  if (membership.custom_permission_keys?.length) {
    return normalizePermissionKeys(membership.custom_permission_keys);
  }

  if (membership.custom_role?.permission_keys?.length) {
    return normalizePermissionKeys(membership.custom_role.permission_keys);
  }

  return listPermissionsForRole(membership.role);
}

export function membershipUsesCustomAccess(membership: MembershipPermissionSource | null | undefined) {
  return Boolean(
    membership?.custom_permission_keys?.length
    || membership?.custom_role_id
    || membership?.custom_role?.permission_keys?.length,
  );
}
