import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import type { EntityManager } from "typeorm";
import { DataSource, In, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import { BranchEntity } from "../database/entities/branch.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { MembershipBranchAccessEntity } from "../database/entities/membership-branch-access.entity";
import { MembershipEntity } from "../database/entities/membership.entity";
import { QuoteEntity } from "../database/entities/quote.entity";
import {
  actorSeesAllBranches,
  assertActorCanAssignBranch,
  membershipSeesAllBranches,
} from "./branch-access";
import {
  describeBranchProvinceCode,
  normalizeServiceProvinceToBranchCode,
} from "./branch-province-resolution";

@Injectable()
export class BranchScopeService {
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchesRepository: Repository<BranchEntity>,
    @InjectRepository(MembershipBranchAccessEntity)
    private readonly membershipBranchAccessRepository: Repository<MembershipBranchAccessEntity>,
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
    @InjectRepository(QuoteEntity)
    private readonly quotesRepository: Repository<QuoteEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoicesRepository: Repository<InvoiceEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findBranchForOrganization(organizationId: string, branchId: string): Promise<BranchEntity | null> {
    return this.branchesRepository.findOne({
      where: {
        id: branchId,
        organization_id: organizationId,
        active: true,
      },
    });
  }

  async assertBranchBelongsToOrganization(organizationId: string, branchId: string): Promise<BranchEntity> {
    const branch = await this.findBranchForOrganization(organizationId, branchId);
    if (!branch) {
      apiError(400, "branch_not_found", "The branch could not be found for this organization.");
    }

    return branch;
  }

  resolveDefaultTaxRateBps(branch: BranchEntity | null | undefined): number {
    if (!branch) {
      return 0;
    }

    const rate = branch.default_tax_rate_bps;
    return Number.isFinite(rate) && rate >= 0 ? rate : 0;
  }

  async listAccessibleBranchIds(actor: ActorContext): Promise<string[] | null> {
    if (!actor.membership_id) {
      return [];
    }

    if (actorSeesAllBranches(actor)) {
      return null;
    }

    const rows = await this.membershipBranchAccessRepository.find({
      where: { membership_id: actor.membership_id },
      select: { branch_id: true },
    });

    return rows.map((row) => row.branch_id);
  }

  async assertActorMayAssignBranch(actor: ActorContext, organizationId: string, branchId: string): Promise<BranchEntity> {
    const branch = await this.assertBranchBelongsToOrganization(organizationId, branchId);
    const accessibleBranchIds = await this.listAccessibleBranchIds(actor);
    assertActorCanAssignBranch(actor, branch.id, accessibleBranchIds);
    return branch;
  }

  async syncJobBranchToDocuments(
    manager: EntityManager,
    jobId: string,
    organizationId: string,
    branchId: string | null,
  ): Promise<void> {
    await manager.getRepository(QuoteEntity).update(
      { job_id: jobId, organization_id: organizationId },
      { branch_id: branchId },
    );

    await manager.getRepository(InvoiceEntity).update(
      { job_id: jobId, organization_id: organizationId },
      { branch_id: branchId },
    );
  }

  async resolveJobBranchIdForDocuments(
    manager: EntityManager,
    organizationId: string,
    jobId: string,
  ): Promise<string | null> {
    const job = await manager.getRepository(JobEntity).findOne({
      where: { id: jobId, organization_id: organizationId },
      select: { id: true, branch_id: true },
    });

    return job?.branch_id ?? null;
  }

  async loadBranchesByIds(organizationId: string, branchIds: string[]): Promise<Map<string, BranchEntity>> {
    if (branchIds.length === 0) {
      return new Map();
    }

    const branches = await this.branchesRepository.find({
      where: {
        organization_id: organizationId,
        id: In(branchIds),
      },
    });

    return new Map(branches.map((branch) => [branch.id, branch]));
  }

  async findActiveBranchByCode(organizationId: string, code: string): Promise<BranchEntity | null> {
    return this.branchesRepository.findOne({
      where: {
        organization_id: organizationId,
        code,
        active: true,
      },
    });
  }

  async resolveBranchIdFromServiceProvince(
    organizationId: string,
    province: string | null | undefined,
  ): Promise<string> {
    const code = normalizeServiceProvinceToBranchCode(province);
    if (!code) {
      apiError(
        400,
        "branch_province_unsupported",
        "Service address province must be AB (Alberta) or ON (Ontario).",
      );
    }

    const branch = await this.findActiveBranchByCode(organizationId, code);
    if (!branch) {
      apiError(
        400,
        "branch_not_found",
        `No active branch is configured for ${describeBranchProvinceCode(code)}.`,
      );
    }

    return branch.id;
  }

  async listBranchesForActor(actor: ActorContext, organizationId: string) {
    const accessibleBranchIds = await this.listAccessibleBranchIds(actor);
    const branches = await this.branchesRepository.find({
      where: {
        organization_id: organizationId,
        active: true,
      },
      order: {
        sort_order: "ASC",
        name: "ASC",
      },
    });

    if (accessibleBranchIds === null) {
      return branches.map((branch) => this.serializeBranch(branch));
    }

    return branches
      .filter((branch) => accessibleBranchIds.includes(branch.id))
      .map((branch) => this.serializeBranch(branch));
  }

  async updateBranchProfile(
    actor: ActorContext,
    organizationId: string,
    branchId: string,
    updates: Partial<
      Pick<
        BranchEntity,
        | "phone"
        | "email"
        | "website"
        | "address_line"
        | "city"
        | "province"
        | "postal_code"
        | "logo_url"
        | "tax_number"
        | "invoice_prefix"
        | "estimate_prefix"
      >
    >,
  ): Promise<ReturnType<BranchScopeService["serializeBranch"]>> {
    if (!actorSeesAllBranches(actor)) {
      apiError(403, "branch_settings_forbidden", "Only owners and admins can update branch profiles.");
    }

    const branch = await this.assertBranchBelongsToOrganization(organizationId, branchId);
    const patch: Partial<BranchEntity> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        (patch as Record<string, unknown>)[key] = value;
      }
    }

    if (Object.keys(patch).length > 0) {
      await this.branchesRepository.update({ id: branch.id, organization_id: organizationId }, patch);
    }

    const reloaded = await this.findBranchForOrganization(organizationId, branch.id);
    return this.serializeBranch(reloaded ?? branch);
  }

  serializeBranch(branch: BranchEntity) {
    return {
      id: branch.id,
      organizationId: branch.organization_id,
      name: branch.name,
      code: branch.code,
      phone: branch.phone,
      email: branch.email,
      website: branch.website,
      addressLine: branch.address_line,
      city: branch.city,
      province: branch.province,
      postalCode: branch.postal_code,
      logoUrl: branch.logo_url,
      taxLabel: branch.tax_label,
      defaultTaxRateBps: branch.default_tax_rate_bps,
      taxNumber: branch.tax_number,
      invoicePrefix: branch.invoice_prefix,
      estimatePrefix: branch.estimate_prefix,
      active: branch.active,
      sortOrder: branch.sort_order,
    };
  }

  async getMembershipBranchAccess(membershipId: string, organizationId: string): Promise<string[]> {
    const membership = await this.membershipBranchAccessRepository.manager.getRepository(MembershipEntity).findOne({
      where: { id: membershipId, organization_id: organizationId },
      select: { id: true },
    });

    if (!membership) {
      apiError(404, "membership_not_found", "The team member could not be found.");
    }

    const rows = await this.membershipBranchAccessRepository.find({
      where: { membership_id: membershipId },
      select: { branch_id: true },
    });

    return rows.map((row) => row.branch_id);
  }

  async replaceMembershipBranchAccess(
    actor: ActorContext,
    organizationId: string,
    membershipId: string,
    branchIds: string[],
  ): Promise<string[]> {
    if (!actorSeesAllBranches(actor)) {
      apiError(403, "branch_access_forbidden", "Only owners and admins can manage branch access.");
    }

    const membership = await this.membershipBranchAccessRepository.manager.getRepository(MembershipEntity).findOne({
      where: { id: membershipId, organization_id: organizationId },
      select: { id: true, role: true },
    });

    if (!membership) {
      apiError(404, "membership_not_found", "The team member could not be found.");
    }

    if (membershipSeesAllBranches(membership.role)) {
      apiError(400, "branch_access_not_required", "Owners and admins already have access to all branches.");
    }

    const uniqueBranchIds = [...new Set(branchIds.map((id) => id.trim()).filter(Boolean))];
    for (const branchId of uniqueBranchIds) {
      await this.assertBranchBelongsToOrganization(organizationId, branchId);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(MembershipBranchAccessEntity).delete({ membership_id: membershipId });
      if (uniqueBranchIds.length > 0) {
        await manager.getRepository(MembershipBranchAccessEntity).save(
          uniqueBranchIds.map((branchId) =>
            manager.getRepository(MembershipBranchAccessEntity).create({
              id: randomUUID(),
              membership_id: membershipId,
              branch_id: branchId,
            }),
          ),
        );
      }
    });

    return uniqueBranchIds;
  }
}
