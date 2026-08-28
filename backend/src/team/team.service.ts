import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { DataSource, EntityManager, In, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import {
  listPermissionsForRole,
  normalizePermissionKeys,
  type RoleModePermission,
} from "../auth/permissions";
import { profileRoles, type ProfileRole } from "../crm/constants";
import { MembershipEntity } from "../database/entities/membership.entity";
import { OrganizationCustomRoleEntity } from "../database/entities/organization-custom-role.entity";
import { OrganizationTeamEntitlementEntity } from "../database/entities/organization-team-entitlement.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import {
  TeamRbacAuditEventEntity,
  type TeamRbacAuditAction,
} from "../database/entities/team-rbac-audit-event.entity";
import { UserEntity } from "../database/entities/user.entity";
import { listPermissionsForMembership } from "./membership-permissions";
import {
  buildPermissionPreview,
  listPermissionRegistryGroups,
} from "./permission-registry";
import { recommendRoleFromResponsibilities, parseTeamResponsibilities } from "./role-recommendation.engine";
import { DEFAULT_MAX_USERS, resolveMaxUsers } from "./team-entitlements";
import { assertOrganizationSeatAvailable } from "./team-seat-enforcement";
import { formatRoleLabel, isProtectedOwnerRole, isSystemRolePreset } from "./team-role-labels";

const seatOccupyingStatuses = ["active", "invited"] as const;

type MemberAccessInput = {
  systemRole?: ProfileRole;
  customRoleId?: string | null;
  customPermissionKeys?: RoleModePermission[] | null;
};

