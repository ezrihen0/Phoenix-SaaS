/**
 * Dispose known owner test customer blocking portal email (production wizfield).
 *
 * Does NOT merge into Eden. Clears portal email on the test row only.
 *
 * Usage:
 *   WORKIZ_ALLOW_PRODUCTION_MUTATION=1 node -r ts-node/register src/database/portal-dispose-phoenix-test-customer.ts
 */
import "dotenv/config";
import "reflect-metadata";

import { DataSource } from "typeorm";

import {
  assertWorkizProductionMutationAllowed,
  buildWorkizMutationGuardContext,
  PHOENIX_ORG_ID,
  PHOENIX_ORG_SLUG,
} from "./workiz/workiz-production-mutation-guard";
import { CustomerEntity } from "./entities/customer.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

const KNOWN_TEST_CUSTOMER_ID = "f8f840cb-8020-4d0c-80a2-fd854f595268";
const KNOWN_TEST_CUSTOMER_NAME = "Idi nahuy";
const BLOCKING_EMAIL = "zrihene1@gmail.com";
const REAL_EDEN_CUSTOMER_ID = "eba28bd4-d9a9-4693-9d18-d9c0f4897766";
const REAL_EDEN_NAME = "Eden Zrihen";
const DISPOSED_EMAIL = `owner-test-disposed+${KNOWN_TEST_CUSTOMER_ID.slice(0, 8)}@phoenixfireplace.invalid`;

function assertProductionGuard(options: MysqlConnectionOptions) {
  assertWorkizProductionMutationAllowed(
    buildWorkizMutationGuardContext({
      dataSourceOptions: options,
      organizationId: PHOENIX_ORG_ID,
      organizationSlug: PHOENIX_ORG_SLUG,
      allowProductionMutation: process.env.WORKIZ_ALLOW_PRODUCTION_MUTATION === "1",
      commandLabel: "portal-dispose-phoenix-test-customer",
    }),
  );
}

async function main() {
  const options = buildDataSourceOptions() as MysqlConnectionOptions;
  if (options.database?.trim().toLowerCase() !== "wizfield") {
    throw new Error(`Refusing disposal outside production wizfield (database=${options.database}).`);
  }
  assertProductionGuard(options);

  const dataSource = new DataSource(options);
  await dataSource.initialize();

  try {
    const customersRepo = dataSource.getRepository(CustomerEntity);

    const testCustomer = await customersRepo.findOne({
      where: { id: KNOWN_TEST_CUSTOMER_ID, organization_id: PHOENIX_ORG_ID },
    });
    if (!testCustomer) {
      throw new Error("Known test customer row not found; aborting.");
    }
    if (testCustomer.full_name?.trim() !== KNOWN_TEST_CUSTOMER_NAME) {
      throw new Error(
        `Test customer name mismatch (expected ${KNOWN_TEST_CUSTOMER_NAME}, got ${testCustomer.full_name}).`,
      );
    }
    if ((testCustomer.email ?? "").trim().toLowerCase() !== BLOCKING_EMAIL) {
      console.log(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: "test_customer_email_already_cleared",
          email: testCustomer.email,
        }),
      );
      return;
    }

    const eden = await customersRepo.findOne({
      where: { id: REAL_EDEN_CUSTOMER_ID, organization_id: PHOENIX_ORG_ID },
    });
    if (!eden || eden.full_name?.trim() !== REAL_EDEN_NAME) {
      throw new Error("Real Eden Zrihen customer row missing or renamed; aborting.");
    }
    if ((eden.email ?? "").trim().toLowerCase() !== BLOCKING_EMAIL) {
      throw new Error("Eden customer email is not the expected portal email; aborting.");
    }

    const duplicateCount = await customersRepo
      .createQueryBuilder("c")
      .where("c.organization_id = :organizationId", { organizationId: PHOENIX_ORG_ID })
      .andWhere("LOWER(TRIM(c.email)) = :email", { email: BLOCKING_EMAIL })
      .getCount();
    if (duplicateCount !== 2) {
      throw new Error(`Expected exactly 2 customers with ${BLOCKING_EMAIL}, found ${duplicateCount}.`);
    }

    const auditRows = await dataSource.query(
      `SELECT
        (SELECT COUNT(*) FROM jobs WHERE customer_id = ? AND organization_id = ?) AS jobs,
        (SELECT COUNT(*) FROM invoices i INNER JOIN jobs j ON j.id = i.job_id WHERE j.customer_id = ? AND i.organization_id = ?) AS invoices,
        (SELECT COUNT(*) FROM leads WHERE customer_id = ? AND organization_id = ?) AS leads`,
      [KNOWN_TEST_CUSTOMER_ID, PHOENIX_ORG_ID, KNOWN_TEST_CUSTOMER_ID, PHOENIX_ORG_ID, KNOWN_TEST_CUSTOMER_ID, PHOENIX_ORG_ID],
    );
    const audit = auditRows[0] as { jobs: number; invoices: number; leads: number };

    testCustomer.email = DISPOSED_EMAIL;
    if ("tags" in testCustomer && Array.isArray((testCustomer as CustomerEntity & { tags?: string[] }).tags)) {
      const tags = (testCustomer as CustomerEntity & { tags: string[] }).tags;
      (testCustomer as CustomerEntity & { tags: string[] }).tags = [...new Set([...tags, "owner_test_disposed"])];
    }
    testCustomer.notes = [
      testCustomer.notes?.trim(),
      `[portal-dispose ${new Date().toISOString()}] Owner test customer; email cleared so ${BLOCKING_EMAIL} is unique for ${REAL_EDEN_NAME}. Job/invoice rows preserved.`,
    ]
      .filter(Boolean)
      .join("\n");

    await customersRepo.save(testCustomer);

    const remaining = await customersRepo
      .createQueryBuilder("c")
      .where("c.organization_id = :organizationId", { organizationId: PHOENIX_ORG_ID })
      .andWhere("LOWER(TRIM(c.email)) = :email", { email: BLOCKING_EMAIL })
      .getMany();

    if (remaining.length !== 1 || remaining[0]?.id !== REAL_EDEN_CUSTOMER_ID) {
      throw new Error("Post-disposal email uniqueness check failed.");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          disposed_customer_id: KNOWN_TEST_CUSTOMER_ID,
          disposed_email: DISPOSED_EMAIL,
          eden_customer_id: REAL_EDEN_CUSTOMER_ID,
          audit,
          remaining_email_holders: remaining.map((row) => ({ id: row.id, full_name: row.full_name })),
        },
        null,
        2,
      ),
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exit(1);
});
