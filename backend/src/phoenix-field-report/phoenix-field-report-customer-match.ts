import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CustomerEntity } from "../database/entities/customer.entity";
import type {
  MichaelReportCustomerCandidate,
  MichaelReportJobPayload,
} from "./phoenix-field-report.types";

@Injectable()
export class PhoenixFieldReportCustomerMatchService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
  ) {}

  normalizeEmail(value: string | null | undefined) {
    return value?.trim().toLowerCase() ?? null;
  }

  normalizeAddressKey(line1: string, postal: string) {
    return `${line1.trim().toLowerCase()}|${postal.trim().toLowerCase()}`;
  }

  async findCustomerCandidates(organizationId: string, payload: MichaelReportJobPayload) {
    const candidates: MichaelReportCustomerCandidate[] = [];
    const email = this.normalizeEmail(payload.customerEmail);

    if (email) {
      const byEmail = await this.customersRepository.find({
        where: { organization_id: organizationId, email },
        take: 10,
      });

      for (const customer of byEmail) {
        candidates.push({
          id: customer.id,
          fullName: customer.full_name,
          email: customer.email,
          phone: customer.phone,
          serviceAddressLine1: customer.service_address_line_1,
          matchReasons: ["email_exact"],
        });
      }
    }

    const normalizedName = payload.customerName.trim().toLowerCase();
    const addressKey = this.normalizeAddressKey(payload.serviceAddressLine1, payload.servicePostalCode);

    const nameOrAddressMatches = await this.customersRepository
      .createQueryBuilder("customer")
      .where("customer.organization_id = :organizationId", { organizationId })
      .andWhere(
        "(LOWER(customer.full_name) = :normalizedName OR CONCAT(LOWER(customer.service_address_line_1), '|', LOWER(customer.service_postal_code)) = :addressKey)",
        { normalizedName, addressKey },
      )
      .take(10)
      .getMany();

    for (const customer of nameOrAddressMatches) {
      const reasons: string[] = [];
      if (customer.full_name.trim().toLowerCase() === normalizedName) {
        reasons.push("name_exact");
      }

      if (
        this.normalizeAddressKey(customer.service_address_line_1, customer.service_postal_code) === addressKey
      ) {
        reasons.push("address_exact");
      }

      if (reasons.length === 0) {
        continue;
      }

      if (candidates.some((entry) => entry.id === customer.id)) {
        const existing = candidates.find((entry) => entry.id === customer.id);
        existing?.matchReasons.push(...reasons.filter((reason) => !existing.matchReasons.includes(reason)));
        continue;
      }

      candidates.push({
        id: customer.id,
        fullName: customer.full_name,
        email: customer.email,
        phone: customer.phone,
        serviceAddressLine1: customer.service_address_line_1,
        matchReasons: reasons,
      });
    }

    return candidates;
  }

  customerResolutionRequired(payload: MichaelReportJobPayload, candidates: MichaelReportCustomerCandidate[]) {
    if (payload.customerId || payload.createNewCustomer) {
      return false;
    }

    const strongMatch = candidates.some((candidate) => candidate.matchReasons.includes("email_exact"));
    if (strongMatch) {
      return true;
    }

    return candidates.length > 0;
  }
}
