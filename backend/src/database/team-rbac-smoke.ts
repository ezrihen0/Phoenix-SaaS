import "dotenv/config";
import "reflect-metadata";

import { HttpException } from "@nestjs/common";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import mysql from "mysql2/promise";
import { DataSource, In } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import type { ActorContext } from "../common/request-types";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationCustomRoleEntity } from "./entities/organization-custom-role.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationTeamEntitlementEntity } from "./entities/organization-team-entitlement.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { TeamRbacAuditEventEntity } from "./entities/team-rbac-audit-event.entity";
import { TechnicianEntity } from "./entities/technician.entity";
import { UserEntity } from "./entities/user.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";
import { assertOrganizationSeatAvailable } from "../team/team-seat-enforcement";
import { listPermissionsForMembership } from "../team/membership-permissions";
import { DEFAULT_MAX_USERS } from "../team/team-entitlements";
import { TeamService } from "../team/team.service";

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

function createTeamService(dataSource: DataSource) {
  return new TeamService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(ProfileEntity),
    dataSource.getRepository(UserEntity),
    dataSource.getRepository(OrganizationCustomRoleEntity),
    dataSource.getRepository(OrganizationTeamEntitlementEntity),
    dataSource.getRepository(TeamRbacAuditEventEntity),
    dataSource,
  );
}

function buildActor(input: {
  user: UserEntity;
  profile: ProfileEntity;
  memberships: MembershipEntity[];
  activeOrganizationId: string;
}): ActorContext {
  const membership = input.memberships.find((item) => item.organization_id === input.activeOrganizationId)
    ?? input.memberships[0]
    ?? null;

  return {
    user: input.user,
    profile: input.profile,
    technician: null,
    memberships: input.memberships,
    membership,
    organization: membership?.organization ?? null,
    membership_id: membership?.id ?? null,
    organization_id: membership?.organization_id ?? null,
    role: membership?.role ?? null,
    permissions: listPermissionsForMembership(membership),
    platform_capabilities: [],
  };
}

