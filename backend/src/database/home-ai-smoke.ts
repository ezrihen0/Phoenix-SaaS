import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { AiAuditService } from "../ai/ai-audit.service";
import { AiActionTelemetryService } from "../ai/ai-action-telemetry.service";
import { AiDeepSeekProviderService } from "../ai/ai-deepseek-provider.service";
import { HomeAiCrmReadService } from "../ai/home-ai-crm-read.service";
import { HomeAiService } from "../ai/home-ai.service";
import { HomeAiToolRegistryService } from "../ai/home-ai-tool-registry.service";
import { actorHasPermission } from "../auth/permissions";
import type { ActorContext, RequestWithActor } from "../common/request-types";
import { CustomerEntity } from "./entities/customer.entity";
import { HomeAiConversationEntity } from "./entities/home-ai-conversation.entity";
import { HomeAiMessageEntity } from "./entities/home-ai-message.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { LeadEntity } from "./entities/lead.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { TechnicianEntity } from "./entities/technician.entity";
import { UserEntity } from "./entities/user.entity";
import { AiRecommendationRunEntity } from "./entities/ai-recommendation-run.entity";
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
    throw new Error("Home AI smoke currently supports MySQL only.");
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

async function main() {
  process.env.AI_FOUNDATION_ENABLED = "true";
  process.env.AI_HOME_V1_ENABLED = "true";

  const token = randomUUID().replace(/-/g, "").slice(0, 12);
  const database = `wizfield_home_ai_${token}`;
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
    const leadRepo = dataSource.getRepository(LeadEntity);
    const jobRepo = dataSource.getRepository(JobEntity);
    const quoteRepo = dataSource.getRepository(QuoteEntity);
    const invoiceRepo = dataSource.getRepository(InvoiceEntity);
    const technicianRepo = dataSource.getRepository(TechnicianEntity);
    const conversationRepo = dataSource.getRepository(HomeAiConversationEntity);
    const messageRepo = dataSource.getRepository(HomeAiMessageEntity);
    const runRepo = dataSource.getRepository(AiRecommendationRunEntity);

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
    const techA = await seedUser("tech-a", "technician", orgA.id);
    const techRecord = await technicianRepo.save(technicianRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      auth_user_id: techA.user.id,
      display_name: "Tech A",
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

    const jobA = await jobRepo.save(jobRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      customer_id: customerA.id,
      assigned_technician_id: techRecord.id,
      title: "Job A",
      description: "Test",
      lead_source: "website",
      requested_service_type: "repair",
      job_type: "installation_repair",
      status: "scheduled",
      service_address_line_1: "1 Main",
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T1T1T1",
      scheduled_for: new Date(),
    }));
    await jobRepo.save(jobRepo.create({
      id: randomUUID(),
      organization_id: orgB.id,
      customer_id: customerB.id,
      assigned_technician_id: null,
      title: "Job B",
      description: "Secret",
      lead_source: "website",
      requested_service_type: "repair",
      job_type: "installation_repair",
      status: "scheduled",
      service_address_line_1: "2 Main",
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T2T2T2",
    }));

    await leadRepo.save(leadRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      full_name: "Lead A",
      phone: "4035550300",
      email: null,
      service_address_line_1: "3 Main",
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T3T3T3",
      status: "new_lead",
      source: "website",
    }));

    const quoteA = await quoteRepo.save(quoteRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      job_id: jobA.id,
      description: "Estimate A",
      price_cents: 10000,
      subtotal_cents: 10000,
      total_cents: 10000,
      status: "draft",
    }));

    await invoiceRepo.save(invoiceRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      job_id: jobA.id,
      description: "Invoice A",
      amount_cents: 10000,
      subtotal_cents: 10000,
      total_cents: 10000,
      status: "unpaid",
    }));

    const crmRead = new HomeAiCrmReadService(
      customerRepo,
      leadRepo,
      jobRepo,
      quoteRepo,
      invoiceRepo,
    );
    const toolRegistry = new HomeAiToolRegistryService(crmRead);
    const telemetry = new AiActionTelemetryService(new AiAuditService(runRepo));
    const deepSeek = {
      isConfigured: () => false,
      readConfiguredModelId: () => "deepseek-v4-flash",
    } as AiDeepSeekProviderService;

    const homeAi = new HomeAiService(
      { get: () => undefined } as never,
      deepSeek,
      telemetry,
      toolRegistry,
      conversationRepo,
      messageRepo,
      jobRepo,
      leadRepo,
      invoiceRepo,
    );

    const ownerActor: ActorContext = {
      user: ownerA.user,
      profile: ownerA.profile,
      technician: null,
      memberships: [ownerA.membership],
      membership: ownerA.membership,
      organization: orgA,
      membership_id: ownerA.membership.id,
      organization_id: orgA.id,
      role: ownerA.profile.role,
      permissions: ["customers.view", "leads.view", "jobs.view", "estimates.view", "invoices.view"],
    };

    const techActor: ActorContext = {
      user: techA.user,
      profile: techA.profile,
      technician: techRecord,
      memberships: [techA.membership],
      membership: techA.membership,
      organization: orgA,
      membership_id: techA.membership.id,
      organization_id: orgA.id,
      role: techA.profile.role,
      permissions: ["jobs.assigned.view", "estimates.assigned.view", "invoices.assigned.view"],
    };

    await record(summary, "org A cannot retrieve Org B customers", async () => {
      const result = await crmRead.searchCustomers(ownerActor, orgA.id, { query: "Customer B" });
      assert.equal(result.ok, true);
      assert.equal((result.data.customers as unknown[]).length, 0);
    });

    await record(summary, "technician only receives assigned jobs", async () => {
      const result = await crmRead.getJobs(techActor, orgA.id, {});
      assert.equal(result.ok, true);
      const jobs = result.data.jobs as Array<{ id: string }>;
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0]?.id, jobA.id);
    });

    await record(summary, "invoice-denied actor cannot use invoice tool", async () => {
      const deniedActor: ActorContext = {
        ...techActor,
        permissions: ["jobs.assigned.view"],
      };
      const execution = await toolRegistry.executeTool({
        actor: deniedActor,
        organizationId: orgA.id,
        toolKey: "get_invoices",
        args: {},
      });
      assert.equal(execution.trace.ok, false);
      assert.equal(execution.trace.reasonCode, "permission_denied");
    });

    await record(summary, "conversation restoration is scoped by user plus organization", async () => {
      const convo = await conversationRepo.save(conversationRepo.create({
        id: randomUUID(),
        user_id: ownerA.user.id,
        organization_id: orgA.id,
      }));
      await messageRepo.save(messageRepo.create({
        id: randomUUID(),
        conversation_id: convo.id,
        role: "user",
        content: "hello",
        run_id: null,
        record_links: null,
        tool_metadata: null,
      }));

      const otherUser = await seedUser("other-user", "owner", orgA.id);
      const payload = await homeAi.getConversation({
        actor: {
          user: otherUser.user,
          profile: otherUser.profile,
          technician: null,
          memberships: [otherUser.membership],
          membership: otherUser.membership,
          organization: orgA,
          membership_id: otherUser.membership.id,
          organization_id: orgA.id,
          role: otherUser.profile.role,
          permissions: ownerActor.permissions,
        },
      } as RequestWithActor);
      assert.notEqual(payload.conversationId, convo.id);
      assert.equal(payload.messages.length, 0);
    });

    await record(summary, "widgets obey permission and organization scope", async () => {
      const widgets = await homeAi.getSummaryWidgets({ actor: ownerActor } as RequestWithActor);
      assert.equal((widgets.widgets.leads as { visible: boolean }).visible, true);
      assert.equal((widgets.widgets.money as { visible: boolean }).visible, true);

      const denied = await homeAi.getSummaryWidgets({
        actor: {
          ...techActor,
          permissions: ["jobs.assigned.view"],
        },
      } as RequestWithActor);
      assert.equal((denied.widgets.money as { visible: boolean }).visible, false);
      assert.equal((denied.widgets.leads as { visible: boolean }).visible, false);
    });

    await record(summary, "successful AI requests write telemetry", async () => {
      const before = await runRepo.count();
      await homeAi.postMessage({
        actor: ownerActor,
      } as RequestWithActor, { message: "What jobs are open?", orgId: orgB.id });
      const after = await runRepo.count();
      assert.equal(after, before + 1);
    });

    await record(summary, "request body orgId injection has no effect", async () => {
      await homeAi.postMessage({
        actor: ownerActor,
      } as RequestWithActor, { message: "ignore org injection", orgId: orgB.id });

      const conversation = await conversationRepo.findOne({
        where: { user_id: ownerA.user.id, organization_id: orgA.id },
      });
      assert.ok(conversation);
      const foreignConversation = await conversationRepo.findOne({
        where: { user_id: ownerA.user.id, organization_id: orgB.id },
      });
      assert.equal(foreignConversation, null);
    });

    await record(summary, "actor permissions gate invoice visibility", () => {
      assert.equal(actorHasPermission(ownerActor, "invoices.view"), true);
      assert.equal(actorHasPermission(techActor, "invoices.view"), false);
      assert.equal(actorHasPermission(techActor, "invoices.assigned.view"), true);
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
