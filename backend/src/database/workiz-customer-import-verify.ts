import "dotenv/config";
import "reflect-metadata";

import { DataSource } from "typeorm";

import { CustomerEntity } from "./entities/customer.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import {
  loadUniqueWorkizCustomerCsv,
  normalizePhoneDigits,
} from "./workiz/workiz-customer-csv-parser";
import { normalizeEmail } from "./workiz/workiz-invoice-parser";

const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const PHOENIX_ORG_SLUG = "phoenix-fireplace";
const DEFAULT_SOURCE_DIR = "C:\\Users\\edenz\\OneDrive\\שולחן העבודה\\Business\\Workiz\\cusomers";

type SampleCheck = {
  clientNumber: string;
  field: string;
  sourceValue: string | null;
  dbValue: string | null;
  match: boolean;
};

function hasAddress(customer: CustomerEntity): boolean {
  return Boolean(customer.service_address_line_1?.trim());
}

function pickSampleClientNumbers(allClientNumbers: string[], sampleSize: number): string[] {
  if (allClientNumbers.length <= sampleSize) {
    return allClientNumbers;
  }

  const picked = new Set<string>();
  while (picked.size < sampleSize) {
    const index = Math.floor(Math.random() * allClientNumbers.length);
    picked.add(allClientNumbers[index]);
  }
  return Array.from(picked);
}

