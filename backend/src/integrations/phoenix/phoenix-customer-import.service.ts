import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { PortalIdentityService } from "../../customer-portal/portal-identity.service";
import { CustomerEntity } from "../../database/entities/customer.entity";
import { JobEntity } from "../../database/entities/job.entity";
import { parseWorkizCsvAddress } from "../../database/workiz/workiz-customer-csv-parser";
import {
  buildPhoenixWorkizImportNotes,
  parsePhoenixWorkizImportNotes,
  provenanceMatchesBatch,
  type PhoenixWorkizImportProvenance,
} from "./phoenix-customer-import.provenance";

export type PhoenixCustomerImportRecordInput = {
  sourceReference: string;
  sourceCustomerId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  postalCode?: string | null;
};

export type PhoenixCustomerImportRowResult =
  | {
      sourceCustomerId: string;
      sourceReference: string;
      status: "CREATED";
      customerId: string;
    }
  | {
      sourceCustomerId: string;
      sourceReference: string;
      status: "ALREADY_IMPORTED";
      customerId: string;
    }
  | {
      sourceCustomerId: string;
      sourceReference: string;
      status: "SKIPPED_COLLISION";
      customerId: string | null;
      collisionReason: string;
    }
  | {
      sourceCustomerId: string;
      sourceReference: string;
      status: "FAILED";
      customerId: null;
      error: string;
    }
  | {
      sourceCustomerId: string;
      sourceReference: string;
      status: "DRY_RUN_WOULD_CREATE";
      customerId: null;
    }
  | {
      sourceCustomerId: string;
      sourceReference: string;
      status: "DRY_RUN_ALREADY_IMPORTED";
      customerId: string;
    };

