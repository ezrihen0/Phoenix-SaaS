/**
 * §11 Program Finish — runs configured-DB smokes, Workiz audit (when org resolvable), final certify.
 */
import { execSync } from "node:child_process";
import { join } from "node:path";

import "dotenv/config";
import "reflect-metadata";

import { DataSource } from "typeorm";

import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";

const backendRoot = join(__dirname, "..", "..");

async function resolvePhoenixOrgId() {
  const existing = process.env.FINANCE_AUDIT_ORG_ID?.trim() || process.env.PHOENIX_ORG_ID?.trim();
  if (existing) {
    return existing;
  }

  const slug = process.env.PHOENIX_ORG_SLUG?.trim() || "phoenix-fireplace";
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  try {
    const org = await dataSource.getRepository(OrganizationEntity).findOne({ where: { slug } });
    return org?.id ?? "";
  } finally {
    await dataSource.destroy();
  }
}

function run(step: string, command: string) {
  console.log(`\n=== ${step} ===\n> ${command}`);
  execSync(command, { stdio: "inherit", cwd: backendRoot, env: process.env });
}

async function main() {
  process.env.FINANCE_SMOKE_USE_CONFIGURED_DATABASE = "1";

  const orgId = await resolvePhoenixOrgId();
  if (orgId) {
    process.env.FINANCE_AUDIT_ORG_ID = orgId;
    process.env.PHOENIX_ORG_ID = orgId;
    console.log(`Resolved Phoenix org for audit: ${orgId}`);
  } else {
    console.warn("Could not resolve PHOENIX_ORG_ID; Workiz audit will waive in certify.");
  }

  run("invoice payment recording smoke (configured DB)", "npm run crm:invoice-payment-recording:smoke");
  run("portal isolation smoke (configured DB)", "npm run portal:isolation:smoke");
  run("finance part9 certify", "npm run finance-part9:certify");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
