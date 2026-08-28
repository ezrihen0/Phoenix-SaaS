import "dotenv/config";
import "reflect-metadata";

import { HttpException } from "@nestjs/common";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import mysql from "mysql2/promise";
import { DataSource, In } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationTeamEntitlementEntity } from "./entities/organization-team-entitlement.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { UserEntity } from "./entities/user.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";
import { assertOrganizationSeatAvailable } from "../team/team-seat-enforcement";
import { listPermissionsForMembership } from "../team/membership-permissions";
import { DEFAULT_MAX_USERS } from "../team/team-entitlements";

type SmokeSummary = {
  ok: boolean;
  database: string;
  results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: unknown }>;
  errors: string[];
};

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Team RBAC smoke currently supports MySQL only.");
  }
  return {
    ...(options as MysqlConnectionOptions),
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3306,
    username: options.username ?? "root",
    password: options.password ?? "",
    synchronize: false,
    migrationsRun: false,
    logging: false,
  };
}

async function main() {
  const token = randomUUID().replace(/-/g, "").slice(0, 12);
  const database = `wizfield_team_rbac_${token}`;
  const summary: SmokeSummary = { ok: false, database, results: [], errors: [] };
  const baseOptions = requireMySqlOptions();
  const adminConnection = await mysql.createConnection({
    host: baseOptions.host,
    port: baseOptions.port,
    user: baseOptions.username,
    password: baseOptions.password,
  });

  let dataSource: DataSource | null = null;

  try {
    await adminConnection.query(`CREATE DATABASE \`${database}\``);
    dataSource = new DataSource({ ...baseOptions, database, migrationsRun: true });
    await dataSource.initialize();
    await verifyDatabaseSchema(dataSource);

    const orgRepo = dataSource.getRepository(OrganizationEntity);
    const userRepo = dataSource.getRepository(UserEntity);
    const profileRepo = dataSource.getRepository(ProfileEntity);
    const membershipRepo = dataSource.getRepository(MembershipEntity);
    const entitlementRepo = dataSource.getRepository(OrganizationTeamEntitlementEntity);

    const orgA = await orgRepo.save(orgRepo.create({
      id: randomUUID(),
      name: `Org A ${token}`,
      slug: `org-a-${token}`,
      is_active: true,
    }));
    const orgB = await orgRepo.save(orgRepo.create({
      id: randomUUID(),
      name: `Org B ${token}`,
      slug: `org-b-${token}`,
      is_active: true,
    }));

    await entitlementRepo.save([
      entitlementRepo.create({ organization_id: orgA.id, max_users: DEFAULT_MAX_USERS }),
      entitlementRepo.create({ organization_id: orgB.id, max_users: DEFAULT_MAX_USERS }),
    ]);

    async function seedMember(orgId: string, role: "owner" | "admin" | "technician" | "office_admin", label: string) {
      const user = await userRepo.save(userRepo.create({
        id: randomUUID(),
        email: `${label}-${token}@example.com`,
        password_hash: "test",
        is_active: true,
      }));
      await profileRepo.save(profileRepo.create({
        id: randomUUID(),
        auth_user_id: user.id,
        full_name: label,
        phone: null,
        role,
      }));
      return membershipRepo.save(membershipRepo.create({
        id: randomUUID(),
        user_id: user.id,
        organization_id: orgId,
        role,
        status: "active",
        custom_role_id: null,
        custom_permission_keys: null,
      }));
    }

    await seedMember(orgA.id, "owner", "owner-a");
    for (let index = 0; index < 4; index += 1) {
      await seedMember(orgA.id, "office_admin", `office-${index}`);
    }

    const crossUser = await userRepo.save(userRepo.create({
      id: randomUUID(),
      email: `cross-${token}@example.com`,
      password_hash: "test",
      is_active: true,
    }));
    await profileRepo.save(profileRepo.create({
      id: randomUUID(),
      auth_user_id: crossUser.id,
      full_name: "Cross Org User",
      phone: null,
      role: "admin",
    }));
    const membershipA = await membershipRepo.save(membershipRepo.create({
      id: randomUUID(),
      user_id: crossUser.id,
      organization_id: orgA.id,
      role: "admin",
      status: "active",
    }));
    const membershipB = await membershipRepo.save(membershipRepo.create({
      id: randomUUID(),
      user_id: crossUser.id,
      organization_id: orgB.id,
      role: "technician",
      status: "active",
    }));

    summary.results.push({
      name: "org A at user limit rejects another seat",
      status: "PASS",
      detail: await (async () => {
        let rejectedCode: string | null = null;
        try {
          await dataSource!.transaction(async (manager) => {
            await assertOrganizationSeatAvailable(orgA.id, manager);
          });
        } catch (error) {
          if (error instanceof HttpException) {
            const response = error.getResponse() as { error?: { code?: string } };
            rejectedCode = response?.error?.code ?? null;
          }
        }
        assert.equal(rejectedCode, "team_user_limit_reached");
        return rejectedCode;
      })(),
    });

    summary.results.push({
      name: "cross-org membership permissions stay isolated",
      status: "PASS",
      detail: {
        orgA: listPermissionsForMembership(membershipA),
        orgB: listPermissionsForMembership(membershipB),
      },
    });

    assert.equal(listPermissionsForMembership(membershipA).includes("team.manage"), true);
    assert.equal(listPermissionsForMembership(membershipB).includes("team.manage"), false);
    assert.equal(listPermissionsForMembership(membershipB).includes("jobs.assigned.view"), true);

    summary.ok = true;
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
    summary.results.push({
      name: "team-rbac-smoke",
      status: "FAIL",
      detail: summary.errors.at(-1),
    });
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await adminConnection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await adminConnection.end();
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exit(1);
  }
}

void main();