function normalizeEmail(value: string | null | undefined) {
  const email = (value || "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

function normalizePhone(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const digits = value.replace(/\D+/g, "");
  return digits || null;
}

function formatCanadianPostalCode(value: string | null | undefined) {
  const compact = (value || "").toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/[A-Z]\d[A-Z]\d[A-Z]\d/);
  return match?.[0] || compact.slice(0, 20);
}

@Injectable()
export class PhoenixCustomerImportService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
    private readonly portalIdentityService: PortalIdentityService,
  ) {}

  async exportOrganizationCustomers(organizationId: string) {
    const customers = await this.customersRepository.find({
      where: { organization_id: organizationId },
      order: { created_at: "DESC" },
    });

    return customers.map((customer) => ({
      id: customer.id,
      externalClientNumber: customer.external_client_number,
      name: customer.full_name,
      email: customer.email,
      phone: customer.phone,
      addressLine1: customer.service_address_line_1,
      city: customer.service_city,
      region: customer.service_state_or_region,
      postalCode: customer.service_postal_code,
      notes: customer.notes,
      provenance: parsePhoenixWorkizImportNotes(customer.notes),
      createdAt: customer.created_at.toISOString(),
    }));
  }

  async importBatch(input: {
    organizationId: string;
    importBatch: string;
    dryRun: boolean;
    records: PhoenixCustomerImportRecordInput[];
  }) {
    const organizationCustomers = await this.customersRepository.find({
      where: { organization_id: input.organizationId },
    });

    const results: PhoenixCustomerImportRowResult[] = [];

    for (const record of input.records) {
      results.push(
        await this.importOne({
          organizationId: input.organizationId,
          importBatch: input.importBatch,
          dryRun: input.dryRun,
          record,
          organizationCustomers,
        }),
      );
    }

    const summary = {
      total: results.length,
      created: results.filter((row) => row.status === "CREATED").length,
      alreadyImported: results.filter((row) => row.status === "ALREADY_IMPORTED" || row.status === "DRY_RUN_ALREADY_IMPORTED").length,
      skippedCollision: results.filter((row) => row.status === "SKIPPED_COLLISION").length,
      failed: results.filter((row) => row.status === "FAILED").length,
      dryRunWouldCreate: results.filter((row) => row.status === "DRY_RUN_WOULD_CREATE").length,
    };

    return { results, summary };
  }

  async verifyImportedCustomers(input: {
    organizationId: string;
    customerIds: string[];
  }) {
    const customers = input.customerIds.length
      ? await this.customersRepository.find({
          where: {
            id: In(input.customerIds),
            organization_id: input.organizationId,
          },
        })
      : [];

    const jobs = input.customerIds.length
      ? await this.jobsRepository
          .createQueryBuilder("job")
          .where("job.customer_id IN (:...customerIds)", { customerIds: input.customerIds })
          .getMany()
      : [];

    return {
      customers,
      jobCount: jobs.length,
      jobs: jobs.map((job) => ({ id: job.id, customerId: job.customer_id })),
    };
  }

  private async importOne(input: {
    organizationId: string;
    importBatch: string;
    dryRun: boolean;
    record: PhoenixCustomerImportRecordInput;
    organizationCustomers: CustomerEntity[];
  }): Promise<PhoenixCustomerImportRowResult> {
    const sourceCustomerId = input.record.sourceCustomerId.trim();
    const sourceReference = input.record.sourceReference.trim();
    const fullName = input.record.name.trim();
    const email = normalizeEmail(input.record.email);
    const phoneDigits = normalizePhone(input.record.phone);
    const phone = phoneDigits || input.record.phone.trim();

    if (!sourceCustomerId || !fullName || !email || !phone) {
      return {
        sourceCustomerId,
        sourceReference,
        status: "FAILED",
        customerId: null,
        error: "Missing required name, email, phone, or source customer id.",
      };
    }

    const parsedAddress = parseWorkizCsvAddress(input.record.address);
    const servicePostalCode = formatCanadianPostalCode(
      input.record.postalCode || parsedAddress.servicePostalCode,
    );
    const serviceAddressLine1 = parsedAddress.addressLine1 || input.record.address.trim();

    if (!serviceAddressLine1) {
      return {
        sourceCustomerId,
        sourceReference,
        status: "FAILED",
        customerId: null,
        error: "Address could not be parsed.",
      };
    }

    const byExternalId = input.organizationCustomers.filter(
      (customer) => (customer.external_client_number || "").trim() === sourceCustomerId,
    );

    const provenanceMatch = byExternalId.find((customer) =>
      provenanceMatchesBatch(customer.notes, sourceCustomerId, input.importBatch),
    );

    if (provenanceMatch) {
      return input.dryRun
        ? {
            sourceCustomerId,
            sourceReference,
            status: "DRY_RUN_ALREADY_IMPORTED",
            customerId: provenanceMatch.id,
          }
        : {
            sourceCustomerId,
            sourceReference,
            status: "ALREADY_IMPORTED",
            customerId: provenanceMatch.id,
          };
    }

    if (byExternalId.length > 0) {
      return {
        sourceCustomerId,
        sourceReference,
        status: "SKIPPED_COLLISION",
        customerId: byExternalId[0]?.id ?? null,
        collisionReason: "external_client_number already used by a different import provenance",
      };
    }

    for (const customer of input.organizationCustomers) {
      const customerEmail = normalizeEmail(customer.email);
      const customerPhone = normalizePhone(customer.phone);

      if (email && customerEmail && email === customerEmail) {
        return {
          sourceCustomerId,
          sourceReference,
          status: "SKIPPED_COLLISION",
          customerId: customer.id,
          collisionReason: "normalized email collision with existing customer",
        };
      }

      if (phoneDigits && customerPhone && phoneDigits === customerPhone) {
        return {
          sourceCustomerId,
          sourceReference,
          status: "SKIPPED_COLLISION",
          customerId: customer.id,
          collisionReason: "normalized phone collision with existing customer",
        };
      }
    }

    const provenance: PhoenixWorkizImportProvenance = {
      sourceSystem: "workiz",
      sourceCustomerId,
      sourceReference,
      importBatch: input.importBatch,
      importedAt: new Date().toISOString(),
    };

    if (input.dryRun) {
      return {
        sourceCustomerId,
        sourceReference,
        status: "DRY_RUN_WOULD_CREATE",
        customerId: null,
      };
    }

    try {
      const saved = await this.customersRepository.save(
        this.customersRepository.create({
          organization_id: input.organizationId,
          external_client_number: sourceCustomerId,
          full_name: fullName,
          email,
          phone,
          company_name: null,
          service_address_line_1: serviceAddressLine1,
          service_address_line_2: null,
          service_city: parsedAddress.serviceCity || "",
          service_state_or_region: parsedAddress.serviceStateOrRegion,
          service_postal_code: servicePostalCode,
          source: "other",
          notes: buildPhoenixWorkizImportNotes(provenance),
          lifecycle_status: "past",
          legacy_created_at: null,
        }),
      );

      input.organizationCustomers.push(saved);
      await this.portalIdentityService.ensurePortalIdentityForCustomer(saved.id);

      return {
        sourceCustomerId,
        sourceReference,
        status: "CREATED",
        customerId: saved.id,
      };
    } catch (error) {
      return {
        sourceCustomerId,
        sourceReference,
        status: "FAILED",
        customerId: null,
        error: error instanceof Error ? error.message : "Customer create failed.",
      };
    }
  }
}
