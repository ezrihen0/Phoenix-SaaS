import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { DataSource } from "typeorm";

import { CustomerEntity } from "./entities/customer.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import {
  hasValidPostalCode,
  loadUniqueWorkizCustomerCsv,
  mergeWorkizCustomerRows,
  normalizeName,
  normalizePhoneDigits,
  type WorkizCustomerCsvRow,
} from "./workiz/workiz-customer-csv-parser";
import {
  excludedWorkizCustomerReason,
  isExcludedWorkizCustomerEmail,
} from "./workiz/workiz-customer-exclusion";
import { normalizeEmail, normalizePhone } from "./workiz/workiz-invoice-parser";

const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const PHOENIX_ORG_SLUG = "phoenix-fireplace";
const DEFAULT_SOURCE_DIR = "C:\\Users\\edenz\\OneDrive\\שולחן העבודה\\Business\\Workiz\\cusomers";
const IMPORT_NOTES = "Imported from Workiz customer export.";

export type WorkizCustomerImportAction =
  | "create"
  | "enrich"
  | "duplicate"
  | "rejected"
  | "enrich_only_no_phone";

export type WorkizCustomerImportRecord = {
  clientNumber: string;
  action: WorkizCustomerImportAction;
  matchStrategy: string | null;
  matchedCustomerId: string | null;
  rejectedReason: string | null;
  withinFileDuplicates: string[];
  suspiciousFlags: string[];
  source: WorkizCustomerCsvRow;
  mapped: {
    external_client_number: string;
    full_name: string;
    email: string | null;
    company_name: string | null;
    service_address_line_1: string;
    service_city: string;
    service_state_or_region: string | null;
    service_postal_code: string;
    phone: string | null;
    legacy_created_at: Date | null;
    source: "repeat_customer";
    lifecycle_status: "past";
    notes: string | null;
  };
  enrichmentPatch: Partial<CustomerEntity> | null;
  emailConflict: { existing: string; incoming: string } | null;
  phoneConflict: { existing: string; incoming: string } | null;
};

export type WorkizCustomerImportReport = {
  mode: "preview" | "execute";
  sourceDirectory: string;
  sourceFiles: number;
  uniqueSourceFiles: number;
  skippedDuplicateFiles: string[];
  sourceFile: string;
  sourceRows: number;
  uniqueCustomers: number;
  existingPhoenixMatches: number;
  existingMatchByStrategy: Record<string, number>;
  newCustomers: number;
  updatedEnriched: number;
  skippedDuplicates: number;
  rejectedMalformed: number;
  enrichOnlyNoPhone: number;
  emailCoverage: { count: number; total: number; percent: number };
  phoneCoverage: { count: number; total: number; percent: number };
  addressCoverage: { count: number; total: number; percent: number };
  withinFileDuplicates: number;
  suspiciousRecords: Array<{ clientNumber: string; reason: string }>;
  emailConflicts: Array<{ clientNumber: string; customerId: string; existingEmail: string; incomingEmail: string }>;
  phoneConflicts: Array<{ clientNumber: string; customerId: string; existingPhone: string; incomingPhone: string }>;
  mappingExamples: Array<{
    label: string;
    workiz: Record<string, string | null>;
    wizfield: Record<string, string | null>;
  }>;
  importedCustomerIds: string[];
  updatedCustomerIds: string[];
  crossTenantWrites: number;
  phoenixOrganizationId: string;
  phoenixOrganizationName: string;
  phoenixOrganizationSlug: string;
  schemaErrors: string[];
  stopReason: string | null;
  records: WorkizCustomerImportRecord[];
};

type CustomerIndexes = {
  byClientNumber: Map<string, CustomerEntity>;
  byEmail: Map<string, CustomerEntity>;
  byPhoneDigits: Map<string, CustomerEntity>;
  byNamePostal: Map<string, CustomerEntity>;
  all: CustomerEntity[];
};

