import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { MembershipEntity } from "../database/entities/membership.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { UserEntity } from "../database/entities/user.entity";
import {
  readAssignmentEligibilityMode,
  isExplicitAssignmentDenial,
} from "../team/assignment-eligibility.mode";

export type TechnicianListPurpose = "assignment" | "roster";

@Injectable()
export class TechnicianAssignmentService {
  constructor(
    @InjectRepository(TechnicianEntity)
    private readonly techniciansRepository: Repository<TechnicianEntity>,
    @InjectRepository(MembershipEntity)
    private readonly membershipsRepository: Repository<MembershipEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async listTechniciansForOrganization(
    organizationId: string,
    input: { activeOnly: boolean; purpose: TechnicianListPurpose },
  ) {
    const technicians = await this.techniciansRepository.find({
      where: input.activeOnly
        ? { organization_id: organizationId, is_active: true }
        : { organization_id: organizationId },
      order: { display_name: "ASC" },
    });

    if (input.purpose === "roster") {
      return technicians;
    }

    return this.filterForAssignmentPurpose(organizationId, technicians);
  }

  private async filterForAssignmentPurpose(organizationId: string, technicians: TechnicianEntity[]) {
    if (technicians.length === 0) {
      return technicians;
    }

    const userIds = technicians
      .map((technician) => technician.auth_user_id)
      .filter((userId): userId is string => Boolean(userId));

    if (userIds.length === 0) {
      return [];
    }

    const [memberships, users] = await Promise.all([
      this.membershipsRepository.find({
        where: {
          organization_id: organizationId,
          user_id: In(userIds),
          status: "active",
        },
        relations: { custom_role: true },
      }),
      this.usersRepository.find({
        where: { id: In(userIds) },
      }),
    ]);

    const membershipByUserId = new Map(memberships.map((membership) => [membership.user_id, membership]));
    const userById = new Map(users.map((user) => [user.id, user]));
    const mode = readAssignmentEligibilityMode();

    return technicians.filter((technician) => {
      if (!technician.auth_user_id || !technician.is_active) {
        return false;
      }

      const user = userById.get(technician.auth_user_id);
      if (!user?.is_active) {
        return false;
      }

      const membership = membershipByUserId.get(technician.auth_user_id);
      if (!membership) {
        return false;
      }

      if (isExplicitAssignmentDenial(membership.assignable_to_jobs)) {
        return false;
      }

      if (membership.assignable_to_jobs === true) {
        return true;
      }

      if (membership.assignable_to_jobs === null) {
        if (mode === "enforce") {
          return false;
        }

        return true;
      }

      return false;
    });
  }

  async assertTechnicianAssignableForNewAssignment(
    technicianId: string | null | undefined,
    organizationId: string,
  ) {
    if (technicianId == null) {
      return;
    }

    const technician = await this.techniciansRepository.findOne({
      where: {
        id: technicianId,
        organization_id: organizationId,
      },
    });

    if (!technician) {
      apiError(404, "technician_not_found", "The technician could not be found.");
    }

    if (!technician.auth_user_id) {
      apiError(400, "technician_not_eligible", "This assignee cannot be assigned to jobs.");
    }

    if (!technician.is_active) {
      apiError(400, "technician_not_eligible", "This assignee is inactive on the technician roster.");
    }

    const [user, membership] = await Promise.all([
      this.usersRepository.findOne({ where: { id: technician.auth_user_id } }),
      this.membershipsRepository.findOne({
        where: {
          organization_id: organizationId,
          user_id: technician.auth_user_id,
          status: "active",
        },
        relations: { custom_role: true },
      }),
    ]);

    if (!user?.is_active) {
      apiError(400, "technician_not_eligible", "This assignee account is inactive.");
    }

    if (!membership) {
      apiError(400, "technician_not_eligible", "This assignee is not an active member of the organization.");
    }

    if (isExplicitAssignmentDenial(membership.assignable_to_jobs)) {
      apiError(403, "technician_assignment_denied", "This team member is not eligible for job assignment.");
    }

    const mode = readAssignmentEligibilityMode();

    if (membership.assignable_to_jobs === true) {
      return;
    }

    if (membership.assignable_to_jobs === null && mode !== "enforce") {
      return;
    }

    apiError(403, "technician_assignment_denied", "This team member is not eligible for job assignment.");
  }

  async countUpcomingAssignedJobs(organizationId: string, technicianId: string): Promise<number> {
    const result = await this.techniciansRepository.manager.query(
      `
        SELECT COUNT(*) AS count
        FROM jobs
        WHERE organization_id = ?
          AND assigned_technician_id = ?
          AND scheduled_for IS NOT NULL
          AND scheduled_for >= UTC_TIMESTAMP(6)
      `,
      [organizationId, technicianId],
    );

    const row = result[0] as { count?: string | number } | undefined;
    return Number(row?.count ?? 0);
  }

  async findTechnicianForMembership(organizationId: string, userId: string) {
    return this.techniciansRepository.findOne({
      where: {
        organization_id: organizationId,
        auth_user_id: userId,
      },
    });
  }
}
