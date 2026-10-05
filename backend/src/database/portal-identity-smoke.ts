/**
 * Hermetic smoke: portal identity backfill idempotency and readiness rules.
 * Usage: npm run portal:identity:smoke --workspace backend
 */
import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";
import { DataSource } from "typeorm";

import { buildPortalIdentityService, ensurePortalIdentityForCustomerDataSource } from "../customer-portal/portal-identity-backfill";
import { CustomerEntity } from "./entities/customer.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { PortalIdentityEntity } from "./entities/portal-identity.entity";
import { buildDataSourceOptions } from "./typeorm.config";

async function main() {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  const org = await dataSource.getRepository(OrganizationEntity).save(
    dataSource.getRepository(OrganizationEntity).create({
      name: `Portal Identity Smoke ${randomUUID().slice(0, 8)}`,
      slug: `pi-smoke-${randomUUID().slice(0, 8)}`,
      is_active: true,
    }),
  );

  const customersRepo = dataSource.getRepository(CustomerEntity);
  const withEmail = await customersRepo.save(
    customersRepo.create({
      organization_id: org.id,
      full_name: "Ready Customer",
      phone: "4035550101",
      email: "ready@example.com",
      service_address_line_1: "1 Ready St",
      service_city: "Calgary",
      service_postal_code: "T2P1A1",
      source: "website",
    }),
  );

  const withoutEmail = await customersRepo.save(
    customersRepo.create({
      organization_id: org.id,
      full_name: "No Email Customer",
      phone: "4035550102",
      email: null,
      service_address_line_1: "2 Pending St",
      service_city: "Calgary",
      service_postal_code: "T2P1A2",
      source: "website",
    }),
  );

  await customersRepo.save(
    customersRepo.create({
      organization_id: org.id,
      full_name: "Dup A",
      phone: "4035550103",
      email: "dup@example.com",
      service_address_line_1: "3 Dup St",
      service_city: "Calgary",
      service_postal_code: "T2P1A3",
      source: "website",
    }),
  );
  await customersRepo.save(
    customersRepo.create({
      organization_id: org.id,
      full_name: "Dup B",
      phone: "4035550104",
      email: "dup@example.com",
      service_address_line_1: "4 Dup St",
      service_city: "Calgary",
      service_postal_code: "T2P1A4",
      source: "website",
    }),
  );

  const identityService = buildPortalIdentityService(dataSource);

  const ready1 = await identityService.ensurePortalIdentityForCustomer(withEmail.id);
  const ready2 = await identityService.ensurePortalIdentityForCustomer(withEmail.id);
  if (ready1.id !== ready2.id || ready1.status !== "ready") {
    throw new Error("Expected idempotent ready identity");
  }

  const pending = await identityService.ensurePortalIdentityForCustomer(withoutEmail.id);
  if (pending.status !== "email_required") {
    throw new Error(`Expected email_required, got ${pending.status}`);
  }

  const dupCustomers = await customersRepo.find({
    where: { organization_id: org.id, email: "dup@example.com" },
  });
  for (const customer of dupCustomers) {
    const identity = await identityService.ensurePortalIdentityForCustomer(customer.id);
    if (identity.status !== "manual_review") {
      throw new Error(`Expected manual_review for duplicate email customer ${customer.id}`);
    }
  }

  const countBefore = await dataSource.getRepository(PortalIdentityEntity).count({
    where: { organization_id: org.id },
  });
  await ensurePortalIdentityForCustomerDataSource(dataSource, withEmail.id);
  await ensurePortalIdentityForCustomerDataSource(dataSource, withoutEmail.id);
  const countAfter = await dataSource.getRepository(PortalIdentityEntity).count({
    where: { organization_id: org.id },
  });
  if (countBefore !== countAfter) {
    throw new Error("Backfill helper created duplicate identities on rerun");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        organization_id: org.id,
        identities: countAfter,
      },
      null,
      2,
    ),
  );

  await dataSource.destroy();
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exit(1);
});
