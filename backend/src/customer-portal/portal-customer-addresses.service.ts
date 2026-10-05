import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CustomerEntity } from "../database/entities/customer.entity";
import { JobEntity } from "../database/entities/job.entity";
import { LeadEntity } from "../database/entities/lead.entity";

export type PortalCustomerAddress = {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  isPrimary: boolean;
};

function normalizeAddressKey(input: {
  line1: string;
  city: string;
  postalCode: string;
}) {
  return [
    input.line1.trim().toLowerCase(),
    input.city.trim().toLowerCase(),
    input.postalCode.trim().toLowerCase().replace(/\s+/g, ""),
  ].join("|");
}

function formatAddressLine(address: PortalCustomerAddress) {
  const parts = [address.line1, address.city, address.postalCode].filter(Boolean);
  return parts.join(", ");
}

@Injectable()
export class PortalCustomerAddressesService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
    @InjectRepository(LeadEntity)
    private readonly leadsRepository: Repository<LeadEntity>,
  ) {}

  async listAddressesForCustomer(organizationId: string, customerId: string): Promise<PortalCustomerAddress[]> {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId, organization_id: organizationId },
    });
    if (!customer) {
      return [];
    }

    const addresses: PortalCustomerAddress[] = [];
    const seen = new Set<string>();

    const primary: PortalCustomerAddress = {
      id: "primary",
      label: "Primary on file",
      line1: customer.service_address_line_1,
      line2: customer.service_address_line_2,
      city: customer.service_city,
      region: customer.service_state_or_region,
      postalCode: customer.service_postal_code,
      isPrimary: true,
    };
    addresses.push(primary);
    seen.add(normalizeAddressKey(primary));

    const jobs = await this.jobsRepository.find({
      where: { organization_id: organizationId, customer_id: customerId },
      order: { updated_at: "DESC" },
      take: 50,
    });
    for (const job of jobs) {
      this.pushAddressIfNew(addresses, seen, job, "From a past job");
    }

    const leads = await this.leadsRepository.find({
      where: { organization_id: organizationId, customer_id: customerId },
      order: { created_at: "DESC" },
      take: 50,
    });
    for (const lead of leads) {
      this.pushAddressIfNew(addresses, seen, lead, "From a past request");
    }

    return addresses;
  }

  resolveSelectedAddress(
    addresses: PortalCustomerAddress[],
    selectedAddressId: string | null,
    newAddress: Omit<PortalCustomerAddress, "id" | "label" | "isPrimary"> | null,
  ) {
    if (newAddress) {
      return newAddress;
    }

    const selected = addresses.find((row) => row.id === selectedAddressId?.trim());
    if (!selected) {
      return null;
    }

    return {
      line1: selected.line1,
      line2: selected.line2,
      city: selected.city,
      region: selected.region,
      postalCode: selected.postalCode,
    };
  }

  formatAddressLineForSummary(address: {
    line1: string;
    city: string;
    postalCode: string;
  }) {
    return formatAddressLine({
      id: "",
      label: "",
      line1: address.line1,
      line2: null,
      city: address.city,
      region: null,
      postalCode: address.postalCode,
      isPrimary: false,
    });
  }

  private pushAddressIfNew(
    addresses: PortalCustomerAddress[],
    seen: Set<string>,
    row: {
      service_address_line_1: string;
      service_address_line_2: string | null;
      service_city: string;
      service_state_or_region: string | null;
      service_postal_code: string;
      id: string;
    },
    label: string,
  ) {
    const candidate: PortalCustomerAddress = {
      id: row.id,
      label,
      line1: row.service_address_line_1,
      line2: row.service_address_line_2,
      city: row.service_city,
      region: row.service_state_or_region,
      postalCode: row.service_postal_code,
      isPrimary: false,
    };
    const key = normalizeAddressKey(candidate);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    addresses.push(candidate);
  }
}
