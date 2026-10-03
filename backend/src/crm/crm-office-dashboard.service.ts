import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Not, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { LeadEntity } from "../database/entities/lead.entity";
import { MembershipEntity } from "../database/entities/membership.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { QuoteEntity } from "../database/entities/quote.entity";
import { ServiceEntity } from "../database/entities/service.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { getJobStatusLabel, openJobStatuses } from "./constants";
import { endOfLocalDashboardDay, startOfLocalDashboardDay } from "./crm-dashboard-time-window";
import { formatAddress } from "./display";
import { sanitizeJobTitle } from "./user-facing-text";
import { classifyFinanceInvoiceOrigin } from "./finance-invoice-origin";
import { isCollectibleOpenInvoice } from "./finance-metrics.core";
import { FinanceInvoicePresentationService } from "./finance-invoice-presentation.service";
import { InvoicePaymentLedgerService } from "./invoice-payment-ledger.service";
import { TechnicianAssignmentService } from "./technician-assignment.service";

type RelatedValue<T> = T | T[] | null;

type DashboardControlItem = {
  id: string;
  jobId: string | null;
  title: string;
  customerName: string;
  addressLabel: string;
  technicianName: string | null;
  amountCents: number | null;
  scheduledFor: Date | null;
  occurredAt: Date | null;
  statusLabel: string;
};

/**
 * Serialized office dashboard payload (same shapes as legacy CrmController.getDashboard).
 */
export type OfficeDashboardSnapshotPayload = {
  summary: {
    newLeads: number;
    contactedLeads: number;
    activeJobs: number;
    jobsScheduledToday: number;
    unpaidInvoices: number;
  };
  controls: {
    quotesWaitingApproval: DashboardControlItem[];
    unpaidInvoices: DashboardControlItem[];
    followUpsNeeded: DashboardControlItem[];
    todaysScheduledJobs: DashboardControlItem[];
    recentCompletedJobs: DashboardControlItem[];
  };
  leads: LeadEntity[];
  jobs: JobEntity[];
  technicians: TechnicianEntity[];
  services: ServiceEntity[];
};

@Injectable()
export class CrmOfficeDashboardService {
  constructor(
    @InjectRepository(LeadEntity)
    private readonly leadsRepository: Repository<LeadEntity>,
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
    @InjectRepository(QuoteEntity)
    private readonly quotesRepository: Repository<QuoteEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoicesRepository: Repository<InvoiceEntity>,
    @InjectRepository(TechnicianEntity)
    private readonly techniciansRepository: Repository<TechnicianEntity>,
    @InjectRepository(MembershipEntity)
    private readonly membershipsRepository: Repository<MembershipEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profilesRepository: Repository<ProfileEntity>,
    @InjectRepository(ServiceEntity)
    private readonly servicesRepository: Repository<ServiceEntity>,
    private readonly invoicePaymentLedgerService: InvoicePaymentLedgerService,
    private readonly financeInvoicePresentationService: FinanceInvoicePresentationService,
    private readonly technicianAssignmentService: TechnicianAssignmentService,
  ) {}

  private summarizeInvoiceLedger(invoice: InvoiceEntity) {
    return this.invoicePaymentLedgerService.summarizeInvoice({
      totalCents: invoice.total_cents || invoice.amount_cents,
      legacyStatus: invoice.status,
      legacyPaidAt: invoice.paid_at,
      payments: invoice.payments ?? [],
      voidedAt: invoice.voided_at,
      cancelledAt: invoice.cancelled_at,
      financeOrigin: classifyFinanceInvoiceOrigin(invoice),
    });
  }

  private isOpenInvoice(invoice: InvoiceEntity) {
    const ledger = this.summarizeInvoiceLedger(invoice);
    return isCollectibleOpenInvoice(ledger.lifecycleStatus, ledger.balanceCents);
  }

  private invoiceLifecycleStatusLabel(lifecycle: string) {
    switch (lifecycle) {
      case "partial":
        return "Partially paid";
      case "paid":
        return "Paid";
      case "overpaid":
        return "Overpaid";
      case "refunded":
        return "Refunded";
      case "void":
        return "Void";
      case "cancelled":
        return "Cancelled";
      default:
        return "Balance due";
    }
  }

  private relationValue<T>(value: RelatedValue<T> | undefined) {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }

