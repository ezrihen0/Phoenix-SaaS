import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
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
        created_by_auth_user_id: null,
      }),
    );

    return {
      ok: true as const,
      leadId: lead.id,
      message: "Booking request received.",
    };
  }
}
