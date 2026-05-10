import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { LeadEntity } from "../database/entities/lead.entity";

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

@Injectable()
export class PublicBookingsService {
  constructor(
    @InjectRepository(LeadEntity)
    private readonly leadsRepository: Repository<LeadEntity>,
  ) {}

  async createBooking(input: PublicBookingInput) {
    const lead = await this.leadsRepository.save(
      this.leadsRepository.create({
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
