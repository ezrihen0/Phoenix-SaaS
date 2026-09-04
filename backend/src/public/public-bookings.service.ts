import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { createHash } from "crypto";
import { DataSource, EntityManager, QueryFailedError, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { CustomerEntity } from "../database/entities/customer.entity";
import { LeadEntity } from "../database/entities/lead.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { PublicBookingSubmissionEntity } from "../database/entities/public-booking-submission.entity";
import {
  lastTenDigits,
  PUBLIC_BOOKING_MAX_SUBMISSIONS_PER_HOUR,
  resolvePublicBookingIdempotencyKey,
} from "./public-booking-idempotency";

export type PublicBookingInput = {
  fullName: string;
  phone: string;
  email: string | null;
  serviceAddressLine1: string;
  serviceAddressLine2: string | null;
  serviceCity: string;
  serviceStateOrRegion: string | null;
  servicePostalCode: string;
  serviceType: "inspection" | "cleaning" | "repair" | "rebuild";
  description: string | null;
};

export type PublicBookingCreateInput = {
  organizationId: string;
  input: PublicBookingInput;
  idempotencyKeyHeader?: string | null;
  clientIpHash?: string | null;
  testHooks?: PublicBookingTestHooks;
};

export type PublicBookingTestHooks = {
  afterCustomerInsert?: (manager: EntityManager) => void | Promise<void>;
};

export type PublicBookingResult = {
  ok: true;
  leadId: string;
  duplicate: boolean;
  message: string;
};

const SLUG_SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

function isDuplicateEntryError(error: unknown) {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as { code?: string; errno?: number };
  return driverError?.errno === 1062 || driverError?.code === "ER_DUP_ENTRY";
}

@Injectable()
export class PublicBookingsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Resolves an organization for public booking by its unique public slug.
   * Unknown or inactive organizations are rejected without leaking existence details.
   */
  async resolveActiveOrganizationBySlug(organizationSlug: string): Promise<OrganizationEntity> {
    const organizationsRepository = this.dataSource.getRepository(OrganizationEntity);
    const normalized = organizationSlug.trim();
    if (!normalized || normalized.length > 160) {
      apiError(400, "invalid_booking_organization", "A valid organization booking link is required.");
    }

    if (!SLUG_SAFE.test(normalized)) {
      apiError(400, "invalid_booking_organization", "A valid organization booking link is required.");
    }

    const organization = await organizationsRepository.findOne({
      where: {
        slug: normalized,
      },
    });

    if (!organization || !organization.is_active) {
      apiError(404, "booking_unavailable", "Online booking is not available for this link.");
    }

    return organization;
  }

  async createBooking(options: PublicBookingCreateInput): Promise<PublicBookingResult> {
    const idempotencyKey = resolvePublicBookingIdempotencyKey(
      options.organizationId,
      options.input,
      options.idempotencyKeyHeader,
    );
    const phoneLast10 = lastTenDigits(options.input.phone);
    const lockName = createHash("sha256")
      .update(`${options.organizationId}:${idempotencyKey}`)
      .digest("hex");

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const lockRows = await queryRunner.query(
        "SELECT GET_LOCK(?, 10) AS acquired",
        [lockName],
      ) as Array<{ acquired: number | null }>;
      const acquired = Number(lockRows[0]?.acquired ?? 0) === 1;

      if (!acquired) {
        apiError(503, "public_booking_busy", "Booking request is already being processed. Please retry shortly.");
      }

      await queryRunner.startTransaction();

      try {
        const manager = queryRunner.manager;
        const submissionRepo = manager.getRepository(PublicBookingSubmissionEntity);

        const existingSubmission = await this.findSubmissionByIdempotencyKey(
          submissionRepo,
          options.organizationId,
          idempotencyKey,
        );

        if (existingSubmission) {
          await queryRunner.commitTransaction();
          return this.buildDuplicateResult(existingSubmission.lead_id);
        }

        await this.assertSubmissionRateLimit(
          submissionRepo,
          options.organizationId,
          phoneLast10,
          options.clientIpHash ?? null,
        );

        const duplicateLead = await this.findRecentDuplicateLead(
          manager.getRepository(LeadEntity),
          options.organizationId,
          options.input,
        );

        if (duplicateLead) {
          const customer = await this.findOrCreateCustomerForBooking(
            manager,
            options.organizationId,
            options.input,
            options.testHooks,
          );

          if (customer && !duplicateLead.customer_id) {
            duplicateLead.customer_id = customer.id;
            await manager.getRepository(LeadEntity).save(duplicateLead);
          }

          await this.saveSubmissionReceipt({
            manager,
            organizationId: options.organizationId,
            idempotencyKey,
            leadId: duplicateLead.id,
            customerId: duplicateLead.customer_id ?? customer?.id ?? null,
            clientIpHash: options.clientIpHash ?? null,
            phoneLast10,
          });

          await queryRunner.commitTransaction();
          return this.buildDuplicateResult(duplicateLead.id);
        }

        const customer = await this.findOrCreateCustomerForBooking(
          manager,
          options.organizationId,
          options.input,
          options.testHooks,
        );

        const lead = await manager.getRepository(LeadEntity).save(
          manager.getRepository(LeadEntity).create({
            organization_id: options.organizationId,
            full_name: options.input.fullName,
            phone: options.input.phone,
            email: options.input.email,
            service_address_line_1: options.input.serviceAddressLine1,
            service_address_line_2: options.input.serviceAddressLine2,
            service_city: options.input.serviceCity,
            service_state_or_region: options.input.serviceStateOrRegion,
            service_postal_code: options.input.servicePostalCode,
            source: "website",
            service_type: options.input.serviceType,
            description: options.input.description,
            customer_id: customer?.id ?? null,
            created_by_auth_user_id: null,
          }),
        );

        await this.saveSubmissionReceipt({
          manager,
          organizationId: options.organizationId,
          idempotencyKey,
          leadId: lead.id,
          customerId: customer?.id ?? null,
          clientIpHash: options.clientIpHash ?? null,
          phoneLast10,
        });

        await queryRunner.commitTransaction();

        return {
          ok: true as const,
          leadId: lead.id,
          duplicate: false,
          message: "Booking request received.",
        };
      } catch (error) {
        await queryRunner.rollbackTransaction();

        if (isDuplicateEntryError(error)) {
          const racedSubmission = await this.findSubmissionByIdempotencyKey(
            this.dataSource.getRepository(PublicBookingSubmissionEntity),
            options.organizationId,
            idempotencyKey,
          );

          if (racedSubmission) {
            return this.buildDuplicateResult(racedSubmission.lead_id);
          }
        }

        throw error;
      }
    } finally {
      await queryRunner.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => undefined);
      await queryRunner.release();
    }
  }

  private buildDuplicateResult(leadId: string): PublicBookingResult {
    return {
      ok: true,
      leadId,
      duplicate: true,
      message: "Booking request already received.",
    };
  }

  private async findSubmissionByIdempotencyKey(
    repository: Repository<PublicBookingSubmissionEntity>,
    organizationId: string,
    idempotencyKey: string,
  ) {
    return repository.findOne({
      where: {
        organization_id: organizationId,
        idempotency_key: idempotencyKey,
      },
    });
  }

  private async assertSubmissionRateLimit(
    repository: Repository<PublicBookingSubmissionEntity>,
    organizationId: string,
    phoneLast10: string | null,
    clientIpHash: string | null,
  ) {
    const query = repository.createQueryBuilder("submission")
      .where("submission.organization_id = :organizationId", { organizationId })
      .andWhere("submission.created_at >= DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL 1 HOUR)");

    const predicates: string[] = [];
    const parameters: Record<string, string> = { organizationId };

    if (phoneLast10) {
      predicates.push("submission.phone_last_10 = :phoneLast10");
      parameters.phoneLast10 = phoneLast10;
    }

    if (clientIpHash) {
      predicates.push("submission.client_ip_hash = :clientIpHash");
      parameters.clientIpHash = clientIpHash;
    }

    if (predicates.length === 0) {
      return;
    }

    query.andWhere(`(${predicates.join(" OR ")})`, parameters);

    const recentCount = await query.getCount();
    if (recentCount >= PUBLIC_BOOKING_MAX_SUBMISSIONS_PER_HOUR) {
      apiError(
        429,
        "public_booking_rate_limited",
        "Too many booking requests were submitted recently. Please try again later.",
      );
    }
  }

  private async saveSubmissionReceipt(input: {
    manager: EntityManager;
    organizationId: string;
    idempotencyKey: string;
    leadId: string;
    customerId: string | null;
    clientIpHash: string | null;
    phoneLast10: string | null;
  }) {
    try {
      await input.manager.getRepository(PublicBookingSubmissionEntity).save(
        input.manager.getRepository(PublicBookingSubmissionEntity).create({
          organization_id: input.organizationId,
          idempotency_key: input.idempotencyKey,
          lead_id: input.leadId,
          customer_id: input.customerId,
          client_ip_hash: input.clientIpHash,
          phone_last_10: input.phoneLast10,
        }),
      );
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        return;
      }

      throw error;
    }
  }

  private async findOrCreateCustomerForBooking(
    manager: EntityManager,
    organizationId: string,
    input: PublicBookingInput,
    testHooks?: PublicBookingTestHooks,
  ) {
    const customersRepository = manager.getRepository(CustomerEntity);
    const email = input.email?.trim().toLowerCase() ?? null;
    const phoneDigits = lastTenDigits(input.phone);

    const candidates = await customersRepository.find({
      where: {
        organization_id: organizationId,
      },
      take: 1000,
      order: {
        updated_at: "DESC",
      },
    });

    const existing = candidates.find((customer) => {
      const customerEmail = customer.email?.trim().toLowerCase() ?? null;
      if (email && customerEmail === email) {
        return true;
      }

      return Boolean(phoneDigits) && lastTenDigits(customer.phone) === phoneDigits;
    }) ?? null;

    if (existing) {
      return existing;
    }

    const created = await customersRepository.save(customersRepository.create({
      organization_id: organizationId,
      full_name: input.fullName,
      email: input.email,
      company_name: null,
      service_address_line_1: input.serviceAddressLine1,
      service_address_line_2: input.serviceAddressLine2,
      service_city: input.serviceCity,
      service_state_or_region: input.serviceStateOrRegion,
      service_postal_code: input.servicePostalCode,
      phone: input.phone,
      source: "website",
      preferred_service_type: input.serviceType,
      lifecycle_status: "prospect",
      notes: input.description,
    }));

    await testHooks?.afterCustomerInsert?.(manager);
    return created;
  }

  private async findRecentDuplicateLead(
    leadsRepository: Repository<LeadEntity>,
    organizationId: string,
    input: PublicBookingInput,
  ) {
    const candidates = await leadsRepository.createQueryBuilder("lead")
      .where("lead.organization_id = :organizationId", { organizationId })
      .andWhere("lead.source = :source", { source: "website" })
      .andWhere("lead.service_type = :serviceType", { serviceType: input.serviceType })
      .andWhere("LOWER(lead.service_address_line_1) = :line1", { line1: input.serviceAddressLine1.toLowerCase() })
      .andWhere("LOWER(lead.service_city) = :city", { city: input.serviceCity.toLowerCase() })
      .andWhere("LOWER(lead.service_postal_code) = :postal", { postal: input.servicePostalCode.toLowerCase() })
      .andWhere("lead.created_at >= DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL 30 MINUTE)")
      .orderBy("lead.created_at", "DESC")
      .take(25)
      .getMany();

    const email = input.email?.trim().toLowerCase() ?? null;
    const phoneDigits = lastTenDigits(input.phone);

    return candidates.find((lead) => {
      const leadEmail = lead.email?.trim().toLowerCase() ?? null;
      if (email && leadEmail === email) {
        return true;
      }

      return Boolean(phoneDigits) && lastTenDigits(lead.phone) === phoneDigits;
    }) ?? null;
  }
}