  private buildJobControlItem(job: JobEntity): DashboardControlItem {
    const customer = this.relationValue(job.customer as RelatedValue<CustomerEntity>);
    const technician = this.relationValue(job.technician as RelatedValue<TechnicianEntity>);

    return {
      id: job.id,
      jobId: job.id,
      title: sanitizeJobTitle(job.title, {
        customerName: customer?.full_name,
        serviceType: job.requested_service_type,
      }),
      customerName: customer?.full_name ?? "Customer pending",
      addressLabel: formatAddress(
        job.service_address_line_1,
        job.service_address_line_2,
        job.service_city,
        job.service_state_or_region,
        job.service_postal_code,
      ),
      technicianName: technician?.display_name ?? null,
      amountCents: null,
      scheduledFor: job.scheduled_for,
      occurredAt: job.completed_at ?? job.updated_at,
      statusLabel: getJobStatusLabel(job.status),
    };
  }

  private buildQuoteControlItem(quote: QuoteEntity): DashboardControlItem {
    const job = this.relationValue(quote.job as RelatedValue<JobEntity>);
    const customer = this.relationValue(job?.customer as RelatedValue<CustomerEntity>);
    const technician = this.relationValue(job?.technician as RelatedValue<TechnicianEntity>);

    return {
      id: quote.id,
      jobId: job?.id ?? quote.job_id,
      title: sanitizeJobTitle(job?.title, {
        customerName: customer?.full_name,
        serviceType: job?.requested_service_type,
      }),
      customerName: customer?.full_name ?? "Customer pending",
      addressLabel: job
        ? formatAddress(
            job.service_address_line_1,
            job.service_address_line_2,
            job.service_city,
            job.service_state_or_region,
            job.service_postal_code,
          )
        : "Address unavailable",
      technicianName: technician?.display_name ?? null,
      amountCents: quote.price_cents,
      scheduledFor: job?.scheduled_for ?? null,
      occurredAt: quote.sent_at,
      statusLabel: "Waiting Approval",
    };
  }

  private buildInvoiceControlItem(invoice: InvoiceEntity): DashboardControlItem {
    const job = this.relationValue(invoice.job as RelatedValue<JobEntity>);
    const customer = this.relationValue(job?.customer as RelatedValue<CustomerEntity>);
    const technician = this.relationValue(job?.technician as RelatedValue<TechnicianEntity>);
    const presentation = this.financeInvoicePresentationService.buildListPresentation(invoice);

    return {
      id: invoice.id,
      jobId: job?.id ?? invoice.job_id,
      title: sanitizeJobTitle(job?.title, {
        customerName: customer?.full_name,
        serviceType: job?.requested_service_type,
      }),
      customerName: customer?.full_name ?? "Customer pending",
      addressLabel: job
        ? formatAddress(
            job.service_address_line_1,
            job.service_address_line_2,
            job.service_city,
            job.service_state_or_region,
            job.service_postal_code,
          )
        : "Address unavailable",
      technicianName: technician?.display_name ?? null,
      amountCents: presentation.balance_cents,
      scheduledFor: job?.scheduled_for ?? null,
      occurredAt: invoice.issued_at,
      statusLabel: this.invoiceLifecycleStatusLabel(presentation.lifecycle_status),
    };
  }

  private async countOpenInvoices(organizationId: string) {
    const invoices = await this.invoicesRepository.find({
      where: { organization_id: organizationId },
      relations: { payments: true },
    });

    return invoices.filter((invoice) => this.isOpenInvoice(invoice)).length;
  }

  private async listOpenInvoicesForDashboard(organizationId: string, take: number) {
    const invoices = await this.invoicesRepository.find({
      where: { organization_id: organizationId },
      relations: {
        payments: true,
        job: {
          customer: true,
          technician: true,
        },
      },
      order: {
        issued_at: "ASC",
      },
    });

    return invoices.filter((invoice) => this.isOpenInvoice(invoice)).slice(0, take);
  }

  private async listTechniciansWithV1FallbackForDashboard(organizationId: string) {
    return this.technicianAssignmentService.listTechniciansForOrganization(organizationId, {
      activeOnly: false,
      purpose: "roster",
    });
  }