@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(MembershipEntity)
    private readonly membershipsRepository: Repository<MembershipEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profilesRepository: Repository<ProfileEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(OrganizationCustomRoleEntity)
    private readonly customRolesRepository: Repository<OrganizationCustomRoleEntity>,
    @InjectRepository(OrganizationTeamEntitlementEntity)
    private readonly entitlementsRepository: Repository<OrganizationTeamEntitlementEntity>,
    @InjectRepository(TeamRbacAuditEventEntity)
    private readonly auditRepository: Repository<TeamRbacAuditEventEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async getSummary(actor: ActorContext) {
    const organizationId = this.requireOrganizationId(actor);
    const entitlement = await this.ensureEntitlement(organizationId);
    const activeCount = await this.countSeatOccupyingMembers(organizationId);

    return {
      activeCount,
      maxUsers: resolveMaxUsers(entitlement),
      canAddUser: activeCount < resolveMaxUsers(entitlement),
      limitMessage: activeCount >= resolveMaxUsers(entitlement)
        ? `Your organization has reached its ${resolveMaxUsers(entitlement)}-user limit.`
        : null,
    };
  }

  async listMembers(actor: ActorContext) {
    const organizationId = this.requireOrganizationId(actor);
    const memberships = await this.membershipsRepository.find({
      where: {
        organization_id: organizationId,
        status: In([...seatOccupyingStatuses, "suspended"]),
      },
      relations: {
        user: true,
        custom_role: true,
      },
      order: {
        created_at: "ASC",
      },
    });

    const profiles = await this.profilesRepository.find({
      where: memberships.map((membership) => ({ auth_user_id: membership.user_id })),
    });
    const profileMap = new Map(profiles.map((profile) => [profile.auth_user_id, profile]));

    return memberships
      .map((membership) => {
        const profile = profileMap.get(membership.user_id);
        if (!profile) {
          return null;
        }

        return this.buildMemberResponse(profile, membership);
      })
      .filter((member): member is NonNullable<typeof member> => Boolean(member));
  }

  async createMember(
    input: {
      email: string;
      password: string;
      fullName: string;
      phone: string | null;
      access: MemberAccessInput;
    },
    actor: ActorContext,
  ) {
    const organizationId = this.requireOrganizationId(actor);
    this.assertAccessInput(input.access);

    const existingUser = await this.usersRepository.findOne({
      where: { email: input.email },
    });

    if (existingUser) {
      apiError(409, "team_email_exists", "A user already exists for this email.");
    }

    const resolvedAccess = await this.resolveAccessForOrganization(organizationId, input.access);
    const passwordHash = await bcrypt.hash(input.password, 10);

    const created = await this.dataSource.transaction(async (manager) => {
      await assertOrganizationSeatAvailable(organizationId, manager);

      const user = await manager.getRepository(UserEntity).save(
        manager.getRepository(UserEntity).create({
          email: input.email,
          password_hash: passwordHash,
          is_active: true,
        }),
      );

      const profile = await manager.getRepository(ProfileEntity).save(
        manager.getRepository(ProfileEntity).create({
          auth_user_id: user.id,
          full_name: input.fullName,
          phone: input.phone,
          role: resolvedAccess.systemRole,
        }),
      );

      const membership = await manager.getRepository(MembershipEntity).save(
        manager.getRepository(MembershipEntity).create({
          user_id: user.id,
          organization_id: organizationId,
          role: resolvedAccess.systemRole,
          status: "active",
          custom_role_id: resolvedAccess.customRoleId,
          custom_permission_keys: resolvedAccess.customPermissionKeys,
        }),
      );

      await this.recordAudit(manager, {
        organizationId,
        actorUserId: actor.user.id,
        targetUserId: user.id,
        action: "member_created",
        previousRole: null,
        newRole: resolvedAccess.systemRole,
        previousPermissions: null,
        newPermissions: resolvedAccess.effectivePermissions,
        metadata: {
          custom_role_id: resolvedAccess.customRoleId,
        },
      });

      return { profile, membership, user };
    });

    created.profile.user = created.user;
    created.membership.custom_role = resolvedAccess.customRole;
    return this.buildMemberResponse(created.profile, created.membership);
  }

  async updateMemberAccess(
    profileId: string,
    access: MemberAccessInput,
    actor: ActorContext,
  ) {
    const organizationId = this.requireOrganizationId(actor);
    this.assertAccessInput(access);

    const profile = await this.profilesRepository.findOne({
      where: { id: profileId },
      relations: { user: true },
    });

    if (!profile) {
      apiError(404, "team_member_not_found", "The team member could not be found.");
    }

    const membership = await this.membershipsRepository.findOne({
      where: {
        user_id: profile.auth_user_id,
        organization_id: organizationId,
        status: In([...seatOccupyingStatuses, "suspended"]),
      },
      relations: {
        custom_role: true,
      },
    });

    if (!membership) {
      apiError(404, "team_membership_not_found", "The team member is not part of the active organization.");
    }

    if (profile.id === actor.profile?.id) {
      apiError(400, "cannot_change_own_access", "You cannot change your own access from this panel.");
    }

    const previousPermissions = listPermissionsForMembership(membership);
    const previousRole = membership.role;

    this.assertOwnerMutationAllowed(previousRole, access);

    const resolvedAccess = await this.resolveAccessForOrganization(organizationId, access);

    if (isProtectedOwnerRole(previousRole) && !isProtectedOwnerRole(resolvedAccess.systemRole)) {
      await this.assertNotFinalOwner(organizationId, membership.id);
    }

    membership.role = resolvedAccess.systemRole;
    membership.custom_role_id = resolvedAccess.customRoleId;
    membership.custom_permission_keys = resolvedAccess.customPermissionKeys;
    await this.membershipsRepository.save(membership);

    profile.role = resolvedAccess.systemRole;
    await this.profilesRepository.save(profile);

    await this.recordAudit(this.dataSource.manager, {
      organizationId,
      actorUserId: actor.user.id,
      targetUserId: profile.auth_user_id,
      action: "member_access_updated",
      previousRole,
      newRole: resolvedAccess.systemRole,
      previousPermissions,
      newPermissions: resolvedAccess.effectivePermissions,
      metadata: {
        custom_role_id: resolvedAccess.customRoleId,
      },
    });

    membership.custom_role = resolvedAccess.customRole;
    return this.buildMemberResponse(profile, membership);
  }

  async recommendRole(responsibilities: unknown) {
    const parsed = parseTeamResponsibilities(responsibilities);
    const recommendation = recommendRoleFromResponsibilities(parsed);
    const permissions = listPermissionsForRole(recommendation.recommendedRole);

    return {
      ...recommendation,
      permissions,
      preview: buildPermissionPreview(permissions),
    };
  }

  getPermissionRegistry() {
    return {
      groups: listPermissionRegistryGroups(),
      systemRoles: profileRoles
        .filter((role) => isSystemRolePreset(role) || role === "csr" || role === "viewer")
        .map((role) => ({
          id: role,
          label: formatRoleLabel(role),
          locked: isSystemRolePreset(role),
          permissions: listPermissionsForRole(role),
        })),
    };
  }

  async listCustomRoles(actor: ActorContext) {
    const organizationId = this.requireOrganizationId(actor);
    const roles = await this.customRolesRepository.find({
      where: { organization_id: organizationId },
      order: { name: "ASC" },
    });

    return roles.map((role) => this.buildCustomRoleResponse(role));
  }

  async createCustomRole(
    input: { name: string; permissionKeys: RoleModePermission[] },
    actor: ActorContext,
  ) {
    const organizationId = this.requireOrganizationId(actor);
    const permissionKeys = normalizePermissionKeys(input.permissionKeys);

    if (!input.name.trim()) {
      apiError(400, "custom_role_name_required", "Custom role name is required.");
    }

    if (permissionKeys.length === 0) {
      apiError(400, "custom_role_permissions_required", "Select at least one permission.");
    }

    this.assertNoOwnerOnlyPermissions(permissionKeys);

    const role = await this.customRolesRepository.save(
      this.customRolesRepository.create({
        organization_id: organizationId,
        name: input.name.trim(),
        permission_keys: permissionKeys,
      }),
    );

    await this.recordAudit(this.dataSource.manager, {
      organizationId,
      actorUserId: actor.user.id,
      targetUserId: null,
      action: "custom_role_created",
      previousRole: null,
      newRole: null,
      previousPermissions: null,
      newPermissions: permissionKeys,
      metadata: { custom_role_id: role.id, name: role.name },
    });

    return this.buildCustomRoleResponse(role);
  }

  async updateCustomRole(
    roleId: string,
    input: { name?: string; permissionKeys?: RoleModePermission[] },
    actor: ActorContext,
  ) {
    const organizationId = this.requireOrganizationId(actor);
    const role = await this.requireCustomRole(roleId, organizationId);
    const previousPermissions = [...role.permission_keys];

    if (typeof input.name === "string" && input.name.trim()) {
      role.name = input.name.trim();
    }

    if (input.permissionKeys) {
      const permissionKeys = normalizePermissionKeys(input.permissionKeys);
      if (permissionKeys.length === 0) {
        apiError(400, "custom_role_permissions_required", "Select at least one permission.");
      }
      this.assertNoOwnerOnlyPermissions(permissionKeys);
      role.permission_keys = permissionKeys;
    }

    const saved = await this.customRolesRepository.save(role);

    await this.recordAudit(this.dataSource.manager, {
      organizationId,
      actorUserId: actor.user.id,
      targetUserId: null,
      action: "custom_role_updated",
      previousRole: null,
      newRole: null,
      previousPermissions,
      newPermissions: saved.permission_keys,
      metadata: { custom_role_id: saved.id, name: saved.name },
    });

    return this.buildCustomRoleResponse(saved);
  }

  async duplicateCustomRole(roleId: string, actor: ActorContext) {
    const organizationId = this.requireOrganizationId(actor);
    const source = await this.requireCustomRole(roleId, organizationId);

    const duplicate = await this.customRolesRepository.save(
      this.customRolesRepository.create({
        organization_id: organizationId,
        name: `${source.name} Copy`,
        permission_keys: [...source.permission_keys],
      }),
    );

    await this.recordAudit(this.dataSource.manager, {
      organizationId,
      actorUserId: actor.user.id,
      targetUserId: null,
      action: "custom_role_duplicated",
      previousRole: null,
      newRole: null,
      previousPermissions: source.permission_keys,
      newPermissions: duplicate.permission_keys,
      metadata: { source_custom_role_id: source.id, custom_role_id: duplicate.id },
    });

    return this.buildCustomRoleResponse(duplicate);
  }

  async deleteCustomRole(roleId: string, actor: ActorContext) {
    const organizationId = this.requireOrganizationId(actor);
    const role = await this.requireCustomRole(roleId, organizationId);

    const memberCount = await this.membershipsRepository.count({
      where: {
        organization_id: organizationId,
        custom_role_id: role.id,
        status: In([...seatOccupyingStatuses, "suspended"]),
      },
    });

    if (memberCount > 0) {
      apiError(
        409,
        "custom_role_in_use",
        "Reassign members using this custom role before deleting it.",
      );
    }

    await this.customRolesRepository.delete(role.id);

    await this.recordAudit(this.dataSource.manager, {
      organizationId,
      actorUserId: actor.user.id,
      targetUserId: null,
      action: "custom_role_deleted",
      previousRole: null,
      newRole: null,
      previousPermissions: role.permission_keys,
      newPermissions: null,
      metadata: { custom_role_id: role.id, name: role.name },
    });

    return { deleted: true };
  }

  private requireOrganizationId(actor: ActorContext) {
    if (!actor.organization_id) {
      apiError(400, "organization_context_missing", "An active organization is required.");
    }

    return actor.organization_id;
  }

  private async ensureEntitlement(organizationId: string) {
    const existing = await this.entitlementsRepository.findOne({
      where: { organization_id: organizationId },
    });

    if (existing) {
      return existing;
    }

    return this.entitlementsRepository.save(
      this.entitlementsRepository.create({
        organization_id: organizationId,
        max_users: DEFAULT_MAX_USERS,
      }),
    );
  }

  private async countSeatOccupyingMembers(organizationId: string, manager: EntityManager = this.dataSource.manager) {
    return manager.getRepository(MembershipEntity).count({
      where: {
        organization_id: organizationId,
        status: In([...seatOccupyingStatuses]),
      },
    });
  }

  private assertAccessInput(access: MemberAccessInput) {
    if (access.systemRole === "owner") {
      apiError(403, "owner_role_protected", "Ownership cannot be granted through this flow.");
    }

    const hasCustomPermissions = Boolean(access.customPermissionKeys?.length);
    const hasCustomRole = Boolean(access.customRoleId);

    if (hasCustomPermissions && hasCustomRole) {
      apiError(400, "invalid_access_configuration", "Choose either a custom role or custom permissions, not both.");
    }
  }

  private assertOwnerMutationAllowed(previousRole: ProfileRole, access: MemberAccessInput) {
    if (!isProtectedOwnerRole(previousRole)) {
      return;
    }

    if (access.customRoleId || access.customPermissionKeys?.length) {
      apiError(403, "owner_access_protected", "Owner access cannot be converted to custom permissions.");
    }

    if (access.systemRole && access.systemRole !== "owner") {
      return;
    }
  }

  private async assertNotFinalOwner(organizationId: string, membershipId: string) {
    const ownerMemberships = await this.membershipsRepository.find({
      where: {
        organization_id: organizationId,
        role: "owner",
        status: In([...seatOccupyingStatuses]),
      },
    });

    if (ownerMemberships.length === 1 && ownerMemberships[0]?.id === membershipId) {
      apiError(403, "final_owner_protected", "The final owner cannot be removed or demoted.");
    }
  }

  private assertNoOwnerOnlyPermissions(permissions: RoleModePermission[]) {
    const ownerOnly: RoleModePermission[] = [
      "system.roles.manage",
      "organizations.manage",
      "billing.manage",
    ];

    if (permissions.some((permission) => ownerOnly.includes(permission))) {
      apiError(403, "owner_only_permissions_forbidden", "Custom roles cannot include owner-only permissions.");
    }
  }

  private async resolveAccessForOrganization(organizationId: string, access: MemberAccessInput) {
    const systemRole = access.systemRole ?? "office_admin";
    let customRoleId: string | null = access.customRoleId ?? null;
    let customPermissionKeys: RoleModePermission[] | null = access.customPermissionKeys?.length
      ? normalizePermissionKeys(access.customPermissionKeys)
      : null;

    if (customRoleId) {
      const customRole = await this.requireCustomRole(customRoleId, organizationId);
      customPermissionKeys = null;
      return {
        systemRole,
        customRoleId: customRole.id,
        customPermissionKeys,
        customRole,
        effectivePermissions: normalizePermissionKeys(customRole.permission_keys),
      };
    }

    if (customPermissionKeys?.length) {
      this.assertNoOwnerOnlyPermissions(customPermissionKeys);
      customRoleId = null;
      return {
        systemRole,
        customRoleId,
        customPermissionKeys,
        customRole: null,
        effectivePermissions: customPermissionKeys,
      };
    }

    return {
      systemRole,
      customRoleId: null,
      customPermissionKeys: null,
      customRole: null,
      effectivePermissions: listPermissionsForRole(systemRole),
    };
  }

  private async requireCustomRole(roleId: string, organizationId: string) {
    const role = await this.customRolesRepository.findOne({
      where: {
        id: roleId,
        organization_id: organizationId,
      },
    });

    if (!role) {
      apiError(404, "custom_role_not_found", "The custom role could not be found.");
    }

    return role;
  }

  private buildMemberResponse(profile: ProfileEntity, membership: MembershipEntity) {
    const effectivePermissions = listPermissionsForMembership(membership);
    const accessLabel = membership.custom_role_id
      ? membership.custom_role?.name ?? "Custom role"
      : membership.custom_permission_keys?.length
        ? "Custom permissions"
        : formatRoleLabel(membership.role);

    return {
      id: profile.id,
      auth_user_id: profile.auth_user_id,
      membership_id: membership.id,
      full_name: profile.full_name,
      phone: profile.phone,
      role: membership.role,
      access_label: accessLabel,
      status: membership.status,
      custom_role_id: membership.custom_role_id,
      custom_permission_keys: membership.custom_permission_keys,
      permissions: effectivePermissions,
      permission_preview: buildPermissionPreview(effectivePermissions),
      created_at: profile.created_at.toISOString(),
      updated_at: profile.updated_at.toISOString(),
      user: profile.user
        ? {
          id: profile.user.id,
          email: profile.user.email,
          is_active: profile.user.is_active,
        }
        : null,
    };
  }

  private buildCustomRoleResponse(role: OrganizationCustomRoleEntity) {
    return {
      id: role.id,
      name: role.name,
      permission_keys: role.permission_keys,
      permission_preview: buildPermissionPreview(role.permission_keys),
      created_at: role.created_at.toISOString(),
      updated_at: role.updated_at.toISOString(),
    };
  }

  private async recordAudit(
    manager: EntityManager,
    input: {
      organizationId: string;
      actorUserId: string;
      targetUserId: string | null;
      action: TeamRbacAuditAction;
      previousRole: ProfileRole | null;
      newRole: ProfileRole | null;
      previousPermissions: RoleModePermission[] | null;
      newPermissions: RoleModePermission[] | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    await manager.getRepository(TeamRbacAuditEventEntity).save(
      manager.getRepository(TeamRbacAuditEventEntity).create({
        id: randomUUID(),
        organization_id: input.organizationId,
        actor_user_id: input.actorUserId,
        target_user_id: input.targetUserId,
        action: input.action,
        previous_role: input.previousRole,
        new_role: input.newRole,
        previous_permissions: input.previousPermissions,
        new_permissions: input.newPermissions,
        metadata: input.metadata ?? null,
      }),
    );
  }
}
