import { DataSource } from "typeorm";

import { OPERATING_PHOENIX_ORGANIZATION_SLUG } from "../../auth/organization-resolution.policy";
import { OrganizationEntity } from "../entities/organization.entity";
import { PHOENIX_ORG_ID } from "../workiz/workiz-production-mutation-guard";

export async function resolvePhoenixOperatingOrganization(dataSource: DataSource): Promise<OrganizationEntity> {
  const org = await dataSource.getRepository(OrganizationEntity).findOne({
    where: { slug: OPERATING_PHOENIX_ORGANIZATION_SLUG },
  });

  if (!org) {
    throw new Error(
      `Phoenix operating organization slug '${OPERATING_PHOENIX_ORGANIZATION_SLUG}' was not found in the database.`,
    );
  }

  if (org.id !== PHOENIX_ORG_ID) {
    throw new Error(
      `Phoenix operating organization id mismatch: database has '${org.id}' but SoT expects '${PHOENIX_ORG_ID}'.`,
    );
  }

  return org;
}
