/**
 * Phoenix-only pricebook bootstrap: Gas/Wood/General systems + Gas categories.
 * Does NOT seed sample product items or Wood categories.
 *
 * Run: npm run phoenix:pricebook:bootstrap
 */
import "dotenv/config";
import "reflect-metadata";

import { DataSource } from "typeorm";

import { PricebookService } from "../pricebook/pricebook.service";
import { GAS_PRICEBOOK_CATEGORIES } from "../pricebook/pricebook-catalog-bootstrap";
import { PricebookBundleEntity } from "./entities/pricebook-bundle.entity";
import { PricebookBundleItemEntity } from "./entities/pricebook-bundle-item.entity";
import { PricebookBundleRequirementEntity } from "./entities/pricebook-bundle-requirement.entity";
import { PricebookCategoryEntity } from "./entities/pricebook-category.entity";
import { PricebookItemEntity } from "./entities/pricebook-item.entity";
import { PricebookSystemEntity } from "./entities/pricebook-system.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import {
  PHOENIX_ORG_ID,
  PHOENIX_ORG_SLUG,
} from "./workiz/workiz-production-mutation-guard";

type BootstrapReport = {
  ok: boolean;
  organizationId: string;
  organizationSlug: string;
  systems: Array<{ id: string; name: string; code: string }>;
  gasCategoriesCreated: number;
  gasCategoryNames: string[];
  woodCategoriesCreated: number;
  generalCategoriesCreated: number;
  errors: string[];
};

async function verifyPhoenixOrganization(dataSource: DataSource) {
  const organization = await dataSource.getRepository(OrganizationEntity).findOne({
    where: { id: PHOENIX_ORG_ID },
  });

  if (!organization) {
    throw new Error(`Phoenix organization not found: ${PHOENIX_ORG_ID}`);
  }

  if (organization.slug !== PHOENIX_ORG_SLUG) {
    throw new Error(
      `Phoenix organization slug mismatch: expected ${PHOENIX_ORG_SLUG}, found ${organization.slug}`,
    );
  }

  return organization;
}

async function countCategoriesForSystem(
  dataSource: DataSource,
  organizationId: string,
  systemCode: string,
) {
  const rows = await dataSource.query(
    `
      SELECT COUNT(*) AS count
      FROM pricebook_categories category
      INNER JOIN pricebook_systems pb_system ON pb_system.id = category.system_id
      WHERE category.organization_id = ?
        AND pb_system.organization_id = ?
        AND pb_system.code = ?
        AND category.archived_at IS NULL
    `,
    [organizationId, organizationId, systemCode],
  );

  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const dataSource = new DataSource({
    ...buildDataSourceOptions(),
    synchronize: false,
    logging: false,
  });

  const report: BootstrapReport = {
    ok: false,
    organizationId: PHOENIX_ORG_ID,
    organizationSlug: PHOENIX_ORG_SLUG,
    systems: [],
    gasCategoriesCreated: 0,
    gasCategoryNames: [],
    woodCategoriesCreated: 0,
    generalCategoriesCreated: 0,
    errors: [],
  };

  try {
    await dataSource.initialize();
    await verifyPhoenixOrganization(dataSource);

    const service = new PricebookService(
      dataSource.getRepository(PricebookItemEntity),
      dataSource.getRepository(PricebookCategoryEntity),
      dataSource.getRepository(PricebookSystemEntity),
      dataSource.getRepository(PricebookBundleEntity),
      dataSource.getRepository(PricebookBundleItemEntity),
      dataSource.getRepository(PricebookBundleRequirementEntity),
    );

    const bootstrapResult = await service.bootstrapCatalogStructuresOnly(PHOENIX_ORG_ID, null);
    report.systems = bootstrapResult.systems.map((system) => ({
      id: system.id,
      name: system.name,
      code: system.code,
    }));
    report.gasCategoriesCreated = bootstrapResult.categories.length;
    report.gasCategoryNames = bootstrapResult.categories.map((category) => category.name);
    report.woodCategoriesCreated = await countCategoriesForSystem(dataSource, PHOENIX_ORG_ID, "wood");
    report.generalCategoriesCreated = await countCategoriesForSystem(dataSource, PHOENIX_ORG_ID, "general");

    const expectedSystemNames = ["Gas", "General", "Wood"];
    const actualSystemNames = report.systems.map((system) => system.name).sort();
    const expectedGasCategories = [...GAS_PRICEBOOK_CATEGORIES].sort();
    const actualGasCategories = [...report.gasCategoryNames].sort();

    if (JSON.stringify(actualSystemNames) !== JSON.stringify(expectedSystemNames)) {
      report.errors.push(`Unexpected systems: ${actualSystemNames.join(", ")}`);
    }

    if (JSON.stringify(actualGasCategories) !== JSON.stringify(expectedGasCategories)) {
      report.errors.push("Gas category set mismatch after bootstrap.");
    }

    if (report.woodCategoriesCreated !== 0) {
      report.errors.push(`Wood categories must remain empty; found ${report.woodCategoriesCreated}.`);
    }

    if (report.generalCategoriesCreated !== 0) {
      report.errors.push(`General categories must remain empty; found ${report.generalCategoriesCreated}.`);
    }

    report.ok = report.errors.length === 0;
    console.log(JSON.stringify(report, null, 2));

    if (!report.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

void main();
