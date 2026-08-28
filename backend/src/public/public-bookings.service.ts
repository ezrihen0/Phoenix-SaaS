import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { CustomerEntity } from "../database/entities/customer.entity";
import { LeadEntity } from "../database/entities/lead.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";

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

const SLUG_SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

@Injectable()
export class PublicBookingsService {
  constructor(
    @InjectRepository(LeadEntity)
    private readonly leadsRepository: Repository<LeadEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly organizationsRepository: Repository<OrganizationEntity>,
  ) {}

  /**
   * Resolves an organization for public booking by its unique public slug.
   * Unknown or inactive organizations are rejected without leaking existence details.
   */
  async resolveActiveOrganizationBySlug(organizationSlug: string): Promise<OrganizationEntity> {
    const normalized = organizationSlug.trim();
    if (!normalized || normalized.length > 160) {
      apiError(400, "invalid_booking_organization", "A valid organization booking link is required.");
    }

    if (!SLUG_SAFE.test(normalized)) {
      apiError(400, "invalid_booking_organization", "A valid organization booking link is required.");
    }

    const organization = await this.organizationsRepository.findOne({
      where: {
        slug: normalized,
      },
    });

    if (!organization || !organization.is_active) {
      apiError(404, "booking_unavailable", "Online booking is not available for this link.");
    }

    return organization;
  }

  async createBooking(organizationId: string, input: PublicBookingInput) {
    const customer = await this.findOrCreateCustomerForBooking(organizationId, input);
    const duplicateLead = await this.findRecentDuplicateLead(organizationId, input);

    if (duplicateLead) {
      if (customer && !duplicateLead.customer_id) {
        duplicateLead.customer_id = customer.id;
        await this.leadsRepository.save(duplicateLead);
      }

      return {
        ok: true as const,
        leadId: duplicateLead.id,
        duplicate: true,
        message: "Booking request already received.",
      };
    }

    const lead = await this.leadsRepository.save(
      this.leadsRepository.create({
        organization_id: organizationId,
        full_name: input.fullName,
        phone: input.phone,
        email: input.email,
        service_address_line_1: input.serviceAddressLine1,
        service_address_line_2: input.serviceAddressLine2,
        service_city: input.serviceCity,
        service_state_or_region: input.serviceStateOrRegion,
        service_postal_code: input.servicePostalCode,
        source: "website",
        service_type: input.serviceType,
        description: input.description,
        customer_id: customer?.id ?? null,
        created_by_auth_user_id: null,
      }),
    );

    return {
      ok: true as const,
      leadId: lead.id,
      duplicate: false,
      message: "Booking request received.",
    };
  }

  private async findOrCreateCustomerForBooking(organizationId: string, input: PublicBookingInput) {
    const email = input.email?.trim().toLowerCase() ?? null;
    const phoneDigits = this.lastTenDigits(input.phone);

    const candidates = await this.customersRepository.find({
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

      return Boolean(phoneDigits) && this.lastTenDigits(customer.phone) === phoneDigits;
    }) ?? null;

    if (existing) {
      return existing;
    }

    return this.customersRepository.save(this.customersRepository.create({
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
  }

  private async findRecentDuplicateLead(organizationId: string, input: PublicBookingInput) {
    const candidates = await this.leadsRepository.createQueryBuilder("lead")
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
    const phoneDigits = this.lastTenDigits(input.phone);

    return candidates.find((lead) => {
      const leadEmail = lead.email?.trim().toLowerCase() ?? null;
      if (email && leadEmail === email) {
        return true;
      }

      return Boolean(phoneDigits) && this.lastTenDigits(lead.phone) === phoneDigits;
    }) ?? null;
  }

  private lastTenDigits(value: string | null | undefined) {
    const digits = (value ?? "").replace(/\D/g, "");
    return digits.length >= 10 ? digits.slice(-10) : null;
  }
}
