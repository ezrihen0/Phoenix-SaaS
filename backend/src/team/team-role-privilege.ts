import type { ProfileRole } from "../crm/constants";
import { listPermissionsForMembership, type MembershipPermissionSource } from "./membership-permissions";
import type { MembershipEntity } from "../database/entities/membership.entity";
import { isProtectedOwnerRole } from "./team-role-labels";

const ROLE_RANK: Record<ProfileRole, number> = {
  owner: 100,
  admin: 90,
  office_admin: 70,
  dispatcher: 60,
  technician: 50,
  csr: 40,
  viewer: 30,
};

export function rolePrivilegeRank(role: ProfileRole | null | undefined): number {
  if (!role) {
    return 0;
  }

  return ROLE_RANK[role] ?? 0;
}

export function actorOutranksTargetRole(actorRole: ProfileRole, targetRole: ProfileRole): boolean {
  return rolePrivilegeRank(actorRole) > rolePrivilegeRank(targetRole);
}

export function membershipHasOwnerOnlyPermissions(membership: Pick<MembershipEntity, "role" | "custom_permission_keys" | "custom_role_id"> & {
  custom_role?: { permission_keys?: string[] | null } | null;
}): boolean {
  const permissions = listPermissionsForMembership(membership as MembershipPermissionSource);
  const ownerOnly = new Set([
    "system.roles.manage",
    "organizations.manage",
    "billing.manage",
  ]);

  return permissions.some((permission) => ownerOnly.has(permission));
}

export function targetHasProtectedRoleAcrossMemberships(
  memberships: Array<Pick<MembershipEntity, "role" | "custom_permission_keys" | "custom_role_id"> & {
    custom_role?: { permission_keys?: string[] | null } | null;
  }>,
): boolean {
  return memberships.some(
    (membership) =>
      isProtectedOwnerRole(membership.role)
      || membership.role === "admin"
      || membershipHasOwnerOnlyPermissions(membership),
  );
}

export function actorMayAdministrativelyResetTargetPassword(input: {
  actorMembershipRole: ProfileRole;
  actorManageableOrganizationIds: Set<string>;
  targetMemberships: Array<
    Pick<MembershipEntity, "organization_id" | "role" | "custom_permission_keys" | "custom_role_id"> & {
      custom_role?: { permission_keys?: string[] | null } | null;
    }
  >;
}): { allowed: true } | { allowed: false; code: string; message: string } {
  const unmanaged = input.targetMemberships.filter(
    (membership) => !input.actorManageableOrganizationIds.has(membership.organization_id),
  );

  if (unmanaged.length > 0) {
    return {
      allowed: false,
      code: "cross_org_identity_managed_elsewhere",
      message: "This account is also managed in another organization you cannot administer.",
    };
  }

  const targetOwnerOrgIds = input.targetMemberships
    .filter((membership) => isProtectedOwnerRole(membership.role))
    .map((membership) => membership.organization_id);

  if (targetOwnerOrgIds.length > 0) {
    if (!isProtectedOwnerRole(input.actorMembershipRole)) {
      return {
        allowed: false,
        code: "password_reset_owner_protected",
        message: "Only an owner can reset the password for an owner account.",
      };
    }

    const actorOwnerOrgIds = new Set(
      input.targetMemberships
        .filter(
          (membership) =>
            isProtectedOwnerRole(membership.role)
            && input.actorManageableOrganizationIds.has(membership.organization_id),
        )
        .map((membership) => membership.organization_id),
    );

    for (const orgId of targetOwnerOrgIds) {
      if (!actorOwnerOrgIds.has(orgId)) {
        return {
          allowed: false,
          code: "password_reset_owner_protected",
          message: "Only an owner can reset the password for an owner account.",
        };
      }
    }
  }

  for (const membership of input.targetMemberships) {
    if (isProtectedOwnerRole(membership.role)) {
      continue;
    }

    if (
      membership.role === "admin"
      || membershipHasOwnerOnlyPermissions(membership)
    ) {
      if (!isProtectedOwnerRole(input.actorMembershipRole) && input.actorMembershipRole !== "admin") {
        return {
          allowed: false,
          code: "password_reset_privileged_target",
          message: "This account has elevated access. Only an owner or admin can reset its password.",
        };
      }

      if (
        input.actorMembershipRole === "admin"
        && membershipHasOwnerOnlyPermissions(membership)
        && membership.role !== "admin"
      ) {
        return {
          allowed: false,
          code: "password_reset_custom_privilege_protected",
          message: "This account has owner-level custom permissions. Only an owner can reset its password.",
        };
      }
    }
  }

  return { allowed: true };
}
