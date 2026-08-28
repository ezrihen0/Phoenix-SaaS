import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import type { ActorContext } from "../common/request-types";
import { JobsService } from "../crm/jobs.service";
import { findJobForActor } from "../crm/jobs-access";
import type { JobType } from "../crm/constants";
import { CustomerEntity } from "./entities/customer.entity";
import { JobEntity } from "./entities/job.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { TechnicianEntity } from "./entities/technician.entity";
import { UserEntity } from "./entities/user.entity";
import { listPermissionsForMembership } from "../team/membership-permissions";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";

type SmokeSummary = {
  ok: boolean;
  database: string;
  results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: unknown }>;
  errors: string[];
};

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Jobs RBAC smoke currently supports MySQL only.");
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

function record(summary: SmokeSummary, name: string, run: () => void | Promise<void>) {
  return Promise.resolve(run()).then(
    () => {
      summary.results.push({ name, status: "PASS" });
    },
    (error) => {
      summary.results.push({ name, status: "FAIL", detail: String(error) });
      summary.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

function buildActor(input: {
  user: UserEntity;
  profile: ProfileEntity;
  membership: MembershipEntity;
  organizationId: string;
  technician?: TechnicianEntity | null;
}): ActorContext {
  return {
    user: input.user,
    profile: input.profile,
    technician: input.technician ?? null,
    memberships: [input.membership],
    membership: input.membership,
    organization: null,
    membership_id: input.membership.id,
    organization_id: input.organizationId,
    role: input.membership.role,
    permissions: listPermissionsForMembership(input.membership),
  };
}

async function expectForbidden(run: () => Promise<unknown>) {
  try {
    await run();
    throw new Error("Expected forbidden response.");
  } catch (error) {
    if (!(error instanceof HttpException) || error.getStatus() !== 403) {
      throw error;
    }
  }
}

async function expectNotFound(run: () => Promise<unknown>) {
  try {
    await run();
    throw new Error("Expected not found response.");
  } catch (error) {
    if (!(error instanceof HttpException) || error.getStatus() !== 404) {
      throw error;
    }
  }
}

async function main() {
  const token = randomUUID().replace(/-/g, "").slice(0, 12);
  const database = `wizfield_jobs_rbac_${token}`;
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
    const customerRepo = dataSource.getRepository(CustomerEntity);
    const jobRepo = dataSource.getRepository(JobEntity);
    const technicianRepo = dataSource.getRepository(TechnicianEntity);
    const jobsService = new JobsService(jobRepo);

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

    async function seedUser(label: string, role: ProfileEntity["role"], orgId: string) {
      const user = await userRepo.save(userRepo.create({
        id: randomUUID(),
        email: `${label}-${token}@example.com`,
        password_hash: "test",
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
      }));
      return { user, profile, membership };
    }

    const adminA = await seedUser("admin-a", "admin", orgA.id);
    const officeA = await seedUser("office-a", "office_admin", orgA.id);
    const tech1User = await seedUser("tech-1", "technician", orgA.id);
    const tech2User = await seedUser("tech-2", "technician", orgA.id);

    const tech1 = await technicianRepo.save(technicianRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      auth_user_id: tech1User.user.id,
      display_name: "Tech 1",
      phone: null,
      specialties: [],
      last_seen_at: null,
    }));
    const tech2 = await technicianRepo.save(technicianRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      auth_user_id: tech2User.user.id,
      display_name: "Tech 2",
      phone: null,
      specialties: [],
      last_seen_at: null,
    }));

    const customerA = await customerRepo.save(customerRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      full_name: "Customer A",
      email: "a@example.com",
      company_name: null,
      service_address_line_1: "1 Main",
      service_address_line_2: null,
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T1T1T1",
      phone: "4035550100",
    }));
    const customerB = await customerRepo.save(customerRepo.create({
      id: randomUUID(),
      organization_id: orgB.id,
      full_name: "Customer B",
      email: "b@example.com",
      company_name: null,
      service_address_line_1: "2 Main",
      service_address_line_2: null,
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T2T2T2",
      phone: "4035550200",
    }));

    async function createJob(input: {
      orgId: string;
      customerId: string;
      jobType: JobType;
      assignedTechnicianId: string | null;
      title: string;
    }) {
      return jobRepo.save(jobRepo.create({
        id: randomUUID(),
        organization_id: input.orgId,
        customer_id: input.customerId,
        assigned_technician_id: input.assignedTechnicianId,
        title: input.title,
        description: "RBAC smoke",
        lead_source: "website",
        requested_service_type: input.jobType === "inspection" ? "inspection" : "repair",
        job_type: input.jobType,
        status: "scheduled",
        service_address_line_1: "1 Main",
        service_city: "Calgary",
        service_state_or_region: "AB",
        service_postal_code: "T1T1T1",
        scheduled_for: new Date(),
      }));
    }

    const inspectionJob = await createJob({
      orgId: orgA.id,
      customerId: customerA.id,
      jobType: "inspection",
      assignedTechnicianId: tech1.id,
      title: "Inspection Job",
    });
    const installJob = await createJob({
      orgId: orgA.id,
      customerId: customerA.id,
      jobType: "installation_repair",
      assignedTechnicianId: tech2.id,
      title: "Install Job",
    });
    const callbackJob = await createJob({
      orgId: orgA.id,
      customerId: customerA.id,
      jobType: "callback_warranty",
      assignedTechnicianId: tech1.id,
      title: "Callback Job",
    });
    const unassignedJob = await createJob({
      orgId: orgA.id,
      customerId: customerA.id,
      jobType: "installation_repair",
      assignedTechnicianId: null,
      title: "Unassigned Job",
    });
    const orgBJob = await createJob({
      orgId: orgB.id,
      customerId: customerB.id,
      jobType: "inspection",
      assignedTechnicianId: null,
      title: "Org B Job",
    });

    const adminActor = buildActor({
      ...adminA,
      organizationId: orgA.id,
    });
    const officeActor = buildActor({
      ...officeA,
      organizationId: orgA.id,
    });
    const tech1Actor = buildActor({
      ...tech1User,
      organizationId: orgA.id,
      technician: tech1,
    });
    const tech2Actor = buildActor({
      ...tech2User,
      organizationId: orgA.id,
      technician: tech2,
    });

    await record(summary, "admin sees all org A jobs including unassigned", async () => {
      const jobs = await jobsService.listJobs(adminActor, orgA.id);
      const ids = new Set(jobs.map((job) => job.id));
      assert.equal(ids.has(inspectionJob.id), true);
      assert.equal(ids.has(installJob.id), true);
      assert.equal(ids.has(callbackJob.id), true);
      assert.equal(ids.has(unassignedJob.id), true);
      assert.equal(ids.has(orgBJob.id), false);
    });

    await record(summary, "office sees all org A jobs including unassigned", async () => {
      const jobs = await jobsService.listJobs(officeActor, orgA.id);
      const ids = new Set(jobs.map((job) => job.id));
      assert.equal(ids.has(unassignedJob.id), true);
      assert.equal(ids.size, 4);
    });

    await record(summary, "admin cannot access org B job", async () => {
      await expectNotFound(() => findJobForActor(jobRepo, orgBJob.id, orgA.id, adminActor));
    });

    await record(summary, "office cannot access org B job", async () => {
      await expectNotFound(() => findJobForActor(jobRepo, orgBJob.id, orgA.id, officeActor));
    });

    await record(summary, "tech1 sees only assigned jobs", async () => {
      const jobs = await jobsService.listJobs(tech1Actor, orgA.id);
      const ids = new Set(jobs.map((job) => job.id));
      assert.equal(ids.has(inspectionJob.id), true);
      assert.equal(ids.has(callbackJob.id), true);
      assert.equal(ids.has(installJob.id), false);
      assert.equal(ids.has(unassignedJob.id), false);
    });

    await record(summary, "tech2 sees only assigned jobs", async () => {
      const jobs = await jobsService.listJobs(tech2Actor, orgA.id);
      const ids = new Set(jobs.map((job) => job.id));
      assert.equal(ids.has(installJob.id), true);
      assert.equal(ids.has(inspectionJob.id), false);
      assert.equal(ids.has(unassignedJob.id), false);
    });

    await record(summary, "tech1 cannot access tech2 job directly", async () => {
      await expectForbidden(() => findJobForActor(jobRepo, installJob.id, orgA.id, tech1Actor));
    });

    await record(summary, "tech1 cannot access unassigned job directly", async () => {
      await expectForbidden(() => findJobForActor(jobRepo, unassignedJob.id, orgA.id, tech1Actor));
    });

    await record(summary, "tech1 cannot access org B job", async () => {
      await expectNotFound(() => findJobForActor(jobRepo, orgBJob.id, orgA.id, tech1Actor));
    });

    await record(summary, "all three job types persist and read correctly", async () => {
      const inspection = await findJobForActor(jobRepo, inspectionJob.id, orgA.id, adminActor);
      const install = await findJobForActor(jobRepo, installJob.id, orgA.id, adminActor);
      const callback = await findJobForActor(jobRepo, callbackJob.id, orgA.id, adminActor);
      assert.equal(inspection.job_type, "inspection");
      assert.equal(install.job_type, "installation_repair");
      assert.equal(callback.job_type, "callback_warranty");
    });

    summary.ok = summary.errors.length === 0;
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.ok) {
      process.exitCode = 1;
    }
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await adminConnection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await adminConnection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
