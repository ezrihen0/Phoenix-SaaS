import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Not, Repository } from "typeorm";

import type { ActorContext } from "../common/request-types";
import {
  canAccessEstimateResource,
  canAccessInvoiceResource,
  canAccessJobResource,
} from "../auth/permissions";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { LeadEntity } from "../database/entities/lead.entity";
import { QuoteEntity } from "../database/entities/quote.entity";
import { openJobStatuses } from "../crm/constants";
import { endOfLocalDashboardDay, startOfLocalDashboardDay } from "../crm/crm-dashboard-time-window";
import {
  applyJobVisibilityToQueryBuilder,
  isAssignedOnlyJobActor,
} from "../crm/jobs-access";
import type { HomeAiRecordLink } from "./home-ai-role-profiles";

export type HomeAiToolExecutionResult =
  | { ok: true; data: Record<string, unknown>; recordLinks: HomeAiRecordLink[] }
  | { ok: false; reasonCode: string; message: string };

@Injectable()
export class HomeAiCrmReadService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
    @InjectRepository(LeadEntity)
    private readonly leadsRepository: Repository<LeadEntity>,
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
    @InjectRepository(QuoteEntity)
    private readonly quotesRepository: Repository<QuoteEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoicesRepository: Repository<InvoiceEntity>,
  ) {}

  private assignedOnly(actor: ActorContext): boolean {
    return isAssignedOnlyJobActor(actor);
  }

  async searchCustomers(
    actor: ActorContext,
    organizationId: string,
    input: { query?: string; limit?: number },
  ): Promise<HomeAiToolExecutionResult> {
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 15);
    const query = (input.query ?? "").trim();

    const qb = this.customersRepository
      .createQueryBuilder("customer")
      .where("customer.organization_id = :organizationId", { organizationId })
      .orderBy("customer.updated_at", "DESC")
      .take(limit);

    if (query) {
      qb.andWhere(new Brackets((where) => {
        where.where("customer.full_name LIKE :like", { like: `%${query}%` })
          .orWhere("customer.email LIKE :like", { like: `%${query}%` })
          .orWhere("customer.phone LIKE :like", { like: `%${query}%` });
      }));
    }

    const customers = await qb.getMany();
    const recordLinks: HomeAiRecordLink[] = customers.map((customer) => ({
      type: "customer",
      id: customer.id,
      label: customer.full_name,
    }));

    return {
      ok: true,
      data: {
        count: customers.length,
        customers: customers.map((customer) => ({
          id: customer.id,
          name: customer.full_name,
          email: customer.email,
          phone: customer.phone,
          city: customer.service_city,
        })),
      },
      recordLinks,
    };
  }

  async getLeads(
    actor: ActorContext,
    organizationId: string,
    input: { status?: string; limit?: number },
  ): Promise<HomeAiToolExecutionResult> {
    const limit = Math.min(Math.max(input.limit ?? 15, 1), 20);
    const where: Record<string, unknown> = { organization_id: organizationId };

    if (input.status?.trim()) {
      where.status = input.status.trim();
    } else {
      where.status = Not("converted");
    }

    const leads = await this.leadsRepository.find({
      where,
      order: { created_at: "DESC" },
      take: limit,
    });

    const recordLinks: HomeAiRecordLink[] = leads.map((lead) => ({
      type: "lead",
      id: lead.id,
      label: lead.full_name || lead.phone || "Lead",
    }));

    return {
      ok: true,
      data: {
        count: leads.length,
        leads: leads.map((lead) => ({
          id: lead.id,
          name: lead.full_name,
          phone: lead.phone,
          email: lead.email,
          status: lead.status,
          source: lead.source,
          createdAt: lead.created_at.toISOString(),
        })),
      },
      recordLinks,
    };
  }

  async getJobs(
    actor: ActorContext,
    organizationId: string,
    input: { status?: string; limit?: number },
  ): Promise<HomeAiToolExecutionResult> {
    const limit = Math.min(Math.max(input.limit ?? 15, 1), 20);
    const assignedOnly = this.assignedOnly(actor);

    const qb = this.jobsRepository
      .createQueryBuilder("job")
      .leftJoinAndSelect("job.customer", "customer")
      .leftJoinAndSelect("job.technician", "technician")
      .orderBy("job.scheduled_for", "ASC")
      .addOrderBy("job.created_at", "DESC")
      .take(limit * 2);

    applyJobVisibilityToQueryBuilder(qb, actor, organizationId);

    if (input.status?.trim()) {
      qb.andWhere("job.status = :status", { status: input.status.trim() });
    } else {
      qb.andWhere("job.status != :cancelled", { cancelled: "cancelled" });
    }

    const rawJobs = await qb.getMany();
    const jobs = rawJobs
      .filter((job) => canAccessJobResource(actor, job.assigned_technician_id))
      .slice(0, limit);

    const recordLinks: HomeAiRecordLink[] = jobs.map((job) => ({
      type: "job",
      id: job.id,
      label: job.title || job.customer?.full_name || "Job",
    }));

    return {
      ok: true,
      data: {
        count: jobs.length,
        assignedOnly,
        jobs: jobs.map((job) => ({
          id: job.id,
          title: job.title,
          status: job.status,
          customerName: job.customer?.full_name ?? null,
          technicianName: job.technician?.display_name ?? null,
          scheduledFor: job.scheduled_for?.toISOString() ?? null,
        })),
      },
      recordLinks,
    };
  }

  async getSchedule(
    actor: ActorContext,
    organizationId: string,
    input: { day?: string; limit?: number },
  ): Promise<HomeAiToolExecutionResult> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 25);
    const dayStart = input.day ? new Date(`${input.day}T00:00:00`) : startOfLocalDashboardDay();
    const dayEnd = input.day ? new Date(`${input.day}T23:59:59.999`) : endOfLocalDashboardDay();
    const assignedOnly = this.assignedOnly(actor);

    const qb = this.jobsRepository
      .createQueryBuilder("job")
      .leftJoinAndSelect("job.customer", "customer")
      .leftJoinAndSelect("job.technician", "technician")
      .andWhere("job.scheduled_for IS NOT NULL")
      .andWhere("job.scheduled_for >= :dayStart", { dayStart })
      .andWhere("job.scheduled_for <= :dayEnd", { dayEnd })
      .andWhere("job.status IN (:...statuses)", { statuses: [...openJobStatuses, "completed"] })
      .orderBy("job.scheduled_for", "ASC")
      .take(limit * 2);

    applyJobVisibilityToQueryBuilder(qb, actor, organizationId);

    const rawJobs = await qb.getMany();
    const jobs = rawJobs
      .filter((job) => canAccessJobResource(actor, job.assigned_technician_id))
      .slice(0, limit);

    const recordLinks: HomeAiRecordLink[] = [
      { type: "schedule", id: "today", label: "Schedule" },
      ...jobs.map((job) => ({
        type: "job" as const,
        id: job.id,
        label: job.title || job.customer?.full_name || "Job",
      })),
    ];

    return {
      ok: true,
      data: {
        dayStart: dayStart.toISOString(),
        dayEnd: dayEnd.toISOString(),
        count: jobs.length,
        schedule: jobs.map((job) => ({
          id: job.id,
          title: job.title,
          status: job.status,
          customerName: job.customer?.full_name ?? null,
          technicianName: job.technician?.display_name ?? null,
          scheduledFor: job.scheduled_for?.toISOString() ?? null,
          scheduledWindow: job.scheduled_window,
        })),
      },
      recordLinks,
    };
  }

  async getEstimates(
    actor: ActorContext,
    organizationId: string,
    input: { status?: string; limit?: number },
  ): Promise<HomeAiToolExecutionResult> {
    const limit = Math.min(Math.max(input.limit ?? 15, 1), 20);

    const qb = this.quotesRepository
      .createQueryBuilder("quote")
      .leftJoinAndSelect("quote.job", "job")
      .leftJoinAndSelect("job.customer", "customer")
      .where("quote.organization_id = :organizationId", { organizationId })
      .orderBy("quote.updated_at", "DESC")
      .take(limit * 3);

    if (input.status?.trim()) {
      qb.andWhere("quote.status = :status", { status: input.status.trim() });
    }

    const rawQuotes = await qb.getMany();
    const quotes = rawQuotes
      .filter((quote) => canAccessEstimateResource(actor, quote.job?.assigned_technician_id ?? null))
      .slice(0, limit);

    const recordLinks: HomeAiRecordLink[] = quotes.map((quote) => ({
      type: "estimate",
      id: quote.id,
      label: quote.description || quote.job?.title || "Estimate",
    }));

    return {
      ok: true,
      data: {
        count: quotes.length,
        estimates: quotes.map((quote) => ({
          id: quote.id,
          title: quote.description,
          status: quote.status,
          totalCents: quote.total_cents,
          jobId: quote.job_id,
          customerName: quote.job?.customer?.full_name ?? null,
          updatedAt: quote.updated_at.toISOString(),
        })),
      },
      recordLinks,
    };
  }

  async getInvoices(
    actor: ActorContext,
    organizationId: string,
    input: { status?: string; limit?: number },
  ): Promise<HomeAiToolExecutionResult> {
    const limit = Math.min(Math.max(input.limit ?? 15, 1), 20);

    const qb = this.invoicesRepository
      .createQueryBuilder("invoice")
      .leftJoinAndSelect("invoice.job", "job")
      .leftJoinAndSelect("job.customer", "customer")
      .where("invoice.organization_id = :organizationId", { organizationId })
      .orderBy("invoice.updated_at", "DESC")
      .take(limit * 3);

    if (input.status?.trim()) {
      qb.andWhere("invoice.status = :status", { status: input.status.trim() });
    }

    const rawInvoices = await qb.getMany();
    const invoices = rawInvoices
      .filter((invoice) => canAccessInvoiceResource(actor, invoice.job?.assigned_technician_id ?? null))
      .slice(0, limit);

    const recordLinks: HomeAiRecordLink[] = invoices.map((invoice) => ({
      type: "invoice",
      id: invoice.id,
      label: invoice.description || invoice.job?.title || "Invoice",
    }));

    return {
      ok: true,
      data: {
        count: invoices.length,
        invoices: invoices.map((invoice) => ({
          id: invoice.id,
          description: invoice.description,
          status: invoice.status,
          totalCents: invoice.total_cents,
          amountCents: invoice.amount_cents,
          jobId: invoice.job_id,
          customerName: invoice.job?.customer?.full_name ?? null,
          updatedAt: invoice.updated_at.toISOString(),
        })),
      },
      recordLinks,
    };
  }
}
