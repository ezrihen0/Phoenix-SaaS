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
import { InvoiceServiceIntelligenceEntity } from "../database/entities/invoice-service-intelligence.entity";
import { JobEntity } from "../database/entities/job.entity";
import { LeadEntity } from "../database/entities/lead.entity";
import { QuoteEntity } from "../database/entities/quote.entity";
import { WarrantyCertificateEntity } from "../database/entities/warranty-certificate.entity";
import { openJobStatuses } from "../crm/constants";
import { invoiceDisplayLabel, sanitizeInvoiceDescription, sanitizeJobTitle, sanitizeUserFacingText } from "../crm/user-facing-text";
import { endOfLocalDashboardDay, startOfLocalDashboardDay } from "../crm/crm-dashboard-time-window";
import {
  applyJobVisibilityToQueryBuilder,
  isAssignedOnlyJobActor,
} from "../crm/jobs-access";
import {
  confidenceGuidance,
  isOrgWideCustomerQuery,
  normalizeComponent,
  normalizePrimaryService,
  normalizeServiceDetail,
  normalizeSystem,
  normalizeWarrantyStatus,
  normalizeWorkAction,
} from "./home-ai-service-intelligence-aliases";
import type { HomeAiRecordLink } from "./home-ai-role-profiles";

export type HomeAiServiceHistoryInput = {
  customerId?: string;
  customerQuery?: string;
  system?: string;
  primaryService?: string;
  serviceDetail?: string;
  component?: string;
  workAction?: string;
  warrantyStatus?: string;
  since?: string;
  until?: string;
  limit?: number;
};

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
    @InjectRepository(InvoiceServiceIntelligenceEntity)
    private readonly intelligenceRepository: Repository<InvoiceServiceIntelligenceEntity>,
    @InjectRepository(WarrantyCertificateEntity)
    private readonly warrantyCertificateRepository: Repository<WarrantyCertificateEntity>,
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
      label: sanitizeJobTitle(job.title, {
        customerName: job.customer?.full_name,
        serviceType: job.requested_service_type,
      }),
    }));

    return {
      ok: true,
      data: {
        count: jobs.length,
        assignedOnly,
        jobs: jobs.map((job) => ({
          id: job.id,
          title: sanitizeJobTitle(job.title, {
            customerName: job.customer?.full_name,
            serviceType: job.requested_service_type,
          }),
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
        label: sanitizeJobTitle(job.title, {
          customerName: job.customer?.full_name,
          serviceType: job.requested_service_type,
        }),
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
          title: sanitizeJobTitle(job.title, {
            customerName: job.customer?.full_name,
            serviceType: job.requested_service_type,
          }),
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
      label: sanitizeUserFacingText(quote.description) || sanitizeJobTitle(quote.job?.title, {
        customerName: quote.job?.customer?.full_name,
        serviceType: quote.job?.requested_service_type,
      }),
    }));

    return {
      ok: true,
      data: {
        count: quotes.length,
        estimates: quotes.map((quote) => ({
          id: quote.id,
          title: sanitizeUserFacingText(quote.description) || quote.description,
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
      label: sanitizeInvoiceDescription(invoice.description) !== "Invoice"
        ? sanitizeInvoiceDescription(invoice.description)
        : sanitizeJobTitle(invoice.job?.title, {
          customerName: invoice.job?.customer?.full_name,
          serviceType: invoice.job?.requested_service_type,
        }),
    }));

    return {
      ok: true,
      data: {
        count: invoices.length,
        invoices: invoices.map((invoice) => ({
          id: invoice.id,
          description: sanitizeInvoiceDescription(invoice.description),
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

  private parseServiceHistoryDate(raw: string | undefined, endOfDay = false): Date | undefined {
    const value = (raw ?? "").trim();
    if (!value) {
      return undefined;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(endOfDay ? `${value}T23:59:59.999` : `${value}T00:00:00`);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private toIso(value: Date | string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  async searchServiceHistory(
    actor: ActorContext,
    organizationId: string,
    input: HomeAiServiceHistoryInput,
  ): Promise<HomeAiToolExecutionResult> {
    const limit = Math.min(Math.max(input.limit ?? 12, 1), 15);
    const serviceDetail = normalizeServiceDetail(input.serviceDetail);
    const system = normalizeSystem(input.system);
    const primaryService = normalizePrimaryService(input.primaryService);
    const component = normalizeComponent(input.component);
    const workAction = normalizeWorkAction(input.workAction);
    const warrantyStatus = normalizeWarrantyStatus(input.warrantyStatus);
    const since = this.parseServiceHistoryDate(input.since);
    const until = this.parseServiceHistoryDate(input.until, true);

    let resolvedCustomerId = input.customerId?.trim() || undefined;
    let customerResolution: "none" | "single" | "ambiguous" | "org_wide" = "org_wide";

    if (resolvedCustomerId) {
      const owned = await this.customersRepository.findOne({
        where: { id: resolvedCustomerId, organization_id: organizationId },
      });
      if (!owned) {
        return {
          ok: true,
          data: {
            source: "service_intelligence_v1",
            customerResolution: "none",
            matchCount: 0,
            records: [],
            latest: null,
            message: "That customer was not found in the active organization.",
          },
          recordLinks: [],
        };
      }
      customerResolution = "single";
    } else if (!isOrgWideCustomerQuery(input.customerQuery)) {
      const matches = await this.customersRepository
        .createQueryBuilder("customer")
        .where("customer.organization_id = :organizationId", { organizationId })
        .andWhere(new Brackets((where) => {
          where.where("customer.full_name LIKE :like", { like: `%${input.customerQuery!.trim()}%` })
            .orWhere("customer.email LIKE :like", { like: `%${input.customerQuery!.trim()}%` })
            .orWhere("customer.phone LIKE :like", { like: `%${input.customerQuery!.trim()}%` });
        }))
        .orderBy("customer.updated_at", "DESC")
        .take(5)
        .getMany();

      if (matches.length === 0) {
        return {
          ok: true,
          data: {
            source: "service_intelligence_v1",
            customerResolution: "none",
            matchCount: 0,
            records: [],
            latest: null,
            message: "No customer matched that name in the active organization.",
          },
          recordLinks: [],
        };
      }

      if (matches.length > 1) {
        return {
          ok: true,
          data: {
            source: "service_intelligence_v1",
            customerResolution: "ambiguous",
            matchCount: 0,
            records: [],
            latest: null,
            customerCandidates: matches.map((customer) => ({ id: customer.id, name: customer.full_name })),
            message: "Multiple customers matched. Ask the user which customer to use instead of guessing.",
          },
          recordLinks: matches.map((customer) => ({
            type: "customer" as const,
            id: customer.id,
            label: customer.full_name,
          })),
        };
      }

      resolvedCustomerId = matches[0].id;
      customerResolution = "single";
    }

    const applyFilters = (qb: ReturnType<Repository<InvoiceServiceIntelligenceEntity>["createQueryBuilder"]>) => {
      qb.where("isi.organization_id = :organizationId", { organizationId })
        .andWhere("invoice.organization_id = :organizationId")
        .andWhere("isi.taxonomy_version = :taxonomy", { taxonomy: "V1" });

      if (serviceDetail) {
        qb.andWhere("JSON_SEARCH(isi.service_detail_json, 'one', :serviceDetail) IS NOT NULL", { serviceDetail });
      }
      if (system) {
        qb.andWhere(
          "(isi.system_bucket = :system OR JSON_SEARCH(isi.system_json, 'one', :system) IS NOT NULL)",
          { system },
        );
      }
      if (primaryService) {
        qb.andWhere("JSON_SEARCH(isi.primary_service_json, 'one', :primaryService) IS NOT NULL", { primaryService });
      }
      if (resolvedCustomerId) {
        qb.andWhere("job.customer_id = :resolvedCustomerId", { resolvedCustomerId });
      }
      if (since) {
        qb.andWhere("invoice.issued_at >= :since", { since });
      }
      if (until) {
        qb.andWhere("invoice.issued_at <= :until", { until });
      }
      if (component || workAction) {
        qb.andWhere(`EXISTS (
          SELECT 1 FROM invoice_service_intelligence_component filter_comp
          WHERE filter_comp.service_intelligence_id = isi.id
            AND filter_comp.organization_id = :organizationId
            ${component ? "AND filter_comp.canonical_component = :component" : ""}
            ${workAction ? "AND filter_comp.work_action = :workAction" : ""}
        )`, {
          ...(component ? { component } : {}),
          ...(workAction ? { workAction } : {}),
        });
      }
      if (warrantyStatus) {
        qb.andWhere(`(
          EXISTS (
            SELECT 1 FROM invoice_service_intelligence_component filter_warr_comp
            WHERE filter_warr_comp.service_intelligence_id = isi.id
              AND filter_warr_comp.organization_id = :organizationId
              AND filter_warr_comp.warranty_status = :warrantyStatus
          ) OR EXISTS (
            SELECT 1 FROM invoice_service_intelligence_warranty filter_warr
            WHERE filter_warr.service_intelligence_id = isi.id
              AND filter_warr.organization_id = :organizationId
              AND filter_warr.warranty_status = :warrantyStatus
          )
        )`, { warrantyStatus });
      }
    };

    const countQb = this.intelligenceRepository
      .createQueryBuilder("isi")
      .innerJoin("isi.invoice", "invoice")
      .leftJoin("invoice.job", "job");
    applyFilters(countQb);
    const matchCount = Number(
      (await countQb.select("COUNT(DISTINCT isi.id)", "total").getRawOne<{ total: string }>())?.total ?? 0,
    );

    const pageQb = this.intelligenceRepository
      .createQueryBuilder("isi")
      .innerJoinAndSelect("isi.invoice", "invoice")
      .leftJoinAndSelect("invoice.job", "job")
      .leftJoinAndSelect("job.customer", "customer")
      .leftJoinAndSelect("isi.components", "components")
      .leftJoinAndSelect("isi.warranties", "warranties")
      .orderBy("invoice.issued_at", "DESC")
      .addOrderBy("isi.id", "DESC")
      .take(limit * 3);
    applyFilters(pageQb);

    const rawRows = await pageQb.getMany();
    const accessible = rawRows
      .filter((row) => canAccessInvoiceResource(actor, row.invoice?.job?.assigned_technician_id ?? null))
      .slice(0, limit);

    const invoiceIds = accessible.map((row) => row.invoice_id);
    const officialCertificates = invoiceIds.length > 0
      ? await this.warrantyCertificateRepository
        .createQueryBuilder("certificate")
        .where("certificate.organization_id = :organizationId", { organizationId })
        .andWhere("certificate.related_invoice_id IN (:...invoiceIds)", { invoiceIds })
        .getMany()
      : [];
    const officialByInvoice = new Map(
      officialCertificates
        .filter((certificate) => certificate.related_invoice_id)
        .map((certificate) => [certificate.related_invoice_id as string, certificate.id]),
    );

    const records = accessible.map((row) => {
      const confidence = row.classification_confidence || "UNKNOWN";
      const officialCertificateId = officialByInvoice.get(row.invoice_id) ?? null;
      return {
        invoiceId: row.invoice_id,
        invoiceCode: row.workiz_invoice_code,
        serviceDate: this.toIso(row.invoice?.issued_at),
        customerId: row.invoice?.job?.customer_id ?? null,
        customerName: row.invoice?.job?.customer?.full_name ?? null,
        system: row.system_json ?? [],
        systemBucket: row.system_bucket,
        primaryService: row.primary_service_json ?? [],
        serviceDetail: row.service_detail_json ?? [],
        laborCharged: row.labor_charged,
        confidence,
        reviewReasons: row.review_reasons_json ?? [],
        confidenceGuidance: confidenceGuidance(confidence),
        findings: (row.findings_json ?? []).slice(0, 3).map((finding) => ({
          label: finding.label,
          confidence: finding.confidence,
        })),
        components: (row.components ?? []).map((item) => ({
          component: item.canonical_component,
          rawName: item.raw_name,
          workAction: item.work_action,
          confidence: item.confidence,
          warrantyStatus: item.warranty_status,
          warrantyDurationMonths: item.warranty_duration_months,
          warrantyExpiryDate: item.warranty_expiry_date,
        })),
        warranties: (row.warranties ?? []).map((item) => ({
          scope: item.scope,
          component: item.canonical_component,
          warrantyStatus: item.warranty_status,
          durationMonths: item.duration_months,
          expiryDate: item.expiry_date,
          confidence: item.confidence,
        })),
        historicalWarrantyEvidenceOnly: true,
        officialWizFieldWarrantyCertificate: {
          exists: Boolean(officialCertificateId),
          certificateId: officialCertificateId,
        },
      };
    });

    const recordLinks: HomeAiRecordLink[] = [];
    for (const row of accessible) {
      if (row.invoice?.job?.customer_id && row.invoice.job.customer?.full_name) {
        if (!recordLinks.some((link) => link.type === "customer" && link.id === row.invoice?.job?.customer_id)) {
          recordLinks.push({
            type: "customer",
            id: row.invoice.job.customer_id,
            label: row.invoice.job.customer.full_name,
          });
        }
      }
      recordLinks.push({
        type: "invoice",
        id: row.invoice_id,
        label: invoiceDisplayLabel(row.workiz_invoice_code, row.invoice?.job?.customer?.full_name || "Invoice"),
      });
    }

    return {
      ok: true,
      data: {
        source: "service_intelligence_v1",
        financialAmountsIncluded: false,
        customerResolution,
        resolvedCustomerId: resolvedCustomerId ?? null,
        matchCount,
        returnedCount: records.length,
        latest: records[0] ?? null,
        records,
        appliedFilters: {
          serviceDetail: serviceDetail ?? null,
          system: system ?? null,
          primaryService: primaryService ?? null,
          component: component ?? null,
          workAction: workAction ?? null,
          warrantyStatus: warrantyStatus ?? null,
          since: since?.toISOString() ?? null,
          until: until?.toISOString() ?? null,
        },
        guidance: {
          useFor: "Historical service meaning: WETT, cleaning, inspections, component work, and documented warranty evidence.",
          doNotUseFor: "Invoice totals, payments, or balances. Use get_invoices for financial amounts.",
          officialWarranty: "Historical warranty evidence is derived from invoice text. Do not claim an official WizField Warranty Certificate exists unless officialWizFieldWarrantyCertificate.exists is true.",
          unknown: "UNKNOWN classifications must remain UNKNOWN.",
        },
      },
      recordLinks,
    };
  }
}
