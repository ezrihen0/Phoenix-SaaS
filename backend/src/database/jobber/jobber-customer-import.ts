import { randomUUID } from "crypto";

import { DataSource } from "typeorm";

import type { LeadSource } from "../../crm/constants";
import { CustomerEntity } from "../entities/customer.entity";
import { ensureCustomerTag, JOBBER_CUSTOMER_TAG, normalizeCustomerTags } from "./customer-tags";
import {
  hasValidPostalCode,
  loadJobberClientsCsv,
  loadJobberExportBundle,
  normalizeName,
  normalizePhoneDigits,
  type JobberClientRow,
} from "./jobber-csv-parser";
import { normalizeEmail } from "../workiz/workiz-invoice-parser";

const IMPORT_NOTES = "Imported from Jobber client export (Apollo Chimney & Fireplace).";

export type JobberCustomerImportAction =
  | "create"
  | "enrich"
  | "tag_only"
  | "duplicate"
  | "rejected";

export type JobberCustomerImportRecord = {
  externalClientNumber: string;
  action: JobberCustomerImportAction;
  matchStrategy: string | null;
  matchedCustomerId: string | null;
  rejectedReason: string | null;
  source: JobberClientRow;
  mapped: {
    external_client_number: string;
    full_name: string;
    email: string | null;
    company_name: string | null;
    service_address_line_1: string;
    service_city: string;
    service_state_or_region: string | null;
    service_postal_code: string;
    phone: string;
    legacy_created_at: Date | null;
    source: LeadSource;
    lifecycle_status: "past";
    notes: string;
    tags: string[];
  };
  enrichmentPatch: Partial<CustomerEntity> | null;
};

export type JobberCustomerImportReport = {
  mode: "preview" | "execute";
  sourceDirectory: string;
  sourceRows: number;
  create: number;
  enrich: number;
  tagOnly: number;
  duplicate: number;
  rejected: number;
  jobberTagApplied: number;
  stopReason: string | null;
  schemaErrors: string[];
  records: JobberCustomerImportRecord[];
  importedCustomerIds: string[];
  updatedCustomerIds: string[];
  organizationId: string;
};

type CustomerIndexes = {
  byExternal: Map<string, CustomerEntity>;
  byEmail: Map<string, CustomerEntity>;
  byPhoneDigits: Map<string, CustomerEntity>;
  byNamePostal: Map<string, CustomerEntity>;
};

function mapLeadSource(raw: string | null): LeadSource {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized.includes("google")) return "google";
  if (normalized.includes("facebook")) return "facebook";
  if (normalized.includes("referral")) return "referral";
  if (normalized.includes("phone")) return "phone";
  if (normalized.includes("website")) return "website";
  return "other";
}

