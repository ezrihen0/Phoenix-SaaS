import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource, Repository } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import type { ActorContext } from "../common/request-types";
import { BranchScopeService } from "../crm/branch-scope.service";
import { JobsService } from "../crm/jobs.service";
import { BranchEntity } from "./entities/branch.entity";
import { MembershipBranchAccessEntity } from "./entities/membership-branch-access.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { findJobForActor } from "../crm/jobs-access";
import {
  getJobStatusTimestampUpdates,
  type JobStatus,
  type JobType,
} from "../crm/constants";
import { mapJobStatusToOperationalBucket } from "../crm/job-status-model";
import {
  assertMayPatchJob,
  assertMayUpdateJobStatus,
} from "../crm/jobs-technician-mutation-gate";
import { parseUpdateJobPayload } from "../crm/validation";
import { CustomerEntity } from "./entities/customer.entity";
import { JobEntity } from "./entities/job.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { TechnicianEntity } from "./entities/technician.entity";
import { UserEntity } from "./entities/user.entity";
import { listPermissionsForMembership } from "../team/membership-permissions";
import { MultiBranchPhase1Foundation1790000000000 } from "./migrations/deferred/1790000000000-multi-branch-phase1-foundation";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";

async function initializeJobsRbacSmokeDataSource(
  baseOptions: MysqlConnectionOptions,
  database: string,
): Promise<DataSource> {
  const dataSource = new DataSource({ ...baseOptions, database, migrationsRun: false });
  await dataSource.initialize();
  await dataSource.runMigrations();

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await new MultiBranchPhase1Foundation1790000000000().up(queryRunner);
  await queryRunner.release();

  await verifyDatabaseSchema(dataSource);
  return dataSource;
}

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
    platform_capabilities: [],
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

async function expectBadRequest(run: () => Promise<unknown>) {
  try {
    await run();
    throw new Error("Expected bad request response.");
  } catch (error) {
    if (!(error instanceof HttpException) || error.getStatus() !== 400) {
      throw error;
    }
  }
}

async function applyJobStatusUpdate(
  jobRepo: Repository<JobEntity>,
  actor: ActorContext,
  organizationId: string,
  jobId: string,
  nextStatus: JobStatus,
) {
  const job = await findJobForActor(jobRepo, jobId, organizationId, actor, {});
  assertMayUpdateJobStatus(actor, job, nextStatus);
  const timestamp = new Date();
  await jobRepo.update(
    { id: jobId, organization_id: organizationId },
    {
      status: nextStatus,
      updated_by_auth_user_id: actor.user.id,
      ...getJobStatusTimestampUpdates(nextStatus, timestamp),
    },
  );
}