function fieldIsEmpty(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

function phoneIsEmpty(value: string | null | undefined): boolean {
  if (fieldIsEmpty(value)) return true;
  const digits = value!.replace(/\D/g, "");
  return digits.length < 10 || digits === "0000000000";
}

function mapRowToCustomer(row: WorkizCustomerCsvRow) {
  return {
    external_client_number: row.clientNumber,
    full_name: row.name,
    email: row.email,
    company_name: row.companyName,
    service_address_line_1: row.addressLine1 || row.addressRaw,
    service_city: row.serviceCity,
    service_state_or_region: row.serviceStateOrRegion,
    service_postal_code: row.servicePostalCode,
    phone: row.phone,
    legacy_created_at: row.legacyCreatedAt,
    source: "repeat_customer" as const,
    lifecycle_status: "past" as const,
    notes: IMPORT_NOTES,
  };
}

function buildCustomerIndexes(customers: CustomerEntity[]): CustomerIndexes {
  const byClientNumber = new Map<string, CustomerEntity>();
  const byEmail = new Map<string, CustomerEntity>();
  const byPhoneDigits = new Map<string, CustomerEntity>();
  const byNamePostal = new Map<string, CustomerEntity>();

  for (const customer of customers) {
    if (customer.external_client_number) {
      byClientNumber.set(customer.external_client_number.trim(), customer);
    }

    const email = normalizeEmail(customer.email);
    if (email) {
      byEmail.set(email, customer);
    }

    const phoneDigits = normalizePhoneDigits(customer.phone);
    if (phoneDigits) {
      byPhoneDigits.set(phoneDigits, customer);
    }

    const postal = customer.service_postal_code.trim().toUpperCase();
    if (postal && hasValidPostalCode(postal)) {
      const key = `${normalizeName(customer.full_name)}::${postal}`;
      byNamePostal.set(key, customer);
    }
  }

  return {
    byClientNumber,
    byEmail,
    byPhoneDigits,
    byNamePostal,
    all: customers,
  };
}

function findExistingCustomer(
  row: WorkizCustomerCsvRow,
  indexes: CustomerIndexes,
): { customer: CustomerEntity; strategy: string } | null {
  const byClient = indexes.byClientNumber.get(row.clientNumber.trim());
  if (byClient) {
    return { customer: byClient, strategy: "external_client_number" };
  }

  if (row.email) {
    const byEmail = indexes.byEmail.get(row.email);
    if (byEmail) {
      return { customer: byEmail, strategy: "email" };
    }
  }

  if (row.phoneDigits) {
    const byPhone = indexes.byPhoneDigits.get(row.phoneDigits);
    if (byPhone) {
      return { customer: byPhone, strategy: "phone" };
    }
  }

  const postal = row.servicePostalCode.trim().toUpperCase();
  if (postal && hasValidPostalCode(postal) && row.name) {
    const key = `${normalizeName(row.name)}::${postal}`;
    const byNamePostal = indexes.byNamePostal.get(key);
    if (byNamePostal) {
      return { customer: byNamePostal, strategy: "name_postal" };
    }
  }

  return null;
}

function buildEnrichmentPatch(
  existing: CustomerEntity,
  mapped: ReturnType<typeof mapRowToCustomer>,
): {
  patch: Partial<CustomerEntity>;
  emailConflict: { existing: string; incoming: string } | null;
  phoneConflict: { existing: string; incoming: string } | null;
} {
  const patch: Partial<CustomerEntity> = {};
  let emailConflict: { existing: string; incoming: string } | null = null;
  let phoneConflict: { existing: string; incoming: string } | null = null;

  if (mapped.email) {
    if (fieldIsEmpty(existing.email)) {
      patch.email = mapped.email;
    } else if (normalizeEmail(existing.email) !== mapped.email) {
      emailConflict = { existing: existing.email ?? "", incoming: mapped.email };
    }
  }

  if (mapped.phone) {
    if (phoneIsEmpty(existing.phone)) {
      patch.phone = mapped.phone;
    } else {
      const existingDigits = normalizePhoneDigits(existing.phone);
      const incomingDigits = normalizePhoneDigits(mapped.phone);
      if (existingDigits && incomingDigits && existingDigits !== incomingDigits) {
        phoneConflict = { existing: existing.phone, incoming: mapped.phone };
      }
    }
  }

  if (mapped.company_name && fieldIsEmpty(existing.company_name)) {
    patch.company_name = mapped.company_name;
  }

  if (mapped.service_address_line_1 && fieldIsEmpty(existing.service_address_line_1)) {
    patch.service_address_line_1 = mapped.service_address_line_1;
  }

  if (mapped.service_city && fieldIsEmpty(existing.service_city)) {
    patch.service_city = mapped.service_city;
  }

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

  if (fieldIsEmpty(existing.full_name) && mapped.full_name) {
    patch.full_name = mapped.full_name;
  }

  return { patch, emailConflict, phoneConflict };
}

function dedupeWithinFile(rows: WorkizCustomerCsvRow[]): {
  canonicalRows: WorkizCustomerCsvRow[];
  withinFileDuplicates: number;
  suspiciousRecords: Array<{ clientNumber: string; reason: string }>;
} {
  const groups = new Map<string, WorkizCustomerCsvRow[]>();

  for (const row of rows) {
    let key: string;
    if (row.email) {
      key = `email:${row.email}`;
    } else if (row.phoneDigits) {
      key = `phone:${row.phoneDigits}`;
    } else {
      key = `client:${row.clientNumber}`;
    }

    const existingGroup = groups.get(key) ?? [];
    existingGroup.push(row);
    groups.set(key, existingGroup);
  }

  const canonicalRows: WorkizCustomerCsvRow[] = [];
  const suspiciousRecords: Array<{ clientNumber: string; reason: string }> = [];
  let withinFileDuplicates = 0;

  for (const group of groups.values()) {
    if (group.length === 1) {
      canonicalRows.push(group[0]);
      continue;
    }

    const distinctNames = new Set(group.map((row) => normalizeName(row.name)).filter(Boolean));
    const hasSharedEmailOnly = group.every((row) => row.email) && distinctNames.size > 1;

    if (hasSharedEmailOnly) {
      for (const row of group) {
        suspiciousRecords.push({
          clientNumber: row.clientNumber,
          reason: `Shared email ${row.email} across ${distinctNames.size} different names`,
        });
        canonicalRows.push(row);
      }
      continue;
    }

    const sorted = [...group].sort(
      (left, right) => Number(right.clientNumber) - Number(left.clientNumber),
    );
    let canonical = sorted[0];
    const mergedFrom: string[] = [];

    for (const duplicate of sorted.slice(1)) {
      if (normalizeName(duplicate.name) && normalizeName(canonical.name)
        && normalizeName(duplicate.name) !== normalizeName(canonical.name)
        && duplicate.email === canonical.email
        && duplicate.phoneDigits
        && duplicate.phoneDigits === canonical.phoneDigits) {
        suspiciousRecords.push({
          clientNumber: duplicate.clientNumber,
          reason: `Same email/phone as client ${canonical.clientNumber} but different name (${duplicate.name})`,
        });
        continue;
      }

      canonical = mergeWorkizCustomerRows(canonical, duplicate);
      mergedFrom.push(duplicate.clientNumber);
      withinFileDuplicates += 1;
    }

    if (mergedFrom.length > 0) {
      suspiciousRecords.push({
        clientNumber: canonical.clientNumber,
        reason: `Merged duplicate Workiz clients: ${mergedFrom.join(", ")}`,
      });
    }

    canonicalRows.push(canonical);
  }

  return { canonicalRows, withinFileDuplicates, suspiciousRecords };
}

function classifyRecord(
  row: WorkizCustomerCsvRow,
  indexes: CustomerIndexes,
  withinFileDuplicatesForRow: string[],
): WorkizCustomerImportRecord {
  const mapped = mapRowToCustomer(row);
  const suspiciousFlags: string[] = [];

  if (isExcludedWorkizCustomerEmail(row.email)) {
    return {
      clientNumber: row.clientNumber,
      action: "rejected",
      matchStrategy: null,
      matchedCustomerId: null,
      rejectedReason: excludedWorkizCustomerReason(row.email),
      withinFileDuplicates: withinFileDuplicatesForRow,
      suspiciousFlags,
      source: row,
      mapped,
      enrichmentPatch: null,
      emailConflict: null,
      phoneConflict: null,
    };
  }

  if (!row.name.trim()) {
    return {
      clientNumber: row.clientNumber,
      action: "rejected",
      matchStrategy: null,
      matchedCustomerId: null,
      rejectedReason: "Missing full name",
      withinFileDuplicates: withinFileDuplicatesForRow,
      suspiciousFlags,
      source: row,
      mapped,
      enrichmentPatch: null,
      emailConflict: null,
      phoneConflict: null,
    };
  }

  if (!row.addressRaw.trim() && !row.addressLine1.trim()) {
    return {
      clientNumber: row.clientNumber,
      action: "rejected",
      matchStrategy: null,
      matchedCustomerId: null,
      rejectedReason: "Missing address",
      withinFileDuplicates: withinFileDuplicatesForRow,
      suspiciousFlags,
      source: row,
      mapped,
      enrichmentPatch: null,
      emailConflict: null,
      phoneConflict: null,
    };
  }

  const existingMatch = findExistingCustomer(row, indexes);

  if (existingMatch) {
    const { patch, emailConflict, phoneConflict } = buildEnrichmentPatch(existingMatch.customer, mapped);
    const hasPatch = Object.keys(patch).length > 0;

    if (existingMatch.strategy === "external_client_number" && !hasPatch) {
      return {
        clientNumber: row.clientNumber,
        action: "duplicate",
        matchStrategy: existingMatch.strategy,
        matchedCustomerId: existingMatch.customer.id,
        rejectedReason: null,
        withinFileDuplicates: withinFileDuplicatesForRow,
        suspiciousFlags,
        source: row,
        mapped,
        enrichmentPatch: null,
        emailConflict,
        phoneConflict,
      };
    }

    return {
      clientNumber: row.clientNumber,
      action: hasPatch ? "enrich" : "duplicate",
      matchStrategy: existingMatch.strategy,
      matchedCustomerId: existingMatch.customer.id,
      rejectedReason: null,
      withinFileDuplicates: withinFileDuplicatesForRow,
      suspiciousFlags,
      source: row,
      mapped,
      enrichmentPatch: hasPatch ? patch : null,
      emailConflict,
      phoneConflict,
    };
  }

  if (!row.phoneDigits) {
    if (row.email) {
      return {
        clientNumber: row.clientNumber,
        action: "enrich_only_no_phone",
        matchStrategy: null,
        matchedCustomerId: null,
        rejectedReason: "Valid email but no valid phone and no existing Phoenix match",
        withinFileDuplicates: withinFileDuplicatesForRow,
        suspiciousFlags,
        source: row,
        mapped,
        enrichmentPatch: null,
        emailConflict: null,
        phoneConflict: null,
      };
    }

    return {
      clientNumber: row.clientNumber,
      action: "rejected",
      matchStrategy: null,
      matchedCustomerId: null,
      rejectedReason: "Missing valid phone and email",
      withinFileDuplicates: withinFileDuplicatesForRow,
      suspiciousFlags,
      source: row,
      mapped,
      enrichmentPatch: null,
      emailConflict: null,
      phoneConflict: null,
    };
  }

  if (/test/i.test(row.name) || /rewrwe|sadsa|tyuty|fedfsdf/i.test(row.name + (row.email ?? ""))) {
    suspiciousFlags.push("Possible test/junk row");
  }

  return {
    clientNumber: row.clientNumber,
    action: "create",
    matchStrategy: null,
    matchedCustomerId: null,
    rejectedReason: null,
    withinFileDuplicates: withinFileDuplicatesForRow,
    suspiciousFlags,
    source: row,
    mapped,
    enrichmentPatch: null,
    emailConflict: null,
    phoneConflict: null,
  };
}

function buildMappingExamples(records: WorkizCustomerImportRecord[]): WorkizCustomerImportReport["mappingExamples"] {
  const examples: WorkizCustomerImportReport["mappingExamples"] = [];

  const addExample = (label: string, record: WorkizCustomerImportRecord | undefined) => {
    if (!record || examples.some((example) => example.label === label)) return;
    examples.push({
      label,
      workiz: {
        "Client #": record.source.clientNumber,
        Name: record.source.name,
        Email: record.source.email,
        Company: record.source.companyName,
        Address: record.source.addressRaw,
        Phone: record.source.phone,
        Created: record.source.legacyCreatedAt?.toISOString() ?? null,
      },
      wizfield: {
        external_client_number: record.mapped.external_client_number,
        full_name: record.mapped.full_name,
        email: record.mapped.email,
        company_name: record.mapped.company_name,
        service_address_line_1: record.mapped.service_address_line_1,
        service_city: record.mapped.service_city,
        service_state_or_region: record.mapped.service_state_or_region,
        service_postal_code: record.mapped.service_postal_code,
        phone: record.mapped.phone,
        legacy_created_at: record.mapped.legacy_created_at?.toISOString() ?? null,
        source: record.mapped.source,
        lifecycle_status: record.mapped.lifecycle_status,
      },
    });
  };

  addExample("Standard Calgary address", records.find((record) => record.source.clientNumber === "1640"));
  addExample("Address with unit number", records.find((record) => record.source.clientNumber === "1636"));
  addExample("Partial postal code fallback", records.find((record) => /T5Y$/.test(record.source.addressRaw)));
  addExample("Enrichment match", records.find((record) => record.action === "enrich"));
  addExample("New customer create", records.find((record) => record.action === "create"));
  addExample("Rejected missing phone", records.find((record) => record.action === "enrich_only_no_phone"));
  addExample("Company provided", records.find((record) => Boolean(record.mapped.company_name)));

  return examples.slice(0, 8);
}

async function verifyPhoenixOrganization(dataSource: DataSource) {
  const organization = await dataSource.getRepository(OrganizationEntity).findOne({
    where: { id: PHOENIX_ORG_ID },
  });

  if (!organization) {
    throw new Error(`Phoenix organization not found for id ${PHOENIX_ORG_ID}`);
  }

  if (organization.slug !== PHOENIX_ORG_SLUG) {
    throw new Error(
      `Phoenix organization slug mismatch: expected ${PHOENIX_ORG_SLUG}, found ${organization.slug}`,
    );
  }

  return organization;
}

export async function runWorkizCustomerImport(options: { execute: boolean }): Promise<WorkizCustomerImportReport> {
  const sourceDirectory = process.env.WORKIZ_CUSTOMER_SOURCE_DIR ?? DEFAULT_SOURCE_DIR;
  const parsedSource = loadUniqueWorkizCustomerCsv(sourceDirectory);

  const report: WorkizCustomerImportReport = {
    mode: options.execute ? "execute" : "preview",
    sourceDirectory,
    sourceFiles: parsedSource.filesDiscovered,
    uniqueSourceFiles: parsedSource.uniqueFiles,
    skippedDuplicateFiles: parsedSource.skippedDuplicateFiles,
    sourceFile: parsedSource.sourceFile,
    sourceRows: parsedSource.rows.length,
    uniqueCustomers: 0,
    existingPhoenixMatches: 0,
    existingMatchByStrategy: {},
    newCustomers: 0,
    updatedEnriched: 0,
    skippedDuplicates: 0,
    rejectedMalformed: 0,
    enrichOnlyNoPhone: 0,
    emailCoverage: { count: 0, total: 0, percent: 0 },
    phoneCoverage: { count: 0, total: 0, percent: 0 },
    addressCoverage: { count: 0, total: 0, percent: 0 },
    withinFileDuplicates: 0,
    suspiciousRecords: [],
    emailConflicts: [],
    phoneConflicts: [],
    mappingExamples: [],
    importedCustomerIds: [],
    updatedCustomerIds: [],
    crossTenantWrites: 0,
    phoenixOrganizationId: PHOENIX_ORG_ID,
    phoenixOrganizationName: "",
    phoenixOrganizationSlug: PHOENIX_ORG_SLUG,
    schemaErrors: parsedSource.schemaErrors,
    stopReason: null,
    records: [],
  };

  if (parsedSource.schemaErrors.length > 0) {
    report.stopReason = parsedSource.schemaErrors.join("; ");
    return report;
  }

  const { canonicalRows, withinFileDuplicates, suspiciousRecords } = dedupeWithinFile(parsedSource.rows);
  report.uniqueCustomers = canonicalRows.length;
  report.withinFileDuplicates = withinFileDuplicates;
  report.suspiciousRecords = suspiciousRecords;

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const organization = await verifyPhoenixOrganization(dataSource);
    report.phoenixOrganizationName = organization.name;

    const existingCustomers = await dataSource.getRepository(CustomerEntity).find({
      where: { organization_id: PHOENIX_ORG_ID },
    });
    const indexes = buildCustomerIndexes(existingCustomers);

    const records = canonicalRows.map((row) => classifyRecord(row, indexes, []));
    report.records = records;

    for (const record of records) {
      if (record.action === "create") report.newCustomers += 1;
      if (record.action === "enrich") report.existingPhoenixMatches += 1;
      if (record.action === "duplicate") {
        if (record.matchStrategy && record.matchStrategy !== "external_client_number") {
          report.existingPhoenixMatches += 1;
        }
        report.skippedDuplicates += 1;
      }
      if (record.action === "rejected") report.rejectedMalformed += 1;
      if (record.action === "enrich_only_no_phone") report.enrichOnlyNoPhone += 1;

      if (record.matchStrategy) {
        report.existingMatchByStrategy[record.matchStrategy]
          = (report.existingMatchByStrategy[record.matchStrategy] ?? 0) + 1;
      }

      if (record.emailConflict && record.matchedCustomerId) {
        report.emailConflicts.push({
          clientNumber: record.clientNumber,
          customerId: record.matchedCustomerId,
          existingEmail: record.emailConflict.existing,
          incomingEmail: record.emailConflict.incoming,
        });
      }

      if (record.phoneConflict && record.matchedCustomerId) {
        report.phoneConflicts.push({
          clientNumber: record.clientNumber,
          customerId: record.matchedCustomerId,
          existingPhone: record.phoneConflict.existing,
          incomingPhone: record.phoneConflict.incoming,
        });
      }
    }

    const uniqueCanonical = records.filter((record) => record.action !== "rejected");
    report.emailCoverage = {
      count: uniqueCanonical.filter((record) => Boolean(record.mapped.email)).length,
      total: uniqueCanonical.length,
      percent: uniqueCanonical.length === 0
        ? 0
        : Math.round((uniqueCanonical.filter((record) => Boolean(record.mapped.email)).length / uniqueCanonical.length) * 1000) / 10,
    };
    report.phoneCoverage = {
      count: uniqueCanonical.filter((record) => Boolean(record.mapped.phone)).length,
      total: uniqueCanonical.length,
      percent: uniqueCanonical.length === 0
        ? 0
        : Math.round((uniqueCanonical.filter((record) => Boolean(record.mapped.phone)).length / uniqueCanonical.length) * 1000) / 10,
    };
    report.addressCoverage = {
      count: uniqueCanonical.filter((record) => Boolean(record.mapped.service_address_line_1)).length,
      total: uniqueCanonical.length,
      percent: uniqueCanonical.length === 0
        ? 0
        : Math.round((uniqueCanonical.filter((record) => Boolean(record.mapped.service_address_line_1)).length / uniqueCanonical.length) * 1000) / 10,
    };

    report.mappingExamples = buildMappingExamples(records);

    const conflictCount = report.emailConflicts.length + report.phoneConflicts.length;
    const conflictRate = records.length === 0 ? 0 : conflictCount / records.length;
    if (conflictRate > 0.05) {
      report.stopReason = `Identity conflict rate ${Math.round(conflictRate * 1000) / 10}% exceeds 5% review threshold`;
      return report;
    }

    if (!options.execute) {
      return report;
    }

    const customerRepo = dataSource.getRepository(CustomerEntity);

    for (const record of records) {
      if (record.action === "create") {
        const created = await customerRepo.save(customerRepo.create({
          id: randomUUID(),
          organization_id: PHOENIX_ORG_ID,
          external_client_number: record.mapped.external_client_number,
          full_name: record.mapped.full_name,
          email: record.mapped.email,
          company_name: record.mapped.company_name,
          service_address_line_1: record.mapped.service_address_line_1,
          service_address_line_2: null,
          service_city: record.mapped.service_city,
          service_state_or_region: record.mapped.service_state_or_region,
          service_postal_code: record.mapped.service_postal_code,
          phone: record.mapped.phone as string,
          legacy_created_at: record.mapped.legacy_created_at,
          source: record.mapped.source,
          lifecycle_status: record.mapped.lifecycle_status,
          notes: record.mapped.notes,
        }));
        report.importedCustomerIds.push(created.id);
        indexes.byClientNumber.set(record.mapped.external_client_number, created);
        if (created.email) indexes.byEmail.set(created.email, created);
        if (record.source.phoneDigits) indexes.byPhoneDigits.set(record.source.phoneDigits, created);
      }

      if (record.action === "enrich" && record.matchedCustomerId && record.enrichmentPatch) {
        await customerRepo.update(
          { id: record.matchedCustomerId, organization_id: PHOENIX_ORG_ID },
          record.enrichmentPatch,
        );
        report.updatedCustomerIds.push(record.matchedCustomerId);
        report.updatedEnriched += 1;
      }
    }

    const foreignCustomers = await customerRepo
      .createQueryBuilder("customer")
      .where("customer.organization_id <> :organizationId", { organizationId: PHOENIX_ORG_ID })
      .andWhere("customer.external_client_number REGEXP '^[0-9]+$'")
      .getCount();

    report.crossTenantWrites = foreignCustomers;
    if (foreignCustomers > 0) {
      throw new Error(`Cross-tenant write detected: ${foreignCustomers} customers outside Phoenix org`);
    }
  } finally {
    await dataSource.destroy();
  }

  return report;
}