function fieldIsEmpty(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

function phoneIsEmpty(value: string | null | undefined): boolean {
  if (fieldIsEmpty(value)) return true;
  const digits = value!.replace(/\D/g, "");
  return digits.length < 10 || digits === "0000000000";
}

function mapRow(row: JobberClientRow) {
  return {
    external_client_number: row.externalClientNumber,
    full_name: row.contactName,
    email: row.email,
    company_name: row.companyName,
    service_address_line_1: row.addressLine1 || row.billingAddressRaw,
    service_city: row.serviceCity,
    service_state_or_region: row.serviceStateOrRegion,
    service_postal_code: row.servicePostalCode,
    phone: row.phone as string,
    legacy_created_at: row.legacyCreatedAt,
    source: mapLeadSource(row.leadSourceRaw),
    lifecycle_status: "past" as const,
    notes: IMPORT_NOTES,
    tags: [JOBBER_CUSTOMER_TAG],
  };
}

function buildCustomerIndexes(customers: CustomerEntity[]): CustomerIndexes {
  const byExternal = new Map<string, CustomerEntity>();
  const byEmail = new Map<string, CustomerEntity>();
  const byPhoneDigits = new Map<string, CustomerEntity>();
  const byNamePostal = new Map<string, CustomerEntity>();

  for (const customer of customers) {
    if (customer.external_client_number?.startsWith("jobber:")) {
      byExternal.set(customer.external_client_number.trim(), customer);
    }
    const email = normalizeEmail(customer.email);
    if (email) byEmail.set(email, customer);
    const phoneDigits = normalizePhoneDigits(customer.phone);
    if (phoneDigits) byPhoneDigits.set(phoneDigits, customer);
    const postal = customer.service_postal_code.trim().toUpperCase();
    if (postal && hasValidPostalCode(postal)) {
      byNamePostal.set(`${normalizeName(customer.full_name)}::${postal}`, customer);
    }
  }

  return { byExternal, byEmail, byPhoneDigits, byNamePostal };
}

function findExistingCustomer(row: JobberClientRow, indexes: CustomerIndexes) {
  const byExternal = indexes.byExternal.get(row.externalClientNumber);
  if (byExternal) return { customer: byExternal, strategy: "external_client_number" };

  if (row.email) {
    const byEmail = indexes.byEmail.get(row.email);
    if (byEmail) return { customer: byEmail, strategy: "email" };
  }

  if (row.phoneDigits) {
    const byPhone = indexes.byPhoneDigits.get(row.phoneDigits);
    if (byPhone) return { customer: byPhone, strategy: "phone" };
  }

  const postal = row.servicePostalCode.trim().toUpperCase();
  if (postal && hasValidPostalCode(postal)) {
    const byNamePostal = indexes.byNamePostal.get(`${normalizeName(row.contactName)}::${postal}`);
    if (byNamePostal) return { customer: byNamePostal, strategy: "name_postal" };
  }

  return null;
}

function buildEnrichmentPatch(existing: CustomerEntity, mapped: ReturnType<typeof mapRow>): Partial<CustomerEntity> {
  const patch: Partial<CustomerEntity> = {};
  if (mapped.email && fieldIsEmpty(existing.email)) patch.email = mapped.email;
  if (mapped.phone && phoneIsEmpty(existing.phone)) patch.phone = mapped.phone;
  if (mapped.company_name && fieldIsEmpty(existing.company_name)) patch.company_name = mapped.company_name;
  if (mapped.service_address_line_1 && fieldIsEmpty(existing.service_address_line_1)) {
    patch.service_address_line_1 = mapped.service_address_line_1;
  }
  if (mapped.service_city && fieldIsEmpty(existing.service_city)) patch.service_city = mapped.service_city;
  if (mapped.service_state_or_region && fieldIsEmpty(existing.service_state_or_region)) {
    patch.service_state_or_region = mapped.service_state_or_region;
  }
  if (mapped.service_postal_code && fieldIsEmpty(existing.service_postal_code)) {
    patch.service_postal_code = mapped.service_postal_code;
  }
  if (fieldIsEmpty(existing.external_client_number)) {
    patch.external_client_number = mapped.external_client_number;
  }
  if (!existing.legacy_created_at && mapped.legacy_created_at) {
    patch.legacy_created_at = mapped.legacy_created_at;
  }
  const nextTags = ensureCustomerTag(existing.tags, JOBBER_CUSTOMER_TAG);
  if (JSON.stringify(normalizeCustomerTags(existing.tags)) !== JSON.stringify(nextTags)) {
    patch.tags = nextTags;
  }
  return patch;
}

function classifyRow(row: JobberClientRow, indexes: CustomerIndexes): JobberCustomerImportRecord {
  const mapped = mapRow(row);

  if (!row.contactName.trim()) {
    return {
      externalClientNumber: row.externalClientNumber,
      action: "rejected",
      matchStrategy: null,
      matchedCustomerId: null,
      rejectedReason: "Missing contact name",
      source: row,
      mapped,
      enrichmentPatch: null,
    };
  }

  if (!row.addressLine1.trim() && !row.billingAddressRaw.trim()) {
    return {
      externalClientNumber: row.externalClientNumber,
      action: "rejected",
      matchStrategy: null,
      matchedCustomerId: null,
      rejectedReason: "Missing address",
      source: row,
      mapped,
      enrichmentPatch: null,
    };
  }

  if (!row.phone) {
    return {
      externalClientNumber: row.externalClientNumber,
      action: "rejected",
      matchStrategy: null,
      matchedCustomerId: null,
      rejectedReason: "Missing valid phone and no email for placeholder",
      source: row,
      mapped,
      enrichmentPatch: null,
    };
  }

  const existingMatch = findExistingCustomer(row, indexes);
  if (existingMatch) {
    const patch = buildEnrichmentPatch(existingMatch.customer, mapped);
    const hasPatch = Object.keys(patch).length > 0;
    if (!hasPatch) {
      return {
        externalClientNumber: row.externalClientNumber,
        action: "duplicate",
        matchStrategy: existingMatch.strategy,
        matchedCustomerId: existingMatch.customer.id,
        rejectedReason: null,
        source: row,
        mapped,
        enrichmentPatch: null,
      };
    }
    const tagOnly = Object.keys(patch).length === 1 && patch.tags != null;
    return {
      externalClientNumber: row.externalClientNumber,
      action: tagOnly ? "tag_only" : "enrich",
      matchStrategy: existingMatch.strategy,
      matchedCustomerId: existingMatch.customer.id,
      rejectedReason: null,
      source: row,
      mapped,
      enrichmentPatch: patch,
    };
  }

  return {
    externalClientNumber: row.externalClientNumber,
    action: "create",
    matchStrategy: null,
    matchedCustomerId: null,
    rejectedReason: null,
    source: row,
    mapped,
    enrichmentPatch: null,
  };
}

export async function runJobberCustomerImport(input: {
  dataSource: DataSource;
  organizationId: string;
  exportDir: string;
  execute: boolean;
}): Promise<JobberCustomerImportReport> {
  const bundle = loadJobberExportBundle(input.exportDir);
  const { rows, schemaErrors } = loadJobberClientsCsv(input.exportDir, bundle.enrichmentIndex);

  const report: JobberCustomerImportReport = {
    mode: input.execute ? "execute" : "preview",
    sourceDirectory: input.exportDir,
    sourceRows: rows.length,
    create: 0,
    enrich: 0,
    tagOnly: 0,
    duplicate: 0,
    rejected: 0,
    jobberTagApplied: 0,
    stopReason: null,
    schemaErrors: [...bundle.clients.schemaErrors, ...schemaErrors],
    records: [],
    importedCustomerIds: [],
    updatedCustomerIds: [],
    organizationId: input.organizationId,
  };

  if (report.schemaErrors.length > 0) {
    report.stopReason = "Schema errors in Jobber client CSV";
    return report;
  }

  const customers = await input.dataSource.getRepository(CustomerEntity).find({
    where: { organization_id: input.organizationId },
  });
  const indexes = buildCustomerIndexes(customers);
  const records = rows.map((row) => classifyRow(row, indexes));
  report.records = records;

  for (const record of records) {
    if (record.action === "create") report.create += 1;
    if (record.action === "enrich") report.enrich += 1;
    if (record.action === "tag_only") report.tagOnly += 1;
    if (record.action === "duplicate") report.duplicate += 1;
    if (record.action === "rejected") report.rejected += 1;
    if (record.action !== "rejected") report.jobberTagApplied += 1;
  }

  if (!input.execute) {
    return report;
  }

  const customerRepo = input.dataSource.getRepository(CustomerEntity);
  for (const record of records) {
    if (record.action === "create") {
      const created = await customerRepo.save(customerRepo.create({
        id: randomUUID(),
        organization_id: input.organizationId,
        ...record.mapped,
      }));
      report.importedCustomerIds.push(created.id);
      indexes.byExternal.set(record.mapped.external_client_number, created);
      if (created.email) indexes.byEmail.set(created.email, created);
      if (record.source.phoneDigits) indexes.byPhoneDigits.set(record.source.phoneDigits, created);
    }

    if ((record.action === "enrich" || record.action === "tag_only") && record.matchedCustomerId && record.enrichmentPatch) {
      await customerRepo.update(
        { id: record.matchedCustomerId, organization_id: input.organizationId },
        record.enrichmentPatch,
      );
      report.updatedCustomerIds.push(record.matchedCustomerId);
    }

    if (record.action === "duplicate" && record.matchedCustomerId) {
      const existing = await customerRepo.findOneOrFail({
        where: { id: record.matchedCustomerId, organization_id: input.organizationId },
      });
      const nextTags = ensureCustomerTag(existing.tags, JOBBER_CUSTOMER_TAG);
      if (JSON.stringify(normalizeCustomerTags(existing.tags)) !== JSON.stringify(nextTags)) {
        await customerRepo.update(
          { id: record.matchedCustomerId, organization_id: input.organizationId },
          { tags: nextTags },
        );
        report.updatedCustomerIds.push(record.matchedCustomerId);
      }
    }
  }

  return report;
}
