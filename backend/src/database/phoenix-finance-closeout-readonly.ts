import "dotenv/config";
import "reflect-metadata";

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { DataSource } from "typeorm";

import { classifyFinanceInvoiceOrigin } from "../crm/finance-invoice-origin";
import { InvoiceEntity } from "./entities/invoice.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";

async function main() {
  const orgSlug = process.env.PHOENIX_ORG_SLUG?.trim() || "phoenix-fireplace";
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  const databaseName = (dataSource.options as { database?: string }).database ?? "unknown";
  const org = await dataSource.getRepository(OrganizationEntity).findOne({ where: { slug: orgSlug } });
  if (!org) {
    console.error(`Organization not found for slug ${orgSlug}`);
    process.exit(1);
  }

  const invoices = await dataSource.getRepository(InvoiceEntity).find({
    where: { organization_id: org.id },
    relations: { payments: true },
    take: 5000,
  });

  const originCounts = { native_wizfield: 0, workiz_historical: 0, unknown: 0 };
  for (const invoice of invoices) {
    originCounts[classifyFinanceInvoiceOrigin(invoice)] += 1;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    databaseName,
    organizationId: org.id,
    organizationSlug: orgSlug,
    invoiceCount: invoices.length,
    originCounts,
    withDocumentNumber: invoices.filter((row) => row.document_number?.trim()).length,
    withCustomerSnapshot: invoices.filter((row) => row.customer_facing_snapshot_json?.trim()).length,
  };

  const dir = process.env.FINANCE_CLOSEOUT_DIR?.trim()
    || join(process.cwd(), "_runtime_harness", "finance-program-closeout");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "phoenix-readonly.json"), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));

  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