async function applyJobSchedulePatch(
  jobRepo: Repository<JobEntity>,
  actor: ActorContext,
  organizationId: string,
  jobId: string,
  body: Record<string, unknown>,
) {
  const payload = parseUpdateJobPayload(body);
  const job = await findJobForActor(jobRepo, jobId, organizationId, actor, {});
  assertMayPatchJob(actor, job, payload);
  const scheduledFor =
    payload.scheduledFor !== undefined
      ? (payload.scheduledFor ? new Date(payload.scheduledFor) : null)
      : job.scheduled_for;
  await jobRepo.update(
    { id: jobId, organization_id: organizationId },
    {
      scheduled_for: scheduledFor,
      scheduled_window:
        payload.scheduledWindow !== undefined ? payload.scheduledWindow : job.scheduled_window,
      updated_by_auth_user_id: actor.user.id,
      ...(payload.title !== undefined ? { title: payload.title } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.assignedTechnicianId !== undefined
        ? { assigned_technician_id: payload.assignedTechnicianId }
        : {}),
    },
  );
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
    dataSource = await initializeJobsRbacSmokeDataSource(baseOptions, database);

    const orgRepo = dataSource.getRepository(OrganizationEntity);
    const userRepo = dataSource.getRepository(UserEntity);
    const profileRepo = dataSource.getRepository(ProfileEntity);
    const membershipRepo = dataSource.getRepository(MembershipEntity);
    const customerRepo = dataSource.getRepository(CustomerEntity);
    const jobRepo = dataSource.getRepository(JobEntity);
    const technicianRepo = dataSource.getRepository(TechnicianEntity);
    const branchScopeService = new BranchScopeService(
      dataSource.getRepository(BranchEntity),
      dataSource.getRepository(MembershipBranchAccessEntity),
      jobRepo,
      dataSource.getRepository(QuoteEntity),
      dataSource.getRepository(InvoiceEntity),
      dataSource,
    );
    const jobsService = new JobsService(jobRepo, branchScopeService);
    const branchRepo = dataSource.getRepository(BranchEntity);
    const branchAccessRepo = dataSource.getRepository(MembershipBranchAccessEntity);

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

    const ownerA = await seedUser("owner-a", "owner", orgA.id);
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

    const branchA = await branchRepo.save(branchRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      name: "Alberta",
      code: "AB",
      tax_label: "GST",
      default_tax_rate_bps: 500,
      invoice_prefix: "AB-INV-",
      estimate_prefix: "AB-EST-",
      active: true,
      sort_order: 1,
    }));

    await branchAccessRepo.save([
      branchAccessRepo.create({
        id: randomUUID(),
        membership_id: officeA.membership.id,
        branch_id: branchA.id,
      }),
      branchAccessRepo.create({
        id: randomUUID(),
        membership_id: tech1User.membership.id,
        branch_id: branchA.id,
      }),
      branchAccessRepo.create({
        id: randomUUID(),
        membership_id: tech2User.membership.id,
        branch_id: branchA.id,
      }),
    ]);

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
      status?: JobStatus;
      scheduledFor?: Date | null;
    }) {
      return jobRepo.save(jobRepo.create({
        id: randomUUID(),
        organization_id: input.orgId,
        branch_id: input.orgId === orgA.id ? branchA.id : null,
        customer_id: input.customerId,
        assigned_technician_id: input.assignedTechnicianId,
        title: input.title,
        description: "RBAC smoke",
        lead_source: "website",
        requested_service_type: input.jobType === "inspection" ? "inspection" : "repair",
        job_type: input.jobType,
        status: input.status ?? "scheduled",
        service_address_line_1: "1 Main",
        service_city: "Calgary",
        service_state_or_region: "AB",
        service_postal_code: "T1T1T1",
        scheduled_for: input.scheduledFor === undefined ? new Date() : input.scheduledFor,
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

    const ownerActor = buildActor({
      ...ownerA,
      organizationId: orgA.id,
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

    await record(summary, "admin listJobs filtered by tech1 returns only tech1 assignments", async () => {
      const jobs = await jobsService.listJobs(adminActor, orgA.id, { technicianId: tech1.id });
      const ids = new Set(jobs.map((job) => job.id));
      assert.equal(ids.has(inspectionJob.id), true);
      assert.equal(ids.has(callbackJob.id), true);
      assert.equal(ids.has(installJob.id), false);
      assert.equal(ids.has(unassignedJob.id), false);
    });

    await record(summary, "admin listJobs filtered by tech2 returns only tech2 assignments", async () => {
      const jobs = await jobsService.listJobs(adminActor, orgA.id, { technicianId: tech2.id });
      const ids = new Set(jobs.map((job) => job.id));
      assert.equal(ids.has(installJob.id), true);
      assert.equal(ids.size, 1);
    });

    await record(summary, "tech1 listJobs with other technicianId still scoped to self", async () => {
      const jobs = await jobsService.listJobs(tech1Actor, orgA.id, { technicianId: tech2.id });
      const ids = new Set(jobs.map((job) => job.id));
      assert.equal(ids.has(installJob.id), false);
      assert.equal(ids.has(inspectionJob.id), true);
    });

    await record(summary, "all three job types persist and read correctly", async () => {
      const inspection = await findJobForActor(jobRepo, inspectionJob.id, orgA.id, adminActor);
      const install = await findJobForActor(jobRepo, installJob.id, orgA.id, adminActor);
      const callback = await findJobForActor(jobRepo, callbackJob.id, orgA.id, adminActor);
      assert.equal(inspection.job_type, "inspection");
      assert.equal(install.job_type, "installation_repair");
      assert.equal(callback.job_type, "callback_warranty");
    });

    const tech1StatusJob = await createJob({
      orgId: orgA.id,
      customerId: customerA.id,
      jobType: "installation_repair",
      assignedTechnicianId: tech1.id,
      title: "Tech1 Status Job",
      status: "scheduled",
    });
    const tech1ScheduleJob = await createJob({
      orgId: orgA.id,
      customerId: customerA.id,
      jobType: "installation_repair",
      assignedTechnicianId: tech1.id,
      title: "Tech1 Schedule Job",
      status: "scheduled",
    });
    const queueCompletedJob = await createJob({
      orgId: orgA.id,
      customerId: customerA.id,
      jobType: "installation_repair",
      assignedTechnicianId: tech1.id,
      title: "Queue Completed Job",
      status: "scheduled",
    });
    const queueCancelledJob = await createJob({
      orgId: orgA.id,
      customerId: customerA.id,
      jobType: "installation_repair",
      assignedTechnicianId: tech1.id,
      title: "Queue Cancelled Job",
      status: "submitted",
      scheduledFor: null,
    });
    const legacyLeadJob = await createJob({
      orgId: orgA.id,
      customerId: customerA.id,
      jobType: "installation_repair",
      assignedTechnicianId: tech1.id,
      title: "Legacy Lead Job",
      status: "new_lead",
      scheduledFor: null,
    });
    const legacyProgressJob = await createJob({
      orgId: orgA.id,
      customerId: customerA.id,
      jobType: "installation_repair",
      assignedTechnicianId: tech1.id,
      title: "Legacy Progress Job",
      status: "in_progress",
    });
    const legacyPaidJob = await createJob({
      orgId: orgA.id,
      customerId: customerA.id,
      jobType: "installation_repair",
      assignedTechnicianId: tech1.id,
      title: "Legacy Paid Job",
      status: "paid",
      scheduledFor: null,
    });

    await record(summary, "1 technician can update status on assigned job", async () => {
      await applyJobStatusUpdate(jobRepo, tech1Actor, orgA.id, tech1StatusJob.id, "completed");
      const updated = await jobRepo.findOneByOrFail({ id: tech1StatusJob.id });
      assert.equal(updated.status, "completed");
    });

    await record(summary, "2 technician can change scheduled date/time on assigned job", async () => {
      const nextSchedule = new Date("2030-06-15T18:00:00.000Z");
      await applyJobSchedulePatch(jobRepo, tech1Actor, orgA.id, tech1ScheduleJob.id, {
        scheduledFor: nextSchedule.toISOString(),
        scheduledWindow: "10:00-12:00",
        assignedTechnicianId: tech1.id,
      });
      const updated = await jobRepo.findOneByOrFail({ id: tech1ScheduleJob.id });
      assert.equal(updated.scheduled_for?.toISOString(), nextSchedule.toISOString());
      assert.equal(updated.scheduled_window, "10:00-12:00");
    });

    await record(summary, "3 technician cannot update status on another technicians job", async () => {
      await expectForbidden(() =>
        applyJobStatusUpdate(jobRepo, tech1Actor, orgA.id, installJob.id, "completed"),
      );
    });

    await record(summary, "4 technician cannot change schedule on another technicians job", async () => {
      await expectForbidden(() =>
        applyJobSchedulePatch(jobRepo, tech1Actor, orgA.id, installJob.id, {
          scheduledFor: new Date("2030-07-01T15:00:00.000Z").toISOString(),
        }),
      );
    });

    await record(summary, "5 technician cannot reassign job to another technician", async () => {
      await expectForbidden(() =>
        applyJobSchedulePatch(jobRepo, tech1Actor, orgA.id, tech1ScheduleJob.id, {
          scheduledFor: new Date("2030-07-02T15:00:00.000Z").toISOString(),
          assignedTechnicianId: tech2.id,
        }),
      );
    });

    await record(summary, "6 technician cannot modify unrelated protected job fields through PATCH", async () => {
      await expectForbidden(() =>
        applyJobSchedulePatch(jobRepo, tech1Actor, orgA.id, tech1ScheduleJob.id, {
          title: "Renamed by technician",
        }),
      );
      await expectBadRequest(() =>
        applyJobSchedulePatch(jobRepo, tech1Actor, orgA.id, tech1ScheduleJob.id, {}),
      );
    });

    await record(summary, "7 office admin owner job mutation behavior unchanged", async () => {
      const adminTitleJob = await createJob({
        orgId: orgA.id,
        customerId: customerA.id,
        jobType: "installation_repair",
        assignedTechnicianId: tech2.id,
        title: "Admin Patch Job",
        status: "submitted",
        scheduledFor: null,
      });

      await applyJobSchedulePatch(jobRepo, adminActor, orgA.id, adminTitleJob.id, {
        title: "Admin Renamed Job",
        assignedTechnicianId: tech1.id,
        scheduledFor: new Date("2030-08-01T16:00:00.000Z").toISOString(),
      });
      let updated = await jobRepo.findOneByOrFail({ id: adminTitleJob.id });
      assert.equal(updated.title, "Admin Renamed Job");
      assert.equal(updated.assigned_technician_id, tech1.id);

      await applyJobSchedulePatch(jobRepo, officeActor, orgA.id, adminTitleJob.id, {
        description: "Office updated description",
      });
      updated = await jobRepo.findOneByOrFail({ id: adminTitleJob.id });
      assert.equal(updated.description, "Office updated description");

      const ownerStatusJob = await createJob({
        orgId: orgA.id,
        customerId: customerA.id,
        jobType: "installation_repair",
        assignedTechnicianId: tech2.id,
        title: "Owner Status Job",
        status: "scheduled",
      });
      await applyJobStatusUpdate(jobRepo, ownerActor, orgA.id, ownerStatusJob.id, "cancelled");
      updated = await jobRepo.findOneByOrFail({ id: ownerStatusJob.id });
      assert.equal(updated.status, "cancelled");
    });

    await record(summary, "8 completed jobs move out of active and appear in completed jobs", async () => {
      const activeBefore = await jobsService.listJobs(tech1Actor, orgA.id, { queue: "active" });
      assert.equal(activeBefore.some((job) => job.id === queueCompletedJob.id), true);

      await applyJobStatusUpdate(jobRepo, tech1Actor, orgA.id, queueCompletedJob.id, "completed");

      const activeAfter = await jobsService.listJobs(tech1Actor, orgA.id, { queue: "active" });
      const completedAfter = await jobsService.listJobs(tech1Actor, orgA.id, { queue: "completed" });
      assert.equal(activeAfter.some((job) => job.id === queueCompletedJob.id), false);
      assert.equal(completedAfter.some((job) => job.id === queueCompletedJob.id), true);
    });

    await record(summary, "9 cancelled jobs move out of active and appear in cancelled", async () => {
      const activeBefore = await jobsService.listJobs(tech1Actor, orgA.id, { queue: "active" });
      assert.equal(activeBefore.some((job) => job.id === queueCancelledJob.id), true);

      await applyJobStatusUpdate(jobRepo, tech1Actor, orgA.id, queueCancelledJob.id, "cancelled");

      const activeAfter = await jobsService.listJobs(tech1Actor, orgA.id, { queue: "active" });
      const cancelledAfter = await jobsService.listJobs(adminActor, orgA.id, { queue: "cancelled" });
      assert.equal(activeAfter.some((job) => job.id === queueCancelledJob.id), false);
      assert.equal(cancelledAfter.some((job) => job.id === queueCancelledJob.id), true);
    });

    await record(summary, "10 legacy statuses resolve safely into operational buckets", async () => {
      assert.equal(mapJobStatusToOperationalBucket("new_lead"), "submitted");
      assert.equal(mapJobStatusToOperationalBucket("in_progress"), "scheduled");
      assert.equal(mapJobStatusToOperationalBucket("paid"), "completed");

      const activeIds = new Set(
        (await jobsService.listJobs(tech1Actor, orgA.id, { queue: "active" })).map((job) => job.id),
      );
      assert.equal(activeIds.has(legacyLeadJob.id), true);
      assert.equal(activeIds.has(legacyProgressJob.id), true);
      assert.equal(activeIds.has(legacyPaidJob.id), false);

      const completedIds = new Set(
        (await jobsService.listJobs(tech1Actor, orgA.id, { queue: "completed" })).map((job) => job.id),
      );
      assert.equal(completedIds.has(legacyPaidJob.id), true);
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
