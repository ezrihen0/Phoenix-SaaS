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

const TECHNICIAN_FALLBACK_MEMBERSHIP_ROLES = ["owner", "admin", "office_admin"] as const;
const TECHNICIAN_FALLBACK_ROLE_PRIORITY: Record<(typeof TECHNICIAN_FALLBACK_MEMBERSHIP_ROLES)[number], number> = {
  owner: 0,
  admin: 1,
  office_admin: 2,
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
  ) {}

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
      title: job.title,
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
      title: job?.title ?? "Quote waiting approval",
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

    return {
      id: invoice.id,
      jobId: job?.id ?? invoice.job_id,
      title: job?.title ?? "Invoice awaiting payment",
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
      amountCents: invoice.amount_cents,
      scheduledFor: job?.scheduled_for ?? null,
      occurredAt: invoice.issued_at,
      statusLabel: "Unpaid",
    };
  }

  private async provisionFallbackTechniciansIfNeeded(organizationId: string) {
    const activeTechnicianCount = await this.techniciansRepository.countBy({
      organization_id: organizationId,
      is_active: true,
    });

    if (activeTechnicianCount > 0) {
      return;
    }

    const memberships = await this.membershipsRepository.find({
      where: {
        organization_id: organizationId,
        status: "active",
        role: In([...TECHNICIAN_FALLBACK_MEMBERSHIP_ROLES]),
      },
      relations: {
        user: true,
      },
      order: {
        created_at: "ASC",
      },
    });

    if (memberships.length === 0) {
      return;
    }

    const activeMemberships = memberships.filter((membership) => membership.user?.is_active === true);
    if (activeMemberships.length === 0) {
      return;
    }

    const sortedMemberships = [...activeMemberships].sort((left, right) => {
      const leftPriority = TECHNICIAN_FALLBACK_ROLE_PRIORITY[left.role as keyof typeof TECHNICIAN_FALLBACK_ROLE_PRIORITY] ?? 99;
      const rightPriority = TECHNICIAN_FALLBACK_ROLE_PRIORITY[right.role as keyof typeof TECHNICIAN_FALLBACK_ROLE_PRIORITY] ?? 99;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.created_at.getTime() - right.created_at.getTime();
    });

    const userIds = Array.from(new Set(sortedMemberships.map((membership) => membership.user_id)));
    if (userIds.length === 0) {
      return;
    }

    const [profiles, organizationTechnicians, globalTechnicians] = await Promise.all([
      this.profilesRepository.find({
        where: {
          auth_user_id: In(userIds),
        },
      }),
      this.techniciansRepository.find({
        where: {
          organization_id: organizationId,
          auth_user_id: In(userIds),
        },
      }),
      this.techniciansRepository.find({
        where: {
          auth_user_id: In(userIds),
        },
      }),
    ]);

    const profileByUserId = new Map(profiles.map((profile) => [profile.auth_user_id, profile] as const));
    const organizationTechnicianByUserId = new Map<string, TechnicianEntity>();
    for (const technician of organizationTechnicians) {
      if (technician.auth_user_id) {
        organizationTechnicianByUserId.set(technician.auth_user_id, technician);
      }
    }

    const globalTechnicianByUserId = new Map<string, TechnicianEntity>();
    for (const technician of globalTechnicians) {
      if (technician.auth_user_id) {
        globalTechnicianByUserId.set(technician.auth_user_id, technician);
      }
    }

    for (const membership of sortedMemberships) {
      const existingInOrganization = organizationTechnicianByUserId.get(membership.user_id);
      const profile = profileByUserId.get(membership.user_id);
      const displayName = profile?.full_name?.trim() || membership.user?.email?.trim() || "Staff Member";
      const phone = profile?.phone ?? null;

      if (existingInOrganization) {
        let shouldSave = false;

        if (!existingInOrganization.is_active) {
          existingInOrganization.is_active = true;
          shouldSave = true;
        }

        if (existingInOrganization.display_name !== displayName) {
          existingInOrganization.display_name = displayName;
          shouldSave = true;
        }

        if ((existingInOrganization.phone ?? null) !== phone) {
          existingInOrganization.phone = phone;
          shouldSave = true;
        }

        if (shouldSave) {
          await this.techniciansRepository.save(existingInOrganization);
        }

        continue;
      }

      // auth_user_id is globally unique in technicians; skip cross-org links we cannot safely move in V1 fallback.
      if (globalTechnicianByUserId.has(membership.user_id)) {
        continue;
      }

      const created = await this.techniciansRepository.save(
        this.techniciansRepository.create({
          organization_id: organizationId,
          auth_user_id: membership.user_id,
          display_name: displayName,
          phone,
          specialties: [],
          is_active: true,
        }),
      );
      organizationTechnicianByUserId.set(membership.user_id, created);
      globalTechnicianByUserId.set(membership.user_id, created);
    }
  }

  private async listTechniciansWithV1FallbackForDashboard(organizationId: string) {
    await this.provisionFallbackTechniciansIfNeeded(organizationId);

    return this.techniciansRepository.find({
      where: {
        organization_id: organizationId,
      },
      order: {
        display_name: "ASC",
      },
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
        this.invoicesRepository.countBy({ status: "unpaid", organization_id: organizationId }),
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
        this.invoicesRepository.find({
          where: {
            organization_id: organizationId,
            status: "unpaid",
          },
          relations: {
            job: {
              customer: true,
              technician: true,
            },
          },
          order: {
            issued_at: "ASC",
          },
          take: 4,
        }),
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
