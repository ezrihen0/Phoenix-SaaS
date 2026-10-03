import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { DataSource, In, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import {
  normalizePermissionKeys,
  type RoleModePermission,
} from "../auth/permissions";
import type { ProfileRole } from "../crm/constants";
import { ensureTechnicianForOrganizationMembership } from "../crm/technician-membership-link";
import { TechnicianAssignmentService } from "../crm/technician-assignment.service";
import { AuthSessionEntity } from "../database/entities/auth-session.entity";
import { MembershipEntity } from "../database/entities/membership.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { UserEntity } from "../database/entities/user.entity";
import {
  TeamRbacAuditEventEntity,
  type TeamRbacAuditAction,
} from "../database/entities/team-rbac-audit-event.entity";
import { listPermissionsForMembership } from "./membership-permissions";
import {
  defaultAssignableForSystemRole,
  isTeamMemberEditEnabled,
} from "./assignment-eligibility.mode";
import { actorMayAdministrativelyResetTargetPassword } from "./team-role-privilege";
import { formatRoleLabel, isProtectedOwnerRole } from "./team-role-labels";
import { TeamService } from "./team.service";

const seatOccupyingStatuses = ["active", "invited"] as const;

export type MemberEditInput = {
  fullName?: string;
  phone?: string | null;
  systemRole?: ProfileRole;
  customRoleId?: string | null;
  customPermissionKeys?: RoleModePermission[] | null;
  assignableToJobs?: boolean;
  reactivateRoster?: boolean;
};

@Injectable()
export class TeamMemberEditService {
  constructor(
    private readonly teamService: TeamService,
    private readonly technicianAssignmentService: TechnicianAssignmentService,
    @InjectRepository(ProfileEntity)
    private readonly profilesRepository: Repository<ProfileEntity>,
    @InjectRepository(MembershipEntity)
    private readonly membershipsRepository: Repository<MembershipEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(AuthSessionEntity)
    private readonly sessionsRepository: Repository<AuthSessionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  assertEditEnabled() {
    if (!isTeamMemberEditEnabled()) {
      apiError(403, "team_member_edit_disabled", "Team member editing is not enabled in this environment.");
    }
  }

  listManageableOrganizationIds(actor: ActorContext): Set<string> {
    return new Set(
      actor.memberships
        .filter((membership) => membership.status === "active")
        .filter((membership) => listPermissionsForMembership(membership).includes("team.manage"))
        .map((membership) => membership.organization_id),
    );
  }

  async getMember(profileId: string, actor: ActorContext) {
    this.assertEditEnabled();
    const organizationId = this.requireOrganizationId(actor);
    const { profile, membership } = await this.loadMemberInOrganization(profileId, organizationId);
    const manageable = this.listManageableOrganizationIds(actor);
    const allMemberships = await this.membershipsRepository.find({
      where: { user_id: profile.auth_user_id, status: In([...seatOccupyingStatuses, "suspended"]) },
      relations: { custom_role: true },
    });
    const technician = await this.technicianAssignmentService.findTechnicianForMembership(
      organizationId,
      profile.auth_user_id,
    );
    const upcomingAssignedJobCount = technician
      ? await this.technicianAssignmentService.countUpcomingAssignedJobs(organizationId, technician.id)
      : 0;

    return {
      ...this.teamService.buildMemberResponsePublic(profile, membership),
      assignable_to_jobs: membership.assignable_to_jobs,
      roster: {
        has_row: Boolean(technician),
        is_active: technician?.is_active ?? false,
        technician_id: technician?.id ?? null,
      },
      editable: {
        globalIdentity: allMemberships.every((item) => manageable.has(item.organization_id)),
        access: profile.id !== actor.profile?.id,
        assignableToJobs: profile.id !== actor.profile?.id,
        passwordReset: profile.id !== actor.profile?.id,
      },
      assignmentEligibilityMode: this.teamService.getAssignmentEligibilityModePublic(),
      teamMemberEditEnabled: true,
      upcomingAssignedJobCount,
    };
  }

  async updateMember(profileId: string, input: MemberEditInput, actor: ActorContext) {
    this.assertEditEnabled();
    const organizationId = this.requireOrganizationId(actor);
    const { profile, membership } = await this.loadMemberInOrganization(profileId, organizationId);

    if (profile.id === actor.profile?.id && (input.systemRole !== undefined || input.customRoleId !== undefined || input.customPermissionKeys !== undefined || input.assignableToJobs !== undefined)) {
      apiError(400, "cannot_change_own_access", "You cannot change your own access from this panel.");
    }

    const previousPermissions = listPermissionsForMembership(membership);
    const previousRole = membership.role;
    let upcomingAssignedJobCount: number | undefined;

    await this.dataSource.transaction(async (manager) => {
      if (input.fullName !== undefined || input.phone !== undefined) {
        await this.applyGlobalIdentityEdits(actor, profile, {
          fullName: input.fullName,
          phone: input.phone,
        }, manager);
      }

      const accessTouched = input.systemRole !== undefined
        || input.customRoleId !== undefined
        || input.customPermissionKeys !== undefined;

      if (accessTouched) {
        const accessInput = {
          systemRole: input.systemRole,
          customRoleId: input.customRoleId,
          customPermissionKeys: input.customPermissionKeys,
        };
        await this.teamService.applyMembershipAccessUpdate(
          manager,
          actor,
          profile,
          membership,
          accessInput,
        );
      }

      const assignablePresent = input.assignableToJobs !== undefined;
      if (assignablePresent) {
        membership.assignable_to_jobs = input.assignableToJobs!;
        await manager.getRepository(MembershipEntity).save(membership);

        if (input.assignableToJobs === false) {
          const technician = await this.technicianAssignmentService.findTechnicianForMembership(
            organizationId,
            profile.auth_user_id,
          );
          if (technician) {
            upcomingAssignedJobCount = await this.technicianAssignmentService.countUpcomingAssignedJobs(
              organizationId,
              technician.id,
            );
          }
        }
      }

      const assignableToJobsEffective = assignablePresent
        ? input.assignableToJobs!
        : membership.assignable_to_jobs;

      const assignableKeySent = Object.prototype.hasOwnProperty.call(input, "assignableToJobs");
      if (assignableKeySent && assignableToJobsEffective === true) {
        await ensureTechnicianForOrganizationMembership(
          manager,
          {
            organizationId,
            userId: profile.auth_user_id,
            displayName: profile.full_name,
            phone: profile.phone,
          },
          {
            allowCreate: true,
            allowReactivate: input.reactivateRoster === true,
          },
        );
      }

      await manager.getRepository(TeamRbacAuditEventEntity).save(
        manager.getRepository(TeamRbacAuditEventEntity).create({
          id: randomUUID(),
          organization_id: organizationId,
          actor_user_id: actor.user.id,
          target_user_id: profile.auth_user_id,
          action: "member_updated" as TeamRbacAuditAction,
          previous_role: previousRole,
          new_role: membership.role,
          previous_permissions: previousPermissions,
          new_permissions: listPermissionsForMembership(membership),
          metadata: {
            fields: Object.keys(input).filter((key) => input[key as keyof MemberEditInput] !== undefined),
            assignable_to_jobs: membership.assignable_to_jobs,
            upcoming_assigned_job_count: upcomingAssignedJobCount ?? null,
          },
        }),
      );
    });

    const refreshedMembership = await this.membershipsRepository.findOneOrFail({
      where: { id: membership.id },
      relations: { custom_role: true },
    });

    return {
      member: this.teamService.buildMemberResponsePublic(profile, refreshedMembership),
      upcomingAssignedJobCount: upcomingAssignedJobCount ?? 0,
    };
  }

  async resetMemberPassword(profileId: string, password: string, actor: ActorContext) {
    this.assertEditEnabled();
    const organizationId = this.requireOrganizationId(actor);
    const { profile } = await this.loadMemberInOrganization(profileId, organizationId);

    if (profile.id === actor.profile?.id) {
      apiError(400, "cannot_reset_own_password_here", "Use account settings to change your own password.");
    }

    const actorMembership = actor.membership;
    if (!actorMembership) {
      apiError(403, "team_manage_forbidden", "You cannot manage team access.");
    }

    const targetMemberships = await this.membershipsRepository.find({
      where: { user_id: profile.auth_user_id, status: In([...seatOccupyingStatuses, "suspended"]) },
      relations: { custom_role: true },
    });

    const decision = actorMayAdministrativelyResetTargetPassword({
      actorMembershipRole: actorMembership.role,
      actorManageableOrganizationIds: this.listManageableOrganizationIds(actor),
      targetMemberships,
    });

    if (!decision.allowed) {
      apiError(403, decision.code, decision.message);
    }

    const user = await this.usersRepository.findOne({ where: { id: profile.auth_user_id } });
    if (!user) {
      apiError(404, "team_member_not_found", "The team member could not be found.");
    }

    user.password_hash = await bcrypt.hash(password, 10);
    await this.usersRepository.save(user);
    await this.sessionsRepository.delete({ user_id: user.id });

    await this.dataSource.manager.getRepository(TeamRbacAuditEventEntity).save(
      this.dataSource.manager.getRepository(TeamRbacAuditEventEntity).create({
        id: randomUUID(),
        organization_id: organizationId,
        actor_user_id: actor.user.id,
        target_user_id: user.id,
        action: "member_password_reset" as TeamRbacAuditAction,
        previous_role: null,
        new_role: null,
        previous_permissions: null,
        new_permissions: null,
        metadata: { sessions_invalidated: true },
      }),
    );

    return { reset: true };
  }

  private async applyGlobalIdentityEdits(
    actor: ActorContext,
    profile: ProfileEntity,
    input: { fullName?: string; phone?: string | null },
    manager: typeof this.dataSource.manager,
  ) {
    const allMemberships = await this.membershipsRepository.find({
      where: { user_id: profile.auth_user_id, status: In([...seatOccupyingStatuses, "suspended"]) },
    });
    const manageable = this.listManageableOrganizationIds(actor);
    if (allMemberships.some((membership) => !manageable.has(membership.organization_id))) {
      apiError(
        409,
        "cross_org_identity_managed_elsewhere",
        "This person's name and phone can only be changed when you manage all of their organizations.",
      );
    }

    if (input.fullName !== undefined) {
      profile.full_name = input.fullName.trim();
    }

    if (input.phone !== undefined) {
      profile.phone = input.phone;
    }

    await manager.getRepository(ProfileEntity).save(profile);
  }

  private async loadMemberInOrganization(profileId: string, organizationId: string) {
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
      relations: { custom_role: true },
    });

    if (!membership) {
      apiError(404, "team_membership_not_found", "The team member is not part of the active organization.");
    }

    return { profile, membership };
  }

  private requireOrganizationId(actor: ActorContext) {
    if (!actor.organization_id) {
      apiError(400, "organization_context_missing", "An active organization is required.");
    }

    return actor.organization_id;
  }
}
