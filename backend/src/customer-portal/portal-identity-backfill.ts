/**
 * Idempotent portal identity backfill (no outbound email).
 * Usage: node -r ts-node/register src/customer-portal/portal-identity-backfill.ts
 */
import "dotenv/config";

import { DataSource } from "typeorm";

import { CustomerEntity } from "../database/entities/customer.entity";
import { PortalIdentityEntity } from "../database/entities/portal-identity.entity";
import {
  assertWorkizProductionMutationAllowed,
  buildWorkizMutationGuardContext,
  PHOENIX_ORG_ID,
  PHOENIX_ORG_SLUG,
} from "../database/workiz/workiz-production-mutation-guard";
import { buildDataSourceOptions } from "../database/typeorm.config";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";
import { PortalIdentityService } from "./portal-identity.service";
import { In } from "typeorm";

export function buildPortalIdentityService(dataSource: DataSource) {
  return new PortalIdentityService(
    dataSource.getRepository(PortalIdentityEntity),
    dataSource.getRepository(CustomerEntity),
  );
}

export async function ensurePortalIdentityForCustomerDataSource(dataSource: DataSource, customerId: string) {
  return buildPortalIdentityService(dataSource).ensurePortalIdentityForCustomer(customerId);
}

async function main() {
  const options = buildDataSourceOptions() as MysqlConnectionOptions;
  if (options.database?.trim().toLowerCase() === "wizfield") {
    assertWorkizProductionMutationAllowed(
      buildWorkizMutationGuardContext({
        dataSourceOptions: options,
        organizationId: PHOENIX_ORG_ID,
        organizationSlug: PHOENIX_ORG_SLUG,
        allowProductionMutation: process.env.WORKIZ_ALLOW_PRODUCTION_MUTATION === "1",
        commandLabel: "portal-identity-backfill",
      }),
    );
  }

  const dataSource = new DataSource(options);
  await dataSource.initialize();

  const organizationFilter = process.env.PORTAL_IDENTITY_BACKFILL_ORG_ID?.trim() || null;

  const service = buildPortalIdentityService(dataSource);
  const customers = await dataSource.getRepository(CustomerEntity).find({
    where: organizationFilter ? { organization_id: In([organizationFilter]) } : {},
    select: { id: true, organization_id: true },
  });

  const counts = { ready: 0, email_required: 0, manual_review: 0, skipped: 0 };

  for (const customer of customers) {
    if (!customer.organization_id) {
      counts.skipped += 1;
      continue;
    }
    const identity = await service.ensurePortalIdentityForCustomer(customer.id);
    counts[identity.status] += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        customers_scanned: customers.length,
        organization_filter: organizationFilter,
        counts,
      },
      null,
      2,
    ),
  );

  await dataSource.destroy();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }));
    process.exit(1);
  });
}
