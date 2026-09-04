import "dotenv/config";
import "reflect-metadata";

import { DataSource } from "typeorm";

import { CustomerEntity } from "./entities/customer.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { UserEntity } from "./entities/user.entity";
import { AuthSessionEntity } from "./entities/auth-session.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import {
  PHOENIX_OWNER_EMAIL,
} from "./phoenix-owner-credentials";

const PHOENIX_FIREPLACE_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const OWNER_EMAIL = PHOENIX_OWNER_EMAIL;

async function main() {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const user = await dataSource.getRepository(UserEntity).findOne({
      where: { email: OWNER_EMAIL },
    });

    const orgs = await dataSource.getRepository(OrganizationEntity).find({
      where: [{ slug: "phoenix" }, { slug: "phoenix-fireplace" }],
    });

    const customerCounts = await Promise.all(
      orgs.map(async (org) => ({
        org_id: org.id,
        slug: org.slug,
        name: org.name,
        customer_count: await dataSource.getRepository(CustomerEntity).count({
          where: { organization_id: org.id },
        }),
      })),
    );

    const memberships = user
      ? await dataSource.getRepository(MembershipEntity).find({
        where: { user_id: user.id },
        relations: { organization: true },
        order: { created_at: "ASC" },
      })
      : [];

    const sessions = user
      ? await dataSource.getRepository(AuthSessionEntity).find({
        where: { user_id: user.id },
        order: { updated_at: "DESC" },
        take: 5,
      })
      : [];

    console.log(JSON.stringify({
      owner: user ? { id: user.id, email: user.email } : null,
      customerCounts,
      memberships: memberships.map((m) => ({
        id: m.id,
        org_id: m.organization_id,
        org_slug: m.organization?.slug,
        org_name: m.organization?.name,
        role: m.role,
        status: m.status,
        created_at: m.created_at.toISOString(),
      })),
      recentSessions: sessions.map((s) => ({
        id: s.id,
        active_organization_id: s.active_organization_id,
        updated_at: s.updated_at.toISOString(),
        expires_at: s.expires_at.toISOString(),
      })),
      expectedPhoenixFireplaceOrgId: PHOENIX_FIREPLACE_ORG_ID,
    }, null, 2));
  } finally {
    await dataSource.destroy();
  }
}

void main().catch(console.error);