function printPreviewSummary(report: WorkizCustomerImportReport) {
  console.log("SOURCE FILES:", `${report.sourceFiles} (${report.uniqueSourceFiles} unique, ${report.skippedDuplicateFiles.length} skipped as identical)`);
  console.log("SOURCE ROWS:", report.sourceRows);
  console.log("UNIQUE CUSTOMERS:", report.uniqueCustomers);
  console.log("EXISTING PHOENIX MATCHES:", report.existingPhoenixMatches, report.existingMatchByStrategy);
  console.log("NEW CUSTOMERS:", report.newCustomers);
  console.log("DUPLICATES:", report.skippedDuplicates);
  console.log("REJECTED/MALFORMED:", report.rejectedMalformed, `(+ ${report.enrichOnlyNoPhone} enrich-only-no-phone)`);
  console.log("EMAIL COVERAGE:", `${report.emailCoverage.count}/${report.emailCoverage.total} (${report.emailCoverage.percent}%)`);
  console.log("PHONE COVERAGE:", `${report.phoneCoverage.count}/${report.phoneCoverage.total} (${report.phoneCoverage.percent}%)`);
  console.log("ADDRESS COVERAGE:", `${report.addressCoverage.count}/${report.addressCoverage.total} (${report.addressCoverage.percent}%)`);

  if (report.mappingExamples.length > 0) {
    console.log("\nMAPPING EXAMPLES:");
    for (const example of report.mappingExamples) {
      console.log(JSON.stringify(example, null, 2));
    }
  }

  if (report.suspiciousRecords.length > 0) {
    console.log("\nSUSPICIOUS RECORDS (sample):");
    for (const item of report.suspiciousRecords.slice(0, 10)) {
      console.log(`- Client #${item.clientNumber}: ${item.reason}`);
    }
  }

  if (report.stopReason) {
    console.log("\nSTOP REASON:", report.stopReason);
  }
}