async function main() {
  const sourceDirectory = process.env.WORKIZ_CUSTOMER_SOURCE_DIR ?? DEFAULT_SOURCE_DIR;
  const parsedSource = loadUniqueWorkizCustomerCsv(sourceDirectory);
  const sourceByClient = new Map(parsedSource.rows.map((row) => [row.clientNumber, row]));

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const organization = await dataSource.getRepository(OrganizationEntity).findOne({
      where: { id: PHOENIX_ORG_ID },
    });

    if (!organization) {
      throw new Error(`Phoenix organization not found for id ${PHOENIX_ORG_ID}`);
    }

    if (organization.slug !== PHOENIX_ORG_SLUG) {
      throw new Error(`Phoenix slug mismatch: expected ${PHOENIX_ORG_SLUG}, found ${organization.slug}`);
    }

    const customerRepo = dataSource.getRepository(CustomerEntity);
    const phoenixCustomers = await customerRepo.find({
      where: { organization_id: PHOENIX_ORG_ID },
    });

    const imported = phoenixCustomers.filter((customer) => {
      const clientNumber = customer.external_client_number?.trim();
      return Boolean(clientNumber && /^\d+$/.test(clientNumber) && sourceByClient.has(clientNumber));
    });

    const crossTenantWrites = await customerRepo
      .createQueryBuilder("customer")
      .where("customer.organization_id <> :organizationId", { organizationId: PHOENIX_ORG_ID })
      .andWhere("customer.external_client_number REGEXP '^[0-9]+$'")
      .getCount();

    const emailCount = phoenixCustomers.filter((customer) => Boolean(normalizeEmail(customer.email))).length;
    const phoneCount = phoenixCustomers.filter((customer) => Boolean(normalizePhoneDigits(customer.phone))).length;
    const addressCount = phoenixCustomers.filter(hasAddress).length;

    const emailIndex = new Map<string, CustomerEntity[]>();
    const phoneIndex = new Map<string, CustomerEntity[]>();

    for (const customer of phoenixCustomers) {
      const email = normalizeEmail(customer.email);
      if (email) {
        const group = emailIndex.get(email) ?? [];
        group.push(customer);
        emailIndex.set(email, group);
      }

      const phoneDigits = normalizePhoneDigits(customer.phone);
      if (phoneDigits) {
        const group = phoneIndex.get(phoneDigits) ?? [];
        group.push(customer);
        phoneIndex.set(phoneDigits, group);
      }
    }

    const duplicateCustomers = new Set<string>();
    for (const group of emailIndex.values()) {
      if (group.length > 1) {
        for (const customer of group) duplicateCustomers.add(customer.id);
      }
    }
    for (const group of phoneIndex.values()) {
      if (group.length > 1) {
        for (const customer of group) duplicateCustomers.add(customer.id);
      }
    }

    const sampleClientNumbers = pickSampleClientNumbers(
      imported.map((customer) => customer.external_client_number as string),
      10,
    );

    const sampleChecks: SampleCheck[] = [];
    for (const clientNumber of sampleClientNumbers) {
      const source = sourceByClient.get(clientNumber);
      const customer = imported.find((row) => row.external_client_number === clientNumber);
      if (!source || !customer) continue;

      const comparisons: Array<[string, string | null, string | null]> = [
        ["full_name", source.name, customer.full_name],
        ["email", source.email, normalizeEmail(customer.email)],
        ["phone", source.phoneDigits, normalizePhoneDigits(customer.phone)],
        ["service_address_line_1", source.addressLine1 || source.addressRaw, customer.service_address_line_1],
        ["service_city", source.serviceCity || null, customer.service_city || null],
        ["service_postal_code", source.servicePostalCode || null, customer.service_postal_code || null],
      ];

      for (const [field, sourceValue, dbValue] of comparisons) {
        sampleChecks.push({
          clientNumber,
          field,
          sourceValue,
          dbValue,
          match: (sourceValue ?? "") === (dbValue ?? ""),
        });
      }
    }

    const sampleMismatchCount = sampleChecks.filter((check) => !check.match).length;

    const report = {
      ok: crossTenantWrites === 0 && sampleMismatchCount === 0,
      imported: imported.length,
      updatedEnriched: null as number | null,
      skippedDuplicates: parsedSource.rows.length - imported.length,
      rejected: parsedSource.rows.length - sourceByClient.size,
      phoenixTotalCustomers: phoenixCustomers.length,
      emailCoverage: {
        count: emailCount,
        total: phoenixCustomers.length,
        percent: phoenixCustomers.length === 0 ? 0 : Math.round((emailCount / phoenixCustomers.length) * 1000) / 10,
      },
      phoneCoverage: {
        count: phoneCount,
        total: phoenixCustomers.length,
        percent: phoenixCustomers.length === 0 ? 0 : Math.round((phoneCount / phoenixCustomers.length) * 1000) / 10,
      },
      addressCoverage: {
        count: addressCount,
        total: phoenixCustomers.length,
        percent: phoenixCustomers.length === 0 ? 0 : Math.round((addressCount / phoenixCustomers.length) * 1000) / 10,
      },
      duplicateCustomers: duplicateCustomers.size,
      crossTenantWrites,
      phoenixOrganizationId: PHOENIX_ORG_ID,
      phoenixOrganizationName: organization.name,
      sampleChecks,
      sampleMismatchCount,
    };

    console.log("IMPORTED:", report.imported);
    console.log("UPDATED/ENRICHED:", report.updatedEnriched);
    console.log("SKIPPED/DUPLICATES:", report.skippedDuplicates);
    console.log("REJECTED:", report.rejected);
    console.log("PHOENIX TOTAL CUSTOMERS:", report.phoenixTotalCustomers);
    console.log("EMAIL COVERAGE:", `${report.emailCoverage.count}/${report.emailCoverage.total} (${report.emailCoverage.percent}%)`);
    console.log("PHONE COVERAGE:", `${report.phoneCoverage.count}/${report.phoneCoverage.total} (${report.phoneCoverage.percent}%)`);
    console.log("ADDRESS COVERAGE:", `${report.addressCoverage.count}/${report.addressCoverage.total} (${report.addressCoverage.percent}%)`);
    console.log("DUPLICATE CUSTOMERS:", report.duplicateCustomers);
    console.log("CROSS-TENANT WRITES:", report.crossTenantWrites);
    console.log("\nSAMPLE CHECKS:");
    console.log(JSON.stringify(report.sampleChecks, null, 2));
    console.log("\nFULL VERIFY REPORT:");
    console.log(JSON.stringify(report, null, 2));

    if (!report.ok) {
      process.exitCode = 1;
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