async function expectHttpError(
  run: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode?: string,
) {
  try {
    await run();
    throw new Error(`Expected HTTP ${expectedStatus}.`);
  } catch (error) {
    if (!(error instanceof HttpException)) {
      throw error;
    }
    assert.equal(error.getStatus(), expectedStatus);
    if (expectedCode) {
      const response = error.getResponse() as { error?: { code?: string } };
      assert.equal(response?.error?.code, expectedCode);
    }
  }
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
    const technicianRepo = dataSource.getRepository(TechnicianEntity);
    const customRoleRepo = dataSource.getRepository(OrganizationCustomRoleEntity);
    const teamService = createTeamService(dataSource);

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
    const orgC = await orgRepo.save(orgRepo.create({
      id: randomUUID(),
      name: `Org C ${token}`,
      slug: `org-c-${token}`,
      is_active: true,
    }));

    const teamScenarioMaxUsers = 20;
    await entitlementRepo.save([
      entitlementRepo.create({ organization_id: orgA.id, max_users: teamScenarioMaxUsers }),
      entitlementRepo.create({ organization_id: orgB.id, max_users: teamScenarioMaxUsers }),
      entitlementRepo.create({ organization_id: orgC.id, max_users: DEFAULT_MAX_USERS }),
    ]);

    const orgLimit = await orgRepo.save(orgRepo.create({
      id: randomUUID(),
      name: `Org Limit ${token}`,
      slug: `org-limit-${token}`,
      is_active: true,
    }));
    await entitlementRepo.save(
      entitlementRepo.create({ organization_id: orgLimit.id, max_users: DEFAULT_MAX_USERS }),
    );

    async function seedMember(
      orgId: string,
      role: "owner" | "admin" | "technician" | "office_admin" | "dispatcher",
      label: string,
      organization?: OrganizationEntity,
    ) {
      const user = await userRepo.save(userRepo.create({
        id: randomUUID(),
        email: `${label}-${token}@example.com`,
        password_hash: "test-hash",
        is_active: true,
      }));
      const profile = await profileRepo.save(profileRepo.create({
        id: randomUUID(),
        auth_user_id: user.id,
        full_name: label,
        phone: null,
        role,
      }));
      const membership = await membershipRepo.save(membershipRepo.create({
        id: randomUUID(),
        user_id: user.id,
        organization_id: orgId,
        role,
        status: "active",
        custom_role_id: null,
        custom_permission_keys: null,
      }));
      if (organization) {
        membership.organization = organization;
      }
      return { user, profile, membership };
    }

    await seedMember(orgLimit.id, "owner", "owner-limit", orgLimit);
    for (let index = 0; index < 4; index += 1) {
      await seedMember(orgLimit.id, "office_admin", `office-limit-${index}`, orgLimit);
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
            await assertOrganizationSeatAvailable(orgLimit.id, manager);
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

    const ownerA = await seedMember(orgA.id, "owner", "owner-multi-a", orgA);
    const ownerBMembership = await membershipRepo.save(membershipRepo.create({
      id: randomUUID(),
      user_id: ownerA.user.id,
      organization_id: orgB.id,
      role: "owner",
      status: "active",
    }));
    ownerBMembership.organization = orgB;
    const ownerActor = buildActor({
      user: ownerA.user,
      profile: ownerA.profile,
      memberships: [ownerA.membership, ownerBMembership],
      activeOrganizationId: orgA.id,
    });

    const singleOrgEmail = `single-${token}@example.com`;
    const singleOrgResult = await teamService.createMember({
      email: singleOrgEmail,
      password: "Password123!",
      fullName: "Single Org User",
      phone: null,
      access: { systemRole: "technician" },
    }, ownerActor);
    assert.equal(singleOrgResult.userCreated, true);
    assert.equal(await userRepo.count({ where: { email: singleOrgEmail } }), 1);
    assert.equal(await profileRepo.count({ where: { auth_user_id: singleOrgResult.member?.auth_user_id } }), 1);
    assert.equal(await membershipRepo.count({ where: { user_id: singleOrgResult.member?.auth_user_id ?? "" } }), 1);
    summary.results.push({ name: "single-org create without organizationIds", status: "PASS" });

    const multiTechEmail = `multi-tech-${token}@example.com`;
    const multiTechResult = await teamService.createMember({
      email: multiTechEmail,
      password: "Password123!",
      fullName: "Multi Tech",
      phone: null,
      access: { systemRole: "technician" },
      organizationIds: [orgA.id, orgB.id],
    }, ownerActor);
    assert.equal(multiTechResult.userCreated, true);
    assert.equal(await membershipRepo.count({ where: { user_id: multiTechResult.member?.auth_user_id ?? "" } }), 2);
    assert.equal(await technicianRepo.count({
      where: {
        auth_user_id: multiTechResult.member?.auth_user_id ?? "",
        organization_id: In([orgA.id, orgB.id]),
      },
    }), 2);
    summary.results.push({ name: "multi-org technician creates tenant-scoped roster rows", status: "PASS" });

    const multiDispatchEmail = `multi-dispatch-${token}@example.com`;
    await teamService.createMember({
      email: multiDispatchEmail,
      password: "Password123!",
      fullName: "Multi Dispatch",
      phone: null,
      access: { systemRole: "dispatcher" },
      organizationIds: [orgA.id, orgB.id],
    }, ownerActor);
    const dispatchUser = await userRepo.findOne({ where: { email: multiDispatchEmail } });
    assert.ok(dispatchUser);
    assert.equal(await membershipRepo.count({ where: { user_id: dispatchUser.id } }), 2);
    assert.equal(await technicianRepo.count({ where: { auth_user_id: dispatchUser.id } }), 0);
    summary.results.push({ name: "multi-org non-technician creates no technician rows", status: "PASS" });

    const usersBeforeAttack = await userRepo.count();
    await expectHttpError(
      () => teamService.createMember({
        email: `attack-${token}@example.com`,
        password: "Password123!",
        fullName: "Attack User",
        phone: null,
        access: { systemRole: "technician" },
        organizationIds: [orgA.id, orgC.id],
      }, ownerActor),
      403,
      "team_invite_forbidden",
    );
    assert.equal(await userRepo.count(), usersBeforeAttack);
    summary.results.push({ name: "unauthorized organization injection blocked", status: "PASS" });

    const orgBEntitlementBeforeSeatLimit = await entitlementRepo.findOne({
      where: { organization_id: orgB.id },
    });
    assert.ok(orgBEntitlementBeforeSeatLimit, "Org B team entitlement must exist before seat-limit scenario.");
    const orgBOriginalMaxUsers = orgBEntitlementBeforeSeatLimit.max_users;

    try {
      await entitlementRepo.update({ organization_id: orgB.id }, { max_users: 1 });
      const usersBeforeSeatRollback = await userRepo.count();
      const seatRollbackEmail = `seat-rollback-${token}@example.com`;
      await expectHttpError(
        () => teamService.createMember({
          email: seatRollbackEmail,
          password: "Password123!",
          fullName: "Seat Rollback",
          phone: null,
          access: { systemRole: "technician" },
          organizationIds: [orgA.id, orgB.id],
        }, ownerActor),
        403,
        "team_user_limit_reached",
      );
      assert.equal(await userRepo.count(), usersBeforeSeatRollback);
      assert.equal(await userRepo.count({ where: { email: seatRollbackEmail } }), 0);
      summary.results.push({ name: "seat limit rollback leaves no partial writes", status: "PASS" });
    } finally {
      await entitlementRepo.update(
        { organization_id: orgB.id },
        { max_users: orgBOriginalMaxUsers },
      );
    }

    const reuseEmail = `reuse-${token}@example.com`;
    await teamService.createMember({
      email: reuseEmail,
      password: "Password123!",
      fullName: "Reuse User",
      phone: null,
      access: { systemRole: "technician" },
      organizationIds: [orgA.id],
    }, ownerActor);
    const reuseUser = await userRepo.findOneOrFail({ where: { email: reuseEmail } });
    const reuseHash = reuseUser.password_hash;
    const reuseResult = await teamService.createMember({
      email: reuseEmail,
      password: "DifferentPassword123!",
      fullName: "Reuse User Changed",
      phone: "5550001111",
      access: { systemRole: "technician" },
      organizationIds: [orgA.id, orgB.id],
    }, ownerActor);
    const reuseUserAfter = await userRepo.findOneOrFail({ where: { email: reuseEmail } });
    assert.equal(reuseResult.userReused, true);
    assert.equal(await userRepo.count({ where: { email: reuseEmail } }), 1);
    assert.equal(await profileRepo.count({ where: { auth_user_id: reuseUser.id } }), 1);
    assert.equal(reuseUserAfter.password_hash, reuseHash);
    assert.equal(await membershipRepo.count({ where: { user_id: reuseUser.id } }), 2);
    summary.results.push({ name: "existing user reuse adds missing membership only", status: "PASS" });

    const unrelated = await seedMember(orgC.id, "owner", "unrelated-owner", orgC);
    await expectHttpError(
      () => teamService.createMember({
        email: reuseEmail,
        password: "Password123!",
        fullName: "Reuse User",
        phone: null,
        access: { systemRole: "technician" },
        organizationIds: [orgC.id],
      }, buildActor({
        user: unrelated.user,
        profile: unrelated.profile,
        memberships: [unrelated.membership],
        activeOrganizationId: orgC.id,
      })),
      409,
      "team_email_exists",
    );
    summary.results.push({ name: "existing unrelated user blocked safely", status: "PASS" });

    await expectHttpError(
      () => teamService.createMember({
        email: reuseEmail,
        password: "Password123!",
        fullName: "Reuse User",
        phone: null,
        access: { systemRole: "dispatcher" },
        organizationIds: [orgB.id],
      }, ownerActor),
      409,
      "existing_user_role_conflict",
    );
    summary.results.push({ name: "existing user role conflict rejected", status: "PASS" });

    const dedupeEmail = `dedupe-${token}@example.com`;
    await teamService.createMember({
      email: dedupeEmail,
      password: "Password123!",
      fullName: "Dedupe User",
      phone: null,
      access: { systemRole: "office_admin" },
      organizationIds: [orgA.id, orgA.id, orgB.id],
    }, ownerActor);
    const dedupeUser = await userRepo.findOneOrFail({ where: { email: dedupeEmail } });
    assert.equal(await membershipRepo.count({ where: { user_id: dedupeUser.id } }), 2);
    summary.results.push({ name: "duplicate organization IDs deduplicated", status: "PASS" });

    const customRole = await customRoleRepo.save(customRoleRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      name: "Custom Tech",
      permission_keys: ["customers.view", "jobs.view"],
    }));
    await expectHttpError(
      () => teamService.createMember({
        email: `custom-multi-${token}@example.com`,
        password: "Password123!",
        fullName: "Custom Multi",
        phone: null,
        access: { systemRole: "technician", customRoleId: customRole.id },
        organizationIds: [orgA.id, orgB.id],
      }, ownerActor),
      400,
      "multi_org_custom_role_not_supported",
    );
    summary.results.push({ name: "multi-org custom role rejected", status: "PASS" });

    const partialReuseEmail = `partial-${token}@example.com`;
    await teamService.createMember({
      email: partialReuseEmail,
      password: "Password123!",
      fullName: "Partial Reuse",
      phone: null,
      access: { systemRole: "technician" },
      organizationIds: [orgA.id],
    }, ownerActor);
    const partialUser = await userRepo.findOneOrFail({ where: { email: partialReuseEmail } });
    const membershipsBefore = await membershipRepo.count({ where: { user_id: partialUser.id, organization_id: orgA.id } });
    assert.equal(membershipsBefore, 1);
    const partialResult = await teamService.createMember({
      email: partialReuseEmail,
      password: "Password123!",
      fullName: "Partial Reuse",
      phone: null,
      access: { systemRole: "technician" },
      organizationIds: [orgA.id, orgB.id],
    }, ownerActor);
    assert.equal(partialResult.membershipsCreated.length, 1);
    assert.equal(await membershipRepo.count({ where: { user_id: partialUser.id, organization_id: orgA.id } }), 1);
    summary.results.push({ name: "existing matching membership preserved while adding new org", status: "PASS" });

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
    try {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    } catch {
      /* ignore cleanup failures in restricted database environments */
    }
    await adminConnection.end();
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exit(1);
  }
}

void main();
