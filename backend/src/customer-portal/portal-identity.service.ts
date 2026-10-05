import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CustomerEntity } from "../database/entities/customer.entity";
import {
  PortalIdentityEntity,
  type PortalIdentityStatus,
} from "../database/entities/portal-identity.entity";
import { normalizeEmail } from "../database/workiz/workiz-invoice-parser";

export type PortalIdentityReadiness = {
  status: PortalIdentityStatus;
  primaryEmailNormalized: string | null;
};

@Injectable()
export class PortalIdentityService {
  constructor(
    @InjectRepository(PortalIdentityEntity)
    private readonly identitiesRepository: Repository<PortalIdentityEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
  ) {}

  evaluateCustomerReadiness(
    organizationId: string,
    customer: Pick<CustomerEntity, "email">,
  ): PortalIdentityReadiness {
    const primaryEmailNormalized = normalizeEmail(customer.email);
    if (!primaryEmailNormalized) {
      return { status: "email_required", primaryEmailNormalized: null };
    }

    return { status: "ready", primaryEmailNormalized };
  }

  async evaluateCustomerReadinessWithDuplicateCheck(
    organizationId: string,
    customer: Pick<CustomerEntity, "id" | "email">,
  ): Promise<PortalIdentityReadiness> {
    const base = this.evaluateCustomerReadiness(organizationId, customer);
    if (base.status !== "ready" || !base.primaryEmailNormalized) {
      return base;
    }

    const duplicateCount = await this.customersRepository
      .createQueryBuilder("customer")
      .where("customer.organization_id = :organizationId", { organizationId })
      .andWhere("LOWER(TRIM(customer.email)) = :email", { email: base.primaryEmailNormalized })
      .getCount();

    if (duplicateCount > 1) {
      return { status: "manual_review", primaryEmailNormalized: base.primaryEmailNormalized };
    }

    return base;
  }

  async ensurePortalIdentityForCustomer(customerId: string): Promise<PortalIdentityEntity> {
    const id = customerId.trim();
    if (!id) {
      throw new BadRequestException({
        error: { code: "invalid_customer_id", message: "customerId is required." },
      });
    }

    const existing = await this.identitiesRepository.findOne({ where: { customer_id: id } });
    if (existing) {
      return this.refreshPortalIdentity(existing.customer_id);
    }

    const customer = await this.customersRepository.findOne({
      where: { id },
      select: { id: true, organization_id: true, email: true },
    });

    if (!customer?.organization_id) {
      throw new NotFoundException({
        error: { code: "customer_not_found", message: "Customer could not be found." },
      });
    }

    const organizationId = customer.organization_id.trim();
    const readiness = await this.evaluateCustomerReadinessWithDuplicateCheck(organizationId, customer);
    const now = new Date();

    try {
      return await this.identitiesRepository.save(
        this.identitiesRepository.create({
          organization_id: organizationId,
          customer_id: customer.id,
          status: readiness.status,
          primary_email_normalized: readiness.primaryEmailNormalized,
          last_evaluated_at: now,
        }),
      );
    } catch {
      const raced = await this.identitiesRepository.findOne({ where: { customer_id: id } });
      if (raced) {
        return this.refreshPortalIdentity(raced.customer_id);
      }
      throw new BadRequestException({
        error: { code: "portal_identity_ensure_failed", message: "Portal identity could not be ensured." },
      });
    }
  }

  async refreshPortalIdentity(customerId: string): Promise<PortalIdentityEntity> {
    const identity = await this.identitiesRepository.findOne({ where: { customer_id: customerId.trim() } });
    if (!identity) {
      return this.ensurePortalIdentityForCustomer(customerId);
    }

    const customer = await this.customersRepository.findOne({
      where: { id: identity.customer_id, organization_id: identity.organization_id },
      select: { id: true, email: true },
    });

    if (!customer) {
      throw new NotFoundException({
        error: { code: "customer_not_found", message: "Customer could not be found." },
      });
    }

    const readiness = await this.evaluateCustomerReadinessWithDuplicateCheck(
      identity.organization_id,
      { id: customer.id, email: customer.email },
    );

    identity.status = readiness.status;
    identity.primary_email_normalized = readiness.primaryEmailNormalized;
    identity.last_evaluated_at = new Date();
    return this.identitiesRepository.save(identity);
  }

  async findReadyIdentityByEmail(organizationId: string, email: string): Promise<PortalIdentityEntity | null> {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      return null;
    }

    const matches = await this.customersRepository
      .createQueryBuilder("customer")
      .select(["customer.id"])
      .where("customer.organization_id = :organizationId", { organizationId: organizationId.trim() })
      .andWhere("LOWER(TRIM(customer.email)) = :email", { email: normalized })
      .getMany();

    if (matches.length !== 1) {
      return null;
    }

    const identity = await this.ensurePortalIdentityForCustomer(matches[0]!.id);
    if (identity.status !== "ready") {
      return null;
    }

    return identity;
  }

  assertIdentityReadyForAuthentication(identity: PortalIdentityEntity) {
    if (identity.status === "manual_review") {
      throw new BadRequestException({
        error: {
          code: "portal_identity_manual_review",
          message: "This portal account needs manual review before sign-in.",
        },
      });
    }

    if (identity.status === "email_required") {
      throw new BadRequestException({
        error: {
          code: "portal_identity_not_ready",
          message: "A valid email is required before portal sign-in.",
        },
      });
    }
  }
}