async function main() {
  const execute = process.argv.includes("--execute");
  const report = await runWorkizCustomerImport({ execute });

  printPreviewSummary(report);

  const reportDir = join(process.cwd(), "_runtime_harness");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    join(reportDir, execute ? "workiz-customer-import-execute.json" : "workiz-customer-import-preview.json"),
    JSON.stringify(report, null, 2),
  );

  console.log("\nFULL REPORT JSON:");
  console.log(JSON.stringify({
    mode: report.mode,
    sourceDirectory: report.sourceDirectory,
    sourceFiles: report.sourceFiles,
    uniqueSourceFiles: report.uniqueSourceFiles,
    skippedDuplicateFiles: report.skippedDuplicateFiles,
    sourceRows: report.sourceRows,
    uniqueCustomers: report.uniqueCustomers,
    existingPhoenixMatches: report.existingPhoenixMatches,
    existingMatchByStrategy: report.existingMatchByStrategy,
    newCustomers: report.newCustomers,
    updatedEnriched: report.updatedEnriched,
    skippedDuplicates: report.skippedDuplicates,
    rejectedMalformed: report.rejectedMalformed,
    enrichOnlyNoPhone: report.enrichOnlyNoPhone,
    emailCoverage: report.emailCoverage,
    phoneCoverage: report.phoneCoverage,
    addressCoverage: report.addressCoverage,
    withinFileDuplicates: report.withinFileDuplicates,
    suspiciousRecords: report.suspiciousRecords,
    emailConflicts: report.emailConflicts,
    phoneConflicts: report.phoneConflicts,
    mappingExamples: report.mappingExamples,
    importedCustomerIds: report.importedCustomerIds,
    updatedCustomerIds: report.updatedCustomerIds,
    crossTenantWrites: report.crossTenantWrites,
    phoenixOrganizationId: report.phoenixOrganizationId,
    phoenixOrganizationName: report.phoenixOrganizationName,
    stopReason: report.stopReason,
  }, null, 2));

  if (report.stopReason) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