  async loadOfficeDashboardSnapshot(organizationId: string): Promise<OfficeDashboardSnapshotPayload> {
    const todayStart = startOfLocalDashboardDay();
    const todayEnd = endOfLocalDashboardDay();

    try {
      const [
        newLeadCount,
        contactedLeadCount,
        activeJobCount,
        todayJobCount,
        unpaidInvoiceCount,
        leads,
        jobs,
        technicians,
        services,
        quotesWaitingApproval,
        unpaidInvoices,
        contactedJobs,
        todaysScheduledJobs,
        recentCompletedJobs,
      ] = await Promise.all([
        this.leadsRepository.countBy({ status: "new_lead", organization_id: organizationId }),
        this.leadsRepository.countBy({ status: "contacted", organization_id: organizationId }),
        this.jobsRepository.count({
          where: {
            organization_id: organizationId,
            status: In(openJobStatuses),
          },
        }),
        this.jobsRepository
          .createQueryBuilder("job")
          .where("job.organization_id = :organizationId", { organizationId })
          .andWhere("job.scheduled_for >= :todayStart", { todayStart })
          .andWhere("job.scheduled_for <= :todayEnd", { todayEnd })
          .andWhere("job.status != :status", { status: "cancelled" })
          .getCount(),
        this.countOpenInvoices(organizationId),
        this.leadsRepository.find({
          where: {
            organization_id: organizationId,
            status: Not("converted"),
          },
          order: {
            created_at: "DESC",
          },
          take: 12,
        }),
        this.jobsRepository.find({
          where: {
            organization_id: organizationId,
            status: Not("cancelled"),
          },
          relations: {
            customer: true,
            service: true,
            technician: true,
            quote: true,
            invoice: true,
          },
          order: {
            scheduled_for: "ASC",
            created_at: "DESC",
          },
          take: 60,
        }),
        this.listTechniciansWithV1FallbackForDashboard(organizationId),
        this.servicesRepository.find({
          where: {
            organization_id: organizationId,
            is_active: true,
          },
          order: {
            sort_position: "ASC",
          },
        }),
        this.quotesRepository.find({
          where: {
            organization_id: organizationId,
            status: "sent",
          },
          relations: {
            job: {
              customer: true,
              technician: true,
            },
          },
          order: {
            sent_at: "ASC",
          },
          take: 4,
        }),
        this.listOpenInvoicesForDashboard(organizationId, 4),
        this.jobsRepository.find({
          where: {
            organization_id: organizationId,
            status: "contacted",
          },
          relations: {
            customer: true,
            technician: true,
          },
          order: {
            updated_at: "DESC",
          },
          take: 4,
        }),
        this.jobsRepository
          .createQueryBuilder("job")
          .leftJoinAndSelect("job.customer", "customer")
          .leftJoinAndSelect("job.technician", "technician")
          .where("job.organization_id = :organizationId", { organizationId })
          .andWhere("job.scheduled_for >= :todayStart", { todayStart })
          .andWhere("job.scheduled_for <= :todayEnd", { todayEnd })
          .andWhere("job.status != :cancelledStatus", { cancelledStatus: "cancelled" })
          .orderBy("job.scheduled_for", "ASC")
          .limit(4)
          .getMany(),
        this.jobsRepository.find({
          where: {
            organization_id: organizationId,
            status: In(["completed", "paid"]),
          },
          relations: {
            customer: true,
            technician: true,
          },
          order: {
            completed_at: "DESC",
          },
          take: 4,
        }),
      ]);

      return {
        summary: {
          newLeads: newLeadCount,
          contactedLeads: contactedLeadCount,
          activeJobs: activeJobCount,
          jobsScheduledToday: todayJobCount,
          unpaidInvoices: unpaidInvoiceCount,
        },
        controls: {
          quotesWaitingApproval: quotesWaitingApproval.map((item) => this.buildQuoteControlItem(item)),
          unpaidInvoices: unpaidInvoices.map((item) => this.buildInvoiceControlItem(item)),
          followUpsNeeded: contactedJobs.map((item) => this.buildJobControlItem(item)),
          todaysScheduledJobs: todaysScheduledJobs.map((item) => this.buildJobControlItem(item)),
          recentCompletedJobs: recentCompletedJobs.map((item) => this.buildJobControlItem(item)),
        },
        leads,
        jobs,
        technicians,
        services,
      };
    } catch (error) {
      apiError(
        500,
        "dashboard_load_failed",
        "The office dashboard data could not be loaded.",
        error,
      );
    }
  }
}
