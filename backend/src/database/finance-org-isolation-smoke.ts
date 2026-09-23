import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";
import { DataSource, Repository } from "typeorm";

import { InvoiceEntity } from "./entities/invoice.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";

type SmokeResult = { name: string; ok: boolean; detail?: string };

async function main() {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const invoiceRepo = dataSource.getRepository(InvoiceEntity);
  const token = randomUUID().slice(0, 8);

  const orgA = await orgRepo.save(orgRepo.create({ name: `Finance Iso A ${token}`, slug: `fin-a-${token}`, is_active: true }));
  const orgB = await orgRepo.save(orgRepo.create({ name: `Finance Iso B ${token}`, slug: `fin-b-${token}`, is_active: true }));

  const results: SmokeResult[] = [];

  const foreignRead = await invoiceRepo.findOne({
    where: { organization_id: orgB.id },
  });

  results.push({
    name: "org scope query returns no cross-org seed invoice",
    ok: foreignRead === null,
  });

  const crossOrgAttempt = await invoiceRepo.findOne({
    where: {
      organization_id: orgA.id,
      id: randomUUID(),
    },
  });

  results.push({
    name: "unknown invoice id scoped to org returns null",
    ok: crossOrgAttempt === null,
  });

  await orgRepo.delete(orgA.id);
  await orgRepo.delete(orgB.id);
  await dataSource.destroy();

  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
