import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import type { Request, Response } from "express";

import {
  actorHasPermission,
  canAccessAssignedJob,
  canAccessEstimateResource,
  canAccessInvoiceResource,
  canAccessJobResource,
  requireActorProfile,
  requirePermission,
  type RoleModePermission,
} from "../auth/permissions";
import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { ActorContext, RequestWithActor } from "../common/request-types";
import {
  canTransitionJobStatus,
  customerLifecycleStatuses,
  getJobStatusTimestampUpdates,
  getServiceTypeLabel,
  isOfficeOnlyJobStatus,
  mapServiceTypeToDefaultJobType,
  openJobStatuses,
  type CustomerLifecycleStatus,
  type InvoiceStatus,
} from "./constants";
import {
  assertCanAccessJob,
  findJobForActor,
  requireJobListPermission,
} from "./jobs-access";
import { JobsService } from "./jobs.service";
import {
  customerImportSourceOptions,
  type CustomerImportDuplicateMatch,
  type CustomerImportField,
  type CustomerImportPreviewResponse,
  type CustomerImportPreviewRow,
  type CustomerImportResult,
  type CustomerImportRowInput,
  type CustomerImportSource,
} from "./customer-import";
import { formatAddress } from "./display";
import {
  type DocumentLineItemInput,
  parseConvertLeadPayload,
  parseCreateCustomerPayload,
  parseCreateJobNotePayload,
  parseCreateJobPayload,
  parseCreateLeadPayload,
  parseJobStatusPayload,
  parseLeadDispositionPayload,
  parseRecordInvoicePaymentPayload,
  parseSignDocumentPayload,
  parseUpdateCustomerPayload,
  parseUpdateJobPayload,
  parseUpdateLeadPayload,
  parseUpsertInvoicePayload,
  parseUpsertQuotePayload,
} from "./validation";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobNoteEntity } from "../database/entities/job-note.entity";
import { JobStatusEventEntity } from "../database/entities/job-status-event.entity";
import { JobEntity } from "../database/entities/job.entity";
import { LeadEntity } from "../database/entities/lead.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { QuoteEntity } from "../database/entities/quote.entity";
import { ServiceEntity } from "../database/entities/service.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { startOfLocalDashboardDay } from "./crm-dashboard-time-window";
import { CrmOfficeDashboardService } from "./crm-office-dashboard.service";
import { CustomerPortalService } from "../customer-portal/customer-portal.service";
import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import { setPdfDownloadResponseHeaders } from "../documents/pdf/pdf-download-response";
import { DocumentPricingService } from "./document-pricing.service";
import { DocumentSnapshotService } from "./document-snapshot.service";
import { EmailService } from "../email/email.service";
import { InvoicePaymentEntity } from "../database/entities/invoice-payment.entity";
import { InvoicePaymentLedgerService } from "./invoice-payment-ledger.service";
import { MembershipEntity } from "../database/entities/membership.entity";
import { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import { TxtService } from "../messaging/txt/txt.service";
import { type InvoicePdfBrandingSnapshot, InvoicePdfService } from "./invoice-pdf.service";

type RelatedValue<T> = T | T[] | null;

type ImportPayload = {
  mode: "preview" | "import";
  confirmImport: boolean;
  rows: CustomerImportRowInput[];
};

type CustomerInsertCandidate = Pick<
  CustomerEntity,
  | "external_client_number"
  | "full_name"
  | "phone"
  | "email"
  | "company_name"
  | "service_address_line_1"
  | "service_address_line_2"
  | "legacy_created_at"
  | "source"
  | "notes"
>;

type PreviewRowAnalysis = CustomerImportPreviewRow & {
  duplicateMatches: CustomerImportDuplicateMatch[];
  insertValue: CustomerInsertCandidate | null;
  normalizedExternalClientNumber: string | null;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  normalizedAddressKey: string | null;
};

type LeadIdentityInput = {
  full_name: string;
  phone: string;
  email: string | null;
  service_address_line_1: string;
  service_address_line_2: string | null;
  service_city: string;
  service_state_or_region: string | null;
  service_postal_code: string;
  source: LeadEntity["source"];
  service_type: LeadEntity["service_type"];
  description: string | null;
};

const TECHNICIAN_FALLBACK_MEMBERSHIP_ROLES = ["owner", "admin", "office_admin"] as const;
const TECHNICIAN_FALLBACK_ROLE_PRIORITY: Record<(typeof TECHNICIAN_FALLBACK_MEMBERSHIP_ROLES)[number], number> = {
  owner: 0,
  admin: 1,
  office_admin: 2,
};
const ORGANIZATION_SETTINGS_KEY = "default";

@UseGuards(SessionGuard, OperationalAccessGuard)
@Controller("api")
export class CrmController {
  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profilesRepository: Repository<ProfileEntity>,
    @InjectRepository(TechnicianEntity)
    private readonly techniciansRepository: Repository<TechnicianEntity>,
    @InjectRepository(ServiceEntity)
    private readonly servicesRepository: Repository<ServiceEntity>,
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
    @InjectRepository(InvoicePaymentEntity)
    private readonly invoicePaymentsRepository: Repository<InvoicePaymentEntity>,
    @InjectRepository(MembershipEntity)
    private readonly membershipsRepository: Repository<MembershipEntity>,
    @InjectRepository(JobNoteEntity)
    private readonly jobNotesRepository: Repository<JobNoteEntity>,
    @InjectRepository(JobStatusEventEntity)
    private readonly jobStatusEventsRepository: Repository<JobStatusEventEntity>,
    @InjectRepository(OrganizationSettingEntity)
    private readonly organizationSettingsRepository: Repository<OrganizationSettingEntity>,
    private readonly documentPricingService: DocumentPricingService,
    private readonly documentSnapshotService: DocumentSnapshotService,
    private readonly invoicePaymentLedgerService: InvoicePaymentLedgerService,
    private readonly crmOfficeDashboardService: CrmOfficeDashboardService,
    private readonly jobsService: JobsService,
    private readonly emailService: EmailService,
    private readonly txtService: TxtService,
    private readonly customerPortalService: CustomerPortalService,
    private readonly documentBrandingSnapshotService: DocumentBrandingSnapshotService,
    private readonly invoicePdfService: InvoicePdfService,
    private readonly configService: ConfigService,
  ) {}

  private requireActor(request: RequestWithActor) {
    return requireActorProfile(request.actor);
  }

  private requireCrmPermissionActor(
    request: RequestWithActor,
    permission: RoleModePermission,
    code = "forbidden",
    message = "This CRM action is not available for the current account.",
  ) {
    return requirePermission(request.actor, permission, code, message);
  }

  private requireActiveOrganizationId(
    actor: ActorContext,
    message = "An active organization is required for this CRM action.",
  ) {
    if (!actor.organization_id) {
      apiError(400, "organization_context_missing", message);
    }

    return actor.organization_id;
  }

  private withOrganizationId<T extends object>(organizationId: string, value: T) {
    return {
      ...value,
      organization_id: organizationId,
    };
  }

  private async requireTechnicianInOrganization(
    technicianId: string | null | undefined,
    organizationId: string,
  ) {
    if (technicianId == null) {
      return;
    }

    const technician = await this.techniciansRepository.findOne({
      where: {
        id: technicianId,
        organization_id: organizationId,
      },
    });

    if (!technician) {
      apiError(404, "technician_not_found", "The technician could not be found.");
    }
  }

  private async requireServiceInOrganization(
    serviceId: string | null | undefined,
    organizationId: string,
  ) {
    if (serviceId == null) {
      return;
    }

    const service = await this.servicesRepository.findOne({
      where: {
        id: serviceId,
        organization_id: organizationId,
      },
    });

    if (!service) {
      apiError(404, "service_not_found", "The service could not be found.");
    }
  }

  private async searchCustomersInOrganization(rawQuery: string, organizationId: string) {
    const query = rawQuery.trim().toLowerCase();

    if (query.length < 2) {
      return [] as Array<{ id: string; full_name: string; phone: string; email: string | null }>;
    }

    const rows = await this.customersRepository.createQueryBuilder("customer")
      .select(["customer.id", "customer.full_name", "customer.phone", "customer.email"])
      .where("customer.organization_id = :organizationId", { organizationId })
      .andWhere(
        "(LOWER(customer.full_name) LIKE :query OR LOWER(COALESCE(customer.email, '')) LIKE :query OR LOWER(customer.phone) LIKE :query)",
        { query: `%${query}%` },
      )
      .orderBy("customer.updated_at", "DESC")
      .take(20)
      .getMany();

    return rows.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      phone: row.phone,
      email: row.email,
    }));
  }

  private requireTechnicianActor(request: RequestWithActor) {
    const actor = this.requireActor(request);

    if (!actorHasPermission(actor, "jobs.assigned.view") || !actor.technician) {
      apiError(
        403,
        "technician_required",
        "This endpoint is only available to technicians.",
      );
    }

    return actor as ActorContext & {
      profile: ProfileEntity;
      technician: TechnicianEntity;
    };
  }

  private relationValue<T>(value: RelatedValue<T> | undefined) {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }

  private async loadJobDetail(jobId: string, organizationId: string) {
    const job = await this.jobsRepository.findOne({
      where: {
        id: jobId,
        organization_id: organizationId,
      },
      relations: {
        customer: true,
        service: true,
        technician: true,
        quote: true,
        invoice: {
          payments: true,
        },
        notes: {
          author_profile: true,
        },
        status_events: true,
      },
    });

    if (!job) {
      return null;
    }

    if (job.notes) {
      job.notes = [...job.notes].sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
      );
    }

    if (job.status_events) {
      job.status_events = [...job.status_events].sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      );
    }

    const quote = this.relationValue(job.quote as RelatedValue<QuoteEntity>);

    if (quote) {
      Object.assign(quote, {
        subtotal_cents: quote.subtotal_cents || quote.price_cents,
        tax_cents: quote.tax_cents ?? 0,
        total_cents: quote.total_cents || quote.price_cents,
      });
    }

    const invoice = this.relationValue(job.invoice as RelatedValue<InvoiceEntity>);

    if (invoice) {
      const ledgerSummary = this.summarizeInvoiceLedger(invoice);

      Object.assign(invoice, {
        subtotal_cents: invoice.subtotal_cents || invoice.amount_cents,
        tax_cents: invoice.tax_cents ?? 0,
        total_cents: invoice.total_cents || ledgerSummary.totalCents,
        amount_paid_cents: ledgerSummary.netPaidCents,
        refunded_cents: ledgerSummary.refundedCents,
        balance_cents: ledgerSummary.balanceCents,
        lifecycle_status: ledgerSummary.lifecycleStatus,
      });

      delete (invoice as InvoiceEntity & { payments?: InvoicePaymentEntity[] }).payments;
    }

    return job;
  }

  private buildJobNoteResponse(note: JobNoteEntity & { author_profile?: ProfileEntity | null }) {
    return {
      id: note.id,
      job_id: note.job_id,
      author_profile_id: note.author_profile_id,
      author_name: note.author_profile?.full_name?.trim() || null,
      findings: note.findings,
      recommendations: note.recommendations,
      photo_urls: note.photo_urls,
      created_at: note.created_at.toISOString(),
      updated_at: note.updated_at.toISOString(),
    };
  }

  private buildJobDetailResponse(job: JobEntity) {
    return {
      ...job,
      notes: (job.notes ?? []).map((note) => this.buildJobNoteResponse(note)),
    };
  }

  @Get("dashboard")
  async getDashboard(@Req() request: RequestWithActor) {
    const actor = this.requireCrmPermissionActor(
      request,
      "dashboard.office.view",
      "dashboard_view_forbidden",
      "This account cannot view the office dashboard.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    const snapshot = await this.crmOfficeDashboardService.loadOfficeDashboardSnapshot(organizationId);
    return apiSuccess(snapshot);
  }

  @Get("technician/dashboard")
  async getTechnicianDashboard(@Req() request: RequestWithActor) {
    const actor = this.requireTechnicianActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const todayStart = startOfLocalDashboardDay();

      const [openCount, inProgressCount, waitingApprovalCount, completedTodayCount, jobs] = await Promise.all([
        this.jobsRepository.count({
          where: {
            organization_id: organizationId,
            assigned_technician_id: actor.technician.id,
            status: In(openJobStatuses),
          },
        }),
        this.jobsRepository.count({
          where: {
            organization_id: organizationId,
            assigned_technician_id: actor.technician.id,
            status: "in_progress",
          },
        }),
        this.jobsRepository.count({
          where: {
            organization_id: organizationId,
            assigned_technician_id: actor.technician.id,
            status: "waiting_for_approval",
          },
        }),
        this.jobsRepository
          .createQueryBuilder("job")
          .where("job.organization_id = :organizationId", { organizationId })
          .andWhere("job.assigned_technician_id = :technicianId", {
            technicianId: actor.technician.id,
          })
          .andWhere("job.status = :status", { status: "completed" })
          .andWhere("job.completed_at >= :todayStart", { todayStart })
          .getCount(),
        this.jobsService.listJobs(actor, organizationId, {
          excludeCancelled: true,
        }),
      ]);

      return apiSuccess({
        technician: {
          id: actor.technician.id,
          displayName: actor.technician.display_name,
          phone: actor.technician.phone,
          specialties: actor.technician.specialties,
          lastSeenAt: actor.technician.last_seen_at,
          fullName: actor.profile.full_name,
        },
        summary: {
          openJobs: openCount,
          inProgressJobs: inProgressCount,
          waitingForApprovalJobs: waitingApprovalCount,
          completedToday: completedTodayCount,
        },
        jobs,
      });
    } catch (error) {
      apiError(
        500,
        "technician_dashboard_load_failed",
        "The technician dashboard could not be loaded.",
        error,
      );
    }
  }

  @Get("jobs")
  async listJobs(
    @Req() request: RequestWithActor,
    @Query("status") status?: string,
    @Query("technicianId") technicianId?: string,
  ) {
    const actor = this.requireActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      requireJobListPermission(
        actor,
        "job_list_forbidden",
        "This account cannot view the job board.",
      );

      if (technicianId) {
        await this.requireTechnicianInOrganization(technicianId, organizationId);
      }

      const jobs = await this.jobsService.listJobs(actor, organizationId, {
        status,
        technicianId,
      });

      return apiSuccess(jobs);
    } catch (error) {
      apiError(500, "job_list_failed", "The job board could not be loaded.", error);
    }
  }

  @Post("jobs")
  async createJob(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = this.requireCrmPermissionActor(
      request,
      "jobs.create",
      "job_create_forbidden",
      "This account cannot create jobs.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseCreateJobPayload(body);
      let customerId = payload.customerId;
      let customerLabel = "Customer";
      let leadSource: JobEntity["lead_source"] = "website";
      let requestTimestamp = new Date();
      let leadToConvert: LeadEntity | null = null;
      let leadCustomer: CustomerEntity | null = null;

      if (payload.leadId) {
        const lead = await this.leadsRepository.findOne({
          where: {
            id: payload.leadId,
            organization_id: organizationId,
          },
        });

        if (!lead) {
          apiError(404, "lead_not_found", "The lead could not be found.");
        }

        if (lead.converted_job_id || lead.status === "converted") {
          apiError(400, "lead_already_converted", "This lead has already been converted into a job.");
        }

        if (lead.disposition === "not_booked") {
          apiError(400, "lead_not_booked", "This lead was marked not booked and cannot be converted.");
        }

        const customerResolution = await this.resolveCustomerForLead(organizationId, lead);
        customerId = customerResolution.customer.id;
        customerLabel = customerResolution.customer.full_name;
        leadSource = lead.source;
        requestTimestamp = lead.created_at;
        leadToConvert = lead;
        leadCustomer = customerResolution.customer;
      } else if (customerId) {
        const customer = await this.customersRepository.findOne({
          where: {
            id: customerId,
            organization_id: organizationId,
          },
        });

        if (!customer) {
          apiError(404, "customer_not_found", "The customer could not be found.");
        }

        customerLabel = customer.full_name;
        leadSource = customer.source ?? "website";
      }

      if (!customerId) {
        apiError(400, "job_source_missing", "A customer or lead is required to create a job.");
      }

      await this.requireTechnicianInOrganization(payload.assignedTechnicianId, organizationId);
      await this.requireServiceInOrganization(payload.serviceId, organizationId);

      let jobTitle = `${getServiceTypeLabel(payload.serviceType)} for ${customerLabel}`;

      if (payload.serviceId) {
        const service = await this.servicesRepository.findOne({
          where: {
            id: payload.serviceId,
            organization_id: organizationId,
          },
        });

        if (service) {
          jobTitle = `${service.name} for ${customerLabel}`;
        }
      }

      const job = await this.jobsRepository.save(
        this.jobsRepository.create({
          organization_id: organizationId,
          customer_id: customerId,
          service_id: payload.serviceId,
          assigned_technician_id: payload.assignedTechnicianId,
          title: jobTitle,
          description: payload.customerConcern,
          lead_source: leadSource,
          requested_service_type: payload.serviceType,
          job_type: payload.jobType,
          status: "scheduled",
          service_address_line_1: payload.serviceAddressLine1,
          service_address_line_2: payload.serviceAddressLine2,
          service_city: payload.serviceCity,
          service_state_or_region: payload.serviceStateOrRegion,
          service_postal_code: payload.servicePostalCode,
          scheduled_for: payload.scheduledFor ? new Date(payload.scheduledFor) : null,
          scheduled_window: payload.scheduledWindow,
          requested_at: requestTimestamp,
          created_by_auth_user_id: actor.user.id,
          updated_by_auth_user_id: actor.user.id,
        }),
      );

      if (leadToConvert && leadCustomer) {
        if (this.deriveCustomerLifecycleStatus(leadCustomer) !== "active") {
          await this.customersRepository.update(
            {
              id: leadCustomer.id,
              organization_id: organizationId,
            },
            {
              lifecycle_status: "active",
            },
          );
        }

        leadToConvert.customer_id = leadCustomer.id;
        leadToConvert.status = "converted";
        leadToConvert.converted_job_id = job.id;
        await this.leadsRepository.save(leadToConvert);
      }

      const statusEventNoteParts = [
        leadToConvert
          ? payload.scheduledFor
            ? "Lead converted to scheduled job."
            : "Lead converted to unscheduled job."
          : payload.scheduledFor
            ? "Job created from customer record."
            : "Unscheduled job created from customer record.",
      ];

      if (payload.internalNotes?.trim()) {
        statusEventNoteParts.push(`Internal: ${payload.internalNotes.trim()}`);
      }

      await this.jobStatusEventsRepository.save(
        this.jobStatusEventsRepository.create({
          organization_id: organizationId,
          job_id: job.id,
          author_profile_id: actor.profile.id,
          status: "scheduled",
          note: statusEventNoteParts.join(" "),
        }),
      );

      const detail = await this.loadJobDetail(job.id, organizationId);

      return apiSuccess({ job: detail ? this.buildJobDetailResponse(detail) : job });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      apiError(400, "invalid_job_payload", "The job payload is invalid.", error);
    }
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

    const [profiles, organizationTechnicians] = await Promise.all([
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
    ]);

    const profileByUserId = new Map(profiles.map((profile) => [profile.auth_user_id, profile] as const));
    const organizationTechnicianByUserId = new Map<string, TechnicianEntity>();
    for (const technician of organizationTechnicians) {
      if (technician.auth_user_id) {
        organizationTechnicianByUserId.set(technician.auth_user_id, technician);
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
    }
  }

  private async listTechniciansWithV1Fallback(organizationId: string, activeOnly: boolean) {
    await this.provisionFallbackTechniciansIfNeeded(organizationId);

    return this.techniciansRepository.find({
      where: activeOnly
        ? { organization_id: organizationId, is_active: true }
        : { organization_id: organizationId },
      order: {
        display_name: "ASC",
      },
    });
  }

  @Get("jobs/:jobId")
  async getJob(
    @Req() request: RequestWithActor,
    @Param("jobId") jobId: string,
  ) {
    const actor = this.requireActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const job = await this.loadJobDetail(jobId, organizationId);

      if (!job) {
        apiError(404, "job_not_found", "The job could not be found.");
      }

      assertCanAccessJob(actor, job.assigned_technician_id);

      return apiSuccess(this.buildJobDetailResponse(job));
    } catch (error) {
      apiError(400, "job_lookup_failed", "The job could not be loaded.", error);
    }
  }

  @Patch("jobs/:jobId")
  async updateJob(
    @Req() request: RequestWithActor,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
  ) {
    const actor = this.requireCrmPermissionActor(
      request,
      "jobs.update",
      "job_update_forbidden",
      "This account cannot update jobs.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseUpdateJobPayload(body);
      const job = await this.jobsRepository.findOne({
        where: {
          id: jobId,
          organization_id: organizationId,
        },
      });

      if (!job) {
        apiError(404, "job_not_found", "The job could not be found.");
      }

      const updates: Partial<JobEntity> = {
        updated_by_auth_user_id: actor.user.id,
      };

      if (payload.title !== undefined) {
        updates.title = payload.title;
      }

      if (payload.description !== undefined) {
        updates.description = payload.description;
      }

      if (payload.assignedTechnicianId !== undefined) {
        await this.requireTechnicianInOrganization(payload.assignedTechnicianId, organizationId);
        updates.assigned_technician_id = payload.assignedTechnicianId;
      }

      if (payload.serviceId !== undefined) {
        await this.requireServiceInOrganization(payload.serviceId, organizationId);
        updates.service_id = payload.serviceId;
      }

      if (payload.scheduledFor !== undefined) {
        updates.scheduled_for = payload.scheduledFor ? new Date(payload.scheduledFor) : null;
      }

      if (payload.scheduledWindow !== undefined) {
        updates.scheduled_window = payload.scheduledWindow;
      }

      if (payload.jobType !== undefined) {
        updates.job_type = payload.jobType;
      }

      await this.jobsRepository.update({ id: jobId, organization_id: organizationId }, updates);
      const detail = await this.loadJobDetail(jobId, organizationId);

      return apiSuccess(detail ? this.buildJobDetailResponse(detail) : null);
    } catch (error) {
      apiError(400, "invalid_job_update_payload", "The job update payload is invalid.", error);
    }
  }

  @Post("jobs/:jobId/status")
  async updateJobStatus(
    @Req() request: RequestWithActor,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
  ) {
    const actor = this.requireActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseJobStatusPayload(body);
      const job = await findJobForActor(
        this.jobsRepository,
        jobId,
        organizationId,
        actor,
        {},
      );

      if (
        !actorHasPermission(actor, "jobs.status.update")
        && !(
          actorHasPermission(actor, "jobs.assigned.status.update")
          && canAccessAssignedJob(actor, job.assigned_technician_id)
        )
      ) {
        apiError(403, "job_status_forbidden", "This account cannot update job status.");
      }

      if (
        !actorHasPermission(actor, "jobs.update")
        && isOfficeOnlyJobStatus(payload.status)
      ) {
        apiError(
          403,
          "office_only_job_status",
          "Only office staff can set this CRM job status.",
        );
      }

      if (!canTransitionJobStatus(job.status, payload.status)) {
        apiError(
          400,
          "invalid_job_status_transition",
          "This job cannot move to the requested status from its current state.",
        );
      }

      const timestamp = new Date();
      const paidAtTimestamp = this.formatSqlTimestamp(timestamp);
      const cancellationReason = payload.note?.trim() ?? null;

      if (payload.status === "cancelled" && !cancellationReason) {
        apiError(
          400,
          "job_cancellation_reason_required",
          "Provide a cancellation reason before cancelling this job.",
        );
      }

      const statusTimestampUpdates = getJobStatusTimestampUpdates(payload.status, timestamp);

      await this.jobsRepository.update(
        { id: jobId, organization_id: organizationId },
        {
          status: payload.status,
          updated_by_auth_user_id: actor.user.id,
          ...(payload.status === "cancelled"
            ? {
              cancellation_reason: cancellationReason,
              cancelled_at: timestamp,
              cancelled_by: actor.user.id,
            }
            : {}),
          ...statusTimestampUpdates,
        },
      );

      await this.jobStatusEventsRepository.save(
        this.jobStatusEventsRepository.create(this.withOrganizationId(organizationId, {
          job_id: jobId,
          author_profile_id: actor.profile?.id ?? null,
          status: payload.status,
          note: payload.status === "cancelled" ? cancellationReason : payload.note,
        })),
      );

      if (payload.status === "paid") {
        await this.invoicesRepository.update(
          {
            job_id: jobId,
            organization_id: organizationId,
          },
          {
            status: "paid",
            paid_at: paidAtTimestamp as unknown as Date,
          },
        );
      }

      const detail = await this.loadJobDetail(jobId, organizationId);

      return apiSuccess(detail ? this.buildJobDetailResponse(detail) : null);
    } catch (error) {
      apiError(400, "invalid_job_status_payload", "The job status payload is invalid.", error);
    }
  }

  @Put("jobs/:jobId/quote")
  async upsertQuote(
    @Req() request: RequestWithActor,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
  ) {
    const actor = this.requireCrmPermissionActor(
      request,
      "estimates.manage",
      "estimate_manage_forbidden",
      "This account cannot change estimates.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseUpsertQuotePayload(body);
      const job = await this.jobsRepository.findOne({
        where: {
          id: jobId,
          organization_id: organizationId,
        },
      });

      if (!job) {
        apiError(404, "job_not_found", "The job could not be found.");
      }

      const existingQuote = await this.quotesRepository.findOne({
        where: {
          job_id: jobId,
          organization_id: organizationId,
        },
      });

      if (existingQuote && this.isDocumentLocked(existingQuote.approved_at, existingQuote.signed_at)) {
        this.throwDocumentLockedError("estimate");
      }

      const hasSnapshotLineItems = payload.lineItems !== undefined;
      const quoteLineDrafts = hasSnapshotLineItems
        ? await this.buildDocumentLineDrafts(
            payload.lineItems ?? [],
            organizationId,
            "quote",
            existingQuote?.id ?? null,
          )
        : [];
      const quoteTotals = hasSnapshotLineItems
        ? this.documentPricingService.computeSnapshotTotals(
            quoteLineDrafts.map((lineDraft) => ({
              quantity: lineDraft.quantity,
              unitPriceCents: lineDraft.unit_price_cents_snapshot,
            })),
            payload.taxRateBps ?? 0,
          )
        : this.documentPricingService.buildLegacyTotals(payload.priceCents);

      const timestamp = new Date();
      const sent_at = payload.status === "draft"
        ? null
        : existingQuote?.sent_at ?? timestamp;
      const approved_at = payload.status === "approved"
        ? existingQuote?.approved_at ?? timestamp
        : null;

      if (existingQuote) {
        existingQuote.description = payload.description;
        existingQuote.price_cents = quoteTotals.totalCents;
        existingQuote.subtotal_cents = quoteTotals.subtotalCents;
        existingQuote.tax_rate_bps_snapshot = quoteTotals.taxRateBpsSnapshot;
        existingQuote.tax_cents = quoteTotals.taxCents;
        existingQuote.total_cents = quoteTotals.totalCents;
        existingQuote.status = payload.status;
        existingQuote.sent_at = sent_at;
        existingQuote.approved_at = approved_at;

        const result = await this.quotesRepository.save(existingQuote);
        await this.documentSnapshotService.replaceQuoteLineItems(
          result.id,
          hasSnapshotLineItems ? quoteLineDrafts : [],
        );
        return apiSuccess(result);
      }

      const result = await this.quotesRepository.save(
        this.quotesRepository.create(this.withOrganizationId(organizationId, {
          job_id: jobId,
          description: payload.description,
          price_cents: quoteTotals.totalCents,
          subtotal_cents: quoteTotals.subtotalCents,
          tax_rate_bps_snapshot: quoteTotals.taxRateBpsSnapshot,
          tax_cents: quoteTotals.taxCents,
          total_cents: quoteTotals.totalCents,
          status: payload.status,
          sent_at,
          approved_at,
        })),
      );

      await this.documentSnapshotService.replaceQuoteLineItems(
        result.id,
        hasSnapshotLineItems ? quoteLineDrafts : [],
      );

      return apiSuccess(result);
    } catch (error) {
      this.rethrowHttpException(error);
      apiError(400, "invalid_quote_payload", "The quote payload is invalid.", error);
    }
  }

  private buildInvoiceDocumentNumber(invoice: InvoiceEntity) {
    return `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
  }

  private buildEstimateDocumentNumber(quote: QuoteEntity) {
    return `EST-${quote.id.slice(0, 8).toUpperCase()}`;
  }

  private toIsoString(value: Date | null | undefined) {
    return value ? value.toISOString() : null;
  }

  private summarizeInvoiceLedger(invoice: InvoiceEntity) {
    return this.invoicePaymentLedgerService.summarizeInvoice({
      totalCents: invoice.total_cents || invoice.amount_cents,
      legacyStatus: invoice.status,
      legacyPaidAt: invoice.paid_at,
      payments: invoice.payments ?? [],
    });
  }

  private isDocumentLocked(approvedAt: Date | null, signedAt: Date | null) {
    return Boolean(approvedAt || signedAt);
  }

  private throwDocumentLockedError(documentKind: "invoice" | "estimate") {
    apiError(
      409,
      `${documentKind}_document_locked`,
      `This ${documentKind} is locked because it has already been approved or signed. Use a future revision, void, or duplicate flow to change customer-facing financial content.`,
    );
  }

  private rethrowHttpException(error: unknown) {
    if (error instanceof HttpException) {
      throw error;
    }
  }

  private buildInvoicePaymentResponse(invoice: InvoiceEntity) {
    return (invoice.payments ?? [])
      .slice()
      .sort((left, right) => right.occurred_at.getTime() - left.occurred_at.getTime())
      .map((payment) => ({
        id: payment.id,
        invoice_id: payment.invoice_id,
        entry_type: payment.entry_type,
        amount_cents: payment.amount_cents,
        method: payment.method,
        reference: payment.reference,
        note: payment.note,
        occurred_at: payment.occurred_at.toISOString(),
        created_by_auth_user_id: payment.created_by_auth_user_id,
        created_at: payment.created_at.toISOString(),
        updated_at: payment.updated_at.toISOString(),
      }));
  }

  private deriveLegacyInvoiceStatusFromLedger(invoice: InvoiceEntity) {
    const ledgerSummary = this.summarizeInvoiceLedger(invoice);

    return {
      status:
        ledgerSummary.lifecycleStatus === "paid" || ledgerSummary.lifecycleStatus === "overpaid"
          ? ("paid" as InvoiceStatus)
          : ("unpaid" as InvoiceStatus),
      paidAt:
        ledgerSummary.lifecycleStatus === "paid" || ledgerSummary.lifecycleStatus === "overpaid"
          ? ledgerSummary.paidAt
          : null,
    };
  }

  private async syncInvoiceJobPaymentState(
    invoice: InvoiceEntity,
    job: JobEntity,
    actor: ActorContext & { profile: ProfileEntity },
  ) {
    const organizationId = this.requireActiveOrganizationId(actor);
    const legacyState = this.deriveLegacyInvoiceStatusFromLedger(invoice);

    if (invoice.status !== legacyState.status || this.toIsoString(invoice.paid_at) !== this.toIsoString(legacyState.paidAt)) {
      invoice.status = legacyState.status;
      invoice.paid_at = legacyState.paidAt;
      await this.invoicesRepository.save(invoice);
    }

    if (legacyState.status === "paid" && job.status !== "paid" && canTransitionJobStatus(job.status, "paid")) {
      await this.jobsRepository.update(
        {
          id: job.id,
          organization_id: organizationId,
        },
        {
          status: "paid",
          paid_at: legacyState.paidAt,
          updated_by_auth_user_id: actor.user.id,
        },
      );

      await this.jobStatusEventsRepository.save(
        this.jobStatusEventsRepository.create({
          organization_id: organizationId,
          job_id: job.id,
          author_profile_id: actor.profile.id,
          status: "paid",
          note: "Invoice marked paid from payment ledger.",
        }),
      );
    }

    if (legacyState.status === "unpaid" && job.status === "paid") {
      await this.jobsRepository.update(
        {
          id: job.id,
          organization_id: organizationId,
        },
        {
          status: "completed",
          paid_at: null,
          updated_by_auth_user_id: actor.user.id,
        },
      );

      await this.jobStatusEventsRepository.save(
        this.jobStatusEventsRepository.create({
          organization_id: organizationId,
          job_id: job.id,
          author_profile_id: actor.profile.id,
          status: "completed",
          note: "Invoice payment ledger no longer indicates paid in full.",
        }),
      );
    }
  }

  private buildInvoiceListItem(invoice: InvoiceEntity) {
    const job = this.relationValue(invoice.job as RelatedValue<JobEntity>);
    const customer = this.relationValue(job?.customer as RelatedValue<CustomerEntity>);
    const ledgerSummary = this.summarizeInvoiceLedger(invoice);

    return {
      id: invoice.id,
      job_id: invoice.job_id,
      document_number: this.buildInvoiceDocumentNumber(invoice),
      total_cents: ledgerSummary.totalCents,
      amount_paid_cents: ledgerSummary.netPaidCents,
      refunded_cents: ledgerSummary.refundedCents,
      balance_cents: ledgerSummary.balanceCents,
      lifecycle_status: ledgerSummary.lifecycleStatus,
      status: invoice.status,
      issued_at: invoice.issued_at?.toISOString() ?? invoice.created_at.toISOString(),
      customer_name: customer?.full_name ?? "Customer pending",
      job_title: job?.title ?? "Job",
    };
  }

  private buildInvoiceLineItemResponse(invoice: InvoiceEntity) {
    return (invoice.line_items ?? []).map((lineItem) => ({
      id: lineItem.id,
      invoice_id: lineItem.invoice_id,
      pricebook_item_id: lineItem.pricebook_item_id,
      sku_snapshot: lineItem.sku_snapshot,
      document_line_key: lineItem.document_line_key,
      name_snapshot: lineItem.name_snapshot,
      description_snapshot: lineItem.description_snapshot,
      item_type_snapshot: lineItem.item_type_snapshot,
      unit_of_measure_snapshot: lineItem.unit_of_measure_snapshot,
      unit_price_cents_snapshot: lineItem.unit_price_cents_snapshot,
      base_cost_cents_snapshot: lineItem.base_cost_cents_snapshot,
      material_cost_cents_snapshot: lineItem.material_cost_cents_snapshot,
      labor_cost_cents_snapshot: lineItem.labor_cost_cents_snapshot,
      estimated_labor_minutes_snapshot: lineItem.estimated_labor_minutes_snapshot,
      warranty_months_snapshot: lineItem.warranty_months_snapshot,
      quantity: lineItem.quantity,
      line_subtotal_cents: lineItem.line_subtotal_cents,
      sort_order: lineItem.sort_order,
      created_at: lineItem.created_at.toISOString(),
      updated_at: lineItem.updated_at.toISOString(),
    }));
  }

  private buildQuoteLineItemResponse(quote: QuoteEntity) {
    return (quote.line_items ?? []).map((lineItem) => ({
      id: lineItem.id,
      quote_id: lineItem.quote_id,
      pricebook_item_id: lineItem.pricebook_item_id,
      sku_snapshot: lineItem.sku_snapshot,
      document_line_key: lineItem.document_line_key,
      name_snapshot: lineItem.name_snapshot,
      description_snapshot: lineItem.description_snapshot,
      item_type_snapshot: lineItem.item_type_snapshot,
      unit_of_measure_snapshot: lineItem.unit_of_measure_snapshot,
      unit_price_cents_snapshot: lineItem.unit_price_cents_snapshot,
      base_cost_cents_snapshot: lineItem.base_cost_cents_snapshot,
      material_cost_cents_snapshot: lineItem.material_cost_cents_snapshot,
      labor_cost_cents_snapshot: lineItem.labor_cost_cents_snapshot,
      estimated_labor_minutes_snapshot: lineItem.estimated_labor_minutes_snapshot,
      warranty_months_snapshot: lineItem.warranty_months_snapshot,
      quantity: lineItem.quantity,
      line_subtotal_cents: lineItem.line_subtotal_cents,
      sort_order: lineItem.sort_order,
      created_at: lineItem.created_at.toISOString(),
      updated_at: lineItem.updated_at.toISOString(),
    }));
  }

  private async buildDocumentLineDrafts(
    lineItems: DocumentLineItemInput[],
    organizationId: string,
    documentKind: "quote" | "invoice",
    documentId: string | null,
  ) {
    return this.documentSnapshotService.buildLineDrafts(lineItems, {
      organizationId,
      documentKind,
      documentId,
    });
  }

  @Get("invoices")
  async listInvoices(
    @Req() request: RequestWithActor,
    @Query("customerId") customerId?: string,
  ) {
    const actor = this.requireActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);

    if (!actorHasPermission(actor, "invoices.view") && !actorHasPermission(actor, "invoices.assigned.view")) {
      apiError(403, "invoice_view_forbidden", "This account cannot view invoices.");
    }

    try {
      const invoices = await this.invoicesRepository.find({
        where: {
          organization_id: organizationId,
        },
        relations: {
          job: {
            customer: true,
          },
          payments: true,
        },
        order: {
          issued_at: "DESC",
          created_at: "DESC",
        },
      });

      const visibleInvoices = invoices.filter((invoice) => {
        const job = this.relationValue(invoice.job as RelatedValue<JobEntity>);

        if (!job) {
          return actorHasPermission(actor, "invoices.view");
        }

        return canAccessInvoiceResource(actor, job.assigned_technician_id);
      });

      const filteredInvoices = customerId
        ? visibleInvoices.filter((invoice) => {
          const job = this.relationValue(invoice.job as RelatedValue<JobEntity>);
          return job?.customer_id === customerId;
        })
        : visibleInvoices;

      return apiSuccess(filteredInvoices.map((invoice) => this.buildInvoiceListItem(invoice)));
    } catch (error) {
      apiError(500, "invoice_list_failed", "The invoice list could not be loaded.", error);
    }
  }

  @Get("invoices/:invoiceId")
  async getInvoice(
    @Req() request: RequestWithActor,
    @Param("invoiceId") invoiceId: string,
  ) {
    const actor = this.requireActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const invoice = await this.invoicesRepository.findOne({
        where: {
          id: invoiceId,
          organization_id: organizationId,
        },
        relations: {
          job: {
            customer: true,
          },
          line_items: true,
          payments: true,
        },
      });

      if (!invoice) {
        apiError(404, "invoice_not_found", "The invoice could not be found.");
      }

      const job = this.relationValue(invoice.job as RelatedValue<JobEntity>);

      if (!canAccessInvoiceResource(actor, job?.assigned_technician_id)) {
        apiError(403, "invoice_access_denied", "You do not have access to this invoice.");
      }

      const customer = this.relationValue(job?.customer as RelatedValue<CustomerEntity>);
      const listItem = this.buildInvoiceListItem(invoice);
      const ledgerSummary = this.summarizeInvoiceLedger(invoice);
      const orgSettings = await this.findOrganizationSettings(organizationId);

      return apiSuccess({
        id: listItem.id,
        job_id: listItem.job_id,
        invoice_id: listItem.document_number,
        document_number: listItem.document_number,
        description: invoice.description ?? "",
        amount_cents: invoice.amount_cents,
        subtotal_cents: invoice.subtotal_cents || invoice.amount_cents,
        tax_rate_bps_snapshot: invoice.tax_rate_bps_snapshot,
        tax_cents: invoice.tax_cents,
        total_cents: invoice.total_cents || listItem.total_cents,
        amount_paid_cents: listItem.amount_paid_cents,
        refunded_cents: listItem.refunded_cents,
        balance_cents: listItem.balance_cents,
        lifecycle_status: listItem.lifecycle_status,
        status: listItem.status,
        issued_at: listItem.issued_at,
        due_at: this.toIsoString(invoice.due_at),
        paid_at: this.toIsoString(ledgerSummary.paidAt),
        approval_requested_at: this.toIsoString(invoice.approval_requested_at),
        approved_at: this.toIsoString(invoice.approved_at),
        signature_requested_at: this.toIsoString(invoice.signature_requested_at),
        signature_requested: Boolean(invoice.signature_requested_at),
        signed_at: this.toIsoString(invoice.signed_at),
        signed_by_name: invoice.signed_by_name,
        is_locked: this.isDocumentLocked(invoice.approved_at, invoice.signed_at),
        line_items: this.buildInvoiceLineItemResponse(invoice),
        payments: this.buildInvoicePaymentResponse(invoice),
        customer_name: listItem.customer_name,
        job_title: listItem.job_title,
        job: job
          ? {
            id: job.id,
            title: job.title,
            status: job.status,
            assigned_technician_id: job.assigned_technician_id,
          }
          : null,
        customer: customer
          ? {
            id: customer.id,
            full_name: customer.full_name,
            company_name: customer.company_name,
            email: customer.email,
            phone: customer.phone,
            service_address_line_1: customer.service_address_line_1,
            service_address_line_2: customer.service_address_line_2,
            service_city: customer.service_city,
            service_state_or_region: customer.service_state_or_region,
            service_postal_code: customer.service_postal_code,
            notes: customer.notes,
          }
          : null,
        organization: {
          business_name: this.normalizeOptionalString(orgSettings?.business_name),
          company_email: this.normalizeOptionalString(orgSettings?.company_email),
        },
      });
    } catch (error) {
      apiError(400, "invoice_lookup_failed", "The invoice could not be loaded.", error);
    }
  }

  @Get("invoices/:invoiceId/pdf")
  async invoicePdf(
    @Req() request: RequestWithActor,
    @Param("invoiceId") invoiceId: string,
    @Query("download") download: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = this.requireActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);

    const invoice = await this.invoicesRepository.findOne({
      where: { id: invoiceId, organization_id: organizationId },
      relations: {
        job: { customer: true },
        line_items: true,
        payments: true,
      },
    });

    if (!invoice) {
      apiError(404, "invoice_not_found", "The invoice could not be found.");
    }

    const job = this.relationValue(invoice.job as RelatedValue<JobEntity>);

    if (!canAccessInvoiceResource(actor, job?.assigned_technician_id)) {
      apiError(403, "invoice_access_denied", "You do not have access to this invoice.");
    }

    const customer = this.relationValue(job?.customer as RelatedValue<CustomerEntity>);
    const documentNumber = this.buildInvoiceDocumentNumber(invoice);
    const ledgerSummary = this.summarizeInvoiceLedger(invoice);
    const orgSettings = await this.findOrganizationSettings(organizationId);
    const dueDays = this.readDefaultDueDays(orgSettings);
    const branding = this.parseInvoiceBrandingSnapshot(invoice.branding_snapshot_json)
      ?? this.buildInvoiceBrandingSnapshot(orgSettings);
    const pdfBuffer = this.buildInvoicePdfBuffer({
      invoice,
      customer,
      lifecycleStatus: ledgerSummary.lifecycleStatus,
      totalCents: invoice.total_cents || ledgerSummary.totalCents,
      netPaidCents: ledgerSummary.netPaidCents,
      balanceCents: ledgerSummary.balanceCents,
      branding,
      documentNumber,
      dueDays,
    });
    setPdfDownloadResponseHeaders(response, {
      download,
      filename: `invoice-${documentNumber}.pdf`,
    });
    return new StreamableFile(pdfBuffer);
  }

  @Post("invoices/:invoiceId/send-email")
  async sendInvoiceEmail(
    @Req() request: RequestWithActor,
    @Param("invoiceId") invoiceId: string,
    @Body() sendPayload: unknown,
  ) {
    const actor = this.requireActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);

    const payload = this.parseSendEmailPayload(sendPayload);

    const invoice = await this.invoicesRepository.findOne({
      where: { id: invoiceId, organization_id: organizationId },
      relations: {
        job: { customer: true },
        line_items: true,
        payments: true,
      },
    });

    if (!invoice) {
      apiError(404, "invoice_not_found", "The invoice could not be found.");
    }

    const job = this.relationValue(invoice.job as RelatedValue<JobEntity>);

    if (!canAccessInvoiceResource(actor, job?.assigned_technician_id)) {
      apiError(403, "invoice_access_denied", "You do not have access to this invoice.");
    }

    const customer = this.relationValue(job?.customer as RelatedValue<CustomerEntity>);
    const toEmail = payload.to?.trim() || customer?.email?.trim();
    if (!toEmail) {
      apiError(400, "invoice_email_missing_recipient", "No recipient email address available. Provide a 'to' address or ensure the customer has an email on file.");
    }

    if (!this.emailService.isConfigured()) {
      apiError(500, "email_not_configured", "Email service is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.");
    }

    const orgSettings = await this.findOrganizationSettings(organizationId);
    const businessName = this.normalizeOptionalString(orgSettings?.business_name);
    const documentNumber = this.buildInvoiceDocumentNumber(invoice);
    const ledgerSummary = this.summarizeInvoiceLedger(invoice);
    const dueDays = this.readDefaultDueDays(orgSettings);
    const dueDateLabel = this.formatDueDate(invoice.due_at, invoice.issued_at, dueDays);

    // Build template variables
    const vars = {
      business_name: businessName ?? "",
      invoice_number: documentNumber,
      customer_name: customer?.full_name ?? "Customer",
      total: `$${((invoice.total_cents || ledgerSummary.totalCents) / 100).toFixed(2)}`,
      due_date: dueDateLabel,
      invoice_link: "",
      business_phone: this.normalizeOptionalString(orgSettings?.phone) ?? "",
      business_email: this.normalizeOptionalString(orgSettings?.company_email) ?? "",
    };

    const subject = this.resolveTemplate(
      payload.subject || orgSettings?.invoice_email_subject || "Invoice {invoice_number} from {business_name}",
      vars,
    );
    const emailBody = this.resolveTemplate(
      payload.body || orgSettings?.invoice_email_body || "Hi {customer_name},\n\nYour invoice {invoice_number} for {total} is ready.\n\nThank you for your business.",
      vars,
    );

    const branding = await this.ensureInvoiceBrandingSnapshot(invoice, organizationId);
    const pdfBuffer = this.buildInvoicePdfBuffer({
      invoice,
      customer,
      lifecycleStatus: ledgerSummary.lifecycleStatus,
      totalCents: invoice.total_cents || ledgerSummary.totalCents,
      netPaidCents: ledgerSummary.netPaidCents,
      balanceCents: ledgerSummary.balanceCents,
      branding,
      documentNumber,
      dueDays,
    });

    const emailResult = await this.emailService.send({
      to: toEmail,
      subject,
      body: emailBody,
      attachments: [{
        filename: `invoice-${documentNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      }],
    });

    const now = new Date();
    invoice.email_sent_at = now;
    invoice.last_sent_at = now;
    invoice.last_sent_via = "email";
    await this.invoicesRepository.save(invoice);

    return apiSuccess({
      invoice_id: documentNumber,
      document_number: documentNumber,
      sent_at: now.toISOString(),
      to: [toEmail],
      message_id: emailResult.messageId,
    });
  }

  @Post("invoices/:invoiceId/send-sms")
  async sendInvoiceSms(
    @Req() request: RequestWithActor,
    @Param("invoiceId") invoiceId: string,
  ) {
    const actor = this.requireActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);

    const invoice = await this.invoicesRepository.findOne({
      where: { id: invoiceId, organization_id: organizationId },
      relations: {
        job: { customer: true },
        line_items: true,
        payments: true,
      },
    });

    if (!invoice) {
      apiError(404, "invoice_not_found", "The invoice could not be found.");
    }

    const job = this.relationValue(invoice.job as RelatedValue<JobEntity>);

    if (!canAccessInvoiceResource(actor, job?.assigned_technician_id)) {
      apiError(403, "invoice_access_denied", "You do not have access to this invoice.");
    }

    const customer = this.relationValue(job?.customer as RelatedValue<CustomerEntity>);
    const customerPhone = customer?.phone?.trim();
    if (!customerPhone) {
      apiError(400, "invoice_sms_missing_phone", "Customer has no phone number on file. Add a phone number to send invoice via SMS.");
    }

    if (!job || !customer) {
      apiError(400, "invoice_sms_missing_job", "Invoice is missing required job or customer data.");
    }

    const orgSettings = await this.findOrganizationSettings(organizationId);
    const businessName = this.normalizeOptionalString(orgSettings?.business_name);
    const documentNumber = this.buildInvoiceDocumentNumber(invoice);
    const totalCents = invoice.total_cents || (invoice.subtotal_cents || invoice.amount_cents);
    const dueDays = this.readDefaultDueDays(orgSettings);
    const dueDateLabel = this.formatDueDate(invoice.due_at, invoice.issued_at, dueDays);

    // Resolve SMS template
    const smsVars = {
      business_name: businessName ?? "your service provider",
      invoice_number: documentNumber,
      customer_name: customer?.full_name ?? "Customer",
      total: `$${(totalCents / 100).toFixed(2)}`,
      due_date: dueDateLabel,
      invoice_link: "", // filled below
      business_phone: this.normalizeOptionalString(orgSettings?.phone) ?? "",
      business_email: this.normalizeOptionalString(orgSettings?.company_email) ?? "",
    };

    // Generate portal magic link for invoice
    const portalLink = await this.customerPortalService.createMagicLinkForStaff({
      organizationId,
      customerId: job.customer_id,
      actorProfileId: actor.profile.id,
      request: request as unknown as Request,
    });

    // Build the invoice portal URL
    const baseUrl = this.configService.get<string>("PUBLIC_BASE_URL") ?? "http://localhost:3000";
    const invoiceLink = `${baseUrl}/access/${portalLink.raw_token}`;
    smsVars.invoice_link = invoiceLink;

    const smsBody = this.resolveTemplate(
      orgSettings?.invoice_sms_body || "Invoice {invoice_number} from {business_name}: {total}. View: {invoice_link}",
      smsVars,
    );

    // Send SMS via TxtService
    // Build a conversation key for this customer
    const conversationId = `customer:${customer.id}`;

    await this.txtService.sendMessage({
      conversationId,
      body: smsBody,
      sentByUserId: actor.user.id,
      organizationIdForCustomerScope: organizationId,
    });

    const now = new Date();
    if (!invoice.branding_snapshot_json) {
      invoice.branding_snapshot_json = JSON.stringify(this.buildInvoiceBrandingSnapshot(orgSettings));
    }
    invoice.sms_sent_at = now;
    invoice.last_sent_at = now;
    invoice.last_sent_via = "sms";
    await this.invoicesRepository.save(invoice);

    return apiSuccess({
      invoice_id: documentNumber,
      document_number: documentNumber,
      sent_at: now.toISOString(),
      to: [customerPhone],
      portal_link: invoiceLink,
    });
  }

  @Post("invoices/:invoiceId/request-approval")
  async requestInvoiceApproval(
    @Req() request: RequestWithActor,
    @Param("invoiceId") invoiceId: string,
  ) {
    const actor = this.requireCrmPermissionActor(request, "invoices.manage", "invoice_manage_forbidden", "This account cannot change invoices.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const invoice = await this.invoicesRepository.findOne({
        where: {
          id: invoiceId,
          organization_id: organizationId,
        },
      });

      if (!invoice) {
        apiError(404, "invoice_not_found", "The invoice could not be found.");
      }

      invoice.approval_requested_at = invoice.approval_requested_at ?? new Date();
      await this.invoicesRepository.save(invoice);

      return apiSuccess({ ok: true });
    } catch (error) {
      this.rethrowHttpException(error);
      apiError(400, "invoice_request_approval_failed", "The invoice approval request could not be saved.", error);
    }
  }

  @Post("invoices/:invoiceId/approve")
  async approveInvoice(
    @Req() request: RequestWithActor,
    @Param("invoiceId") invoiceId: string,
  ) {
    const actor = this.requireCrmPermissionActor(request, "invoices.manage", "invoice_manage_forbidden", "This account cannot change invoices.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const invoice = await this.invoicesRepository.findOne({
        where: {
          id: invoiceId,
          organization_id: organizationId,
        },
      });

      if (!invoice) {
        apiError(404, "invoice_not_found", "The invoice could not be found.");
      }

      const timestamp = new Date();
      invoice.approval_requested_at = invoice.approval_requested_at ?? timestamp;
      invoice.approved_at = invoice.approved_at ?? timestamp;
      await this.invoicesRepository.save(invoice);

      return apiSuccess({ ok: true });
    } catch (error) {
      this.rethrowHttpException(error);
      apiError(400, "invoice_approve_failed", "The invoice could not be approved.", error);
    }
  }

  @Post("invoices/:invoiceId/request-signature")
  async requestInvoiceSignature(
    @Req() request: RequestWithActor,
    @Param("invoiceId") invoiceId: string,
  ) {
    const actor = this.requireCrmPermissionActor(request, "invoices.manage", "invoice_manage_forbidden", "This account cannot change invoices.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const invoice = await this.invoicesRepository.findOne({
        where: {
          id: invoiceId,
          organization_id: organizationId,
        },
      });

      if (!invoice) {
        apiError(404, "invoice_not_found", "The invoice could not be found.");
      }

      invoice.signature_requested_at = invoice.signature_requested_at ?? new Date();
      await this.invoicesRepository.save(invoice);

      return apiSuccess({ ok: true });
    } catch (error) {
      this.rethrowHttpException(error);
      apiError(400, "invoice_request_signature_failed", "The invoice signature request could not be saved.", error);
    }
  }

  @Post("invoices/:invoiceId/sign")
  async signInvoice(
    @Req() request: RequestWithActor,
    @Param("invoiceId") invoiceId: string,
    @Body() body: unknown,
  ) {
    const actor = this.requireCrmPermissionActor(request, "invoices.manage", "invoice_manage_forbidden", "This account cannot change invoices.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseSignDocumentPayload(body);
      const invoice = await this.invoicesRepository.findOne({
        where: {
          id: invoiceId,
          organization_id: organizationId,
        },
      });

      if (!invoice) {
        apiError(404, "invoice_not_found", "The invoice could not be found.");
      }

      const timestamp = new Date();
      invoice.approval_requested_at = invoice.approval_requested_at ?? timestamp;
      invoice.approved_at = invoice.approved_at ?? timestamp;
      invoice.signature_requested_at = invoice.signature_requested_at ?? timestamp;
      invoice.signed_at = invoice.signed_at ?? timestamp;
      invoice.signed_by_name = payload.signedByName;
      await this.invoicesRepository.save(invoice);

      return apiSuccess({ ok: true });
    } catch (error) {
      this.rethrowHttpException(error);
      apiError(400, "invoice_sign_failed", "The invoice could not be signed.", error);
    }
  }

  @Post("invoices/:invoiceId/open")
  async openInvoiceDocument(
    @Req() request: RequestWithActor,
    @Param("invoiceId") invoiceId: string,
  ) {
    const actor = this.requireCrmPermissionActor(request, "invoices.manage", "invoice_manage_forbidden", "This account cannot change invoices.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const invoice = await this.invoicesRepository.findOne({
        where: {
          id: invoiceId,
          organization_id: organizationId,
        },
      });

      if (!invoice) {
        apiError(404, "invoice_not_found", "The invoice could not be found.");
      }

      invoice.approval_requested_at = null;
      invoice.approved_at = null;
      invoice.signature_requested_at = null;
      invoice.signed_at = null;
      invoice.signed_by_name = null;
      await this.invoicesRepository.save(invoice);

      return apiSuccess({ ok: true });
    } catch (error) {
      this.rethrowHttpException(error);
      apiError(400, "invoice_open_failed", "The invoice could not be opened for changes.", error);
    }
  }

  @Post("invoices/:invoiceId/payments")
  async recordInvoicePayment(
    @Req() request: RequestWithActor,
    @Param("invoiceId") invoiceId: string,
    @Body() body: unknown,
  ) {
    const actor = this.requireCrmPermissionActor(
      request,
      "invoices.payment.manage",
      "invoice_payment_manage_forbidden",
      "This account cannot record invoice payments.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseRecordInvoicePaymentPayload(body);

      if (payload.amountCents <= 0) {
        apiError(400, "invalid_invoice_payment_amount", "Invoice payments must be greater than zero.");
      }

      const invoice = await this.invoicesRepository.findOne({
        where: {
          id: invoiceId,
          organization_id: organizationId,
        },
        relations: {
          payments: true,
          job: true,
        },
      });

      if (!invoice) {
        apiError(404, "invoice_not_found", "The invoice could not be found.");
      }

      const job = this.relationValue(invoice.job as RelatedValue<JobEntity>);

      if (!job) {
        apiError(404, "invoice_job_not_found", "The related job could not be found.");
      }

      const occurredAt = payload.occurredAt
        ? new Date(payload.occurredAt)
        : new Date();

      await this.invoicePaymentsRepository.save(
        this.invoicePaymentsRepository.create(this.withOrganizationId(organizationId, {
          invoice_id: invoice.id,
          entry_type: payload.entryType,
          amount_cents: payload.amountCents,
          method: payload.method,
          reference: payload.reference,
          note: payload.note,
          occurred_at: occurredAt,
          created_by_auth_user_id: actor.user.id,
        })),
      );

      const refreshedInvoice = await this.invoicesRepository.findOne({
        where: {
          id: invoice.id,
          organization_id: organizationId,
        },
        relations: {
          payments: true,
          job: true,
        },
      });

      if (!refreshedInvoice) {
        apiError(404, "invoice_not_found", "The invoice could not be found.");
      }

      await this.syncInvoiceJobPaymentState(refreshedInvoice, job, actor);

      return apiSuccess({
        ok: true,
      });
    } catch (error) {
      apiError(400, "invalid_invoice_payment_payload", "The invoice payment payload is invalid.", error);
    }
  }

  @Get("estimates")
  async listEstimates(
    @Req() request: RequestWithActor,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("lifecycleStatus") lifecycleStatus?: string,
    @Query("customerId") customerId?: string,
    @Query("jobId") jobId?: string,
  ) {
    const actor = this.requireActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);

    if (!actorHasPermission(actor, "estimates.view") && !actorHasPermission(actor, "estimates.assigned.view")) {
      apiError(403, "estimate_view_forbidden", "This account cannot view estimates.");
    }

    try {
      const quotes = await this.quotesRepository.find({
        where: {
          organization_id: organizationId,
        },
        relations: {
          job: {
            customer: true,
            invoice: true,
          },
        },
        order: {
          updated_at: "DESC",
        },
      });

      const normalizedQuery = (q ?? "").trim().toLowerCase();
      const normalizedStatus = (status ?? "").trim().toLowerCase();
      const normalizedLifecycleStatus = (lifecycleStatus ?? "").trim().toLowerCase();
      const normalizedCustomerId = (customerId ?? "").trim();
      const normalizedJobId = (jobId ?? "").trim();

      const estimates = quotes
        .filter((quote) => {
          const relatedJob = this.relationValue(quote.job as RelatedValue<JobEntity>);
          const relatedCustomer = this.relationValue(relatedJob?.customer as RelatedValue<CustomerEntity>);

          if (!relatedJob || !relatedCustomer) {
            return false;
          }

          if (!canAccessEstimateResource(actor, relatedJob.assigned_technician_id)) {
            return false;
          }

          if (normalizedCustomerId && relatedCustomer.id !== normalizedCustomerId) {
            return false;
          }

          if (normalizedJobId && relatedJob.id !== normalizedJobId) {
            return false;
          }

          if (normalizedStatus && quote.status !== normalizedStatus) {
            return false;
          }

          const lifecycle =
            quote.status === "rejected"
              ? "void"
              : quote.status === "approved"
                ? relatedJob.invoice
                  ? "converted"
                  : "approved"
                : quote.status;

          if (normalizedLifecycleStatus && lifecycle !== normalizedLifecycleStatus) {
            return false;
          }

          const searchableText = [
            relatedCustomer.full_name,
            relatedJob.title,
            this.buildEstimateDocumentNumber(quote),
            quote.description,
          ]
            .join(" ")
            .toLowerCase();

          if (normalizedQuery && !searchableText.includes(normalizedQuery)) {
            return false;
          }

          return true;
        })
        .map((quote) => {
          const relatedJob = this.relationValue(quote.job as RelatedValue<JobEntity>);
          const relatedCustomer = this.relationValue(relatedJob?.customer as RelatedValue<CustomerEntity>);
          const lifecycle =
            quote.status === "rejected"
              ? "void"
              : quote.status === "approved"
                ? relatedJob?.invoice
                  ? "converted"
                  : "approved"
                : quote.status;

          return {
            id: quote.id,
            job_id: relatedJob?.id ?? quote.job_id,
            customer_id: relatedCustomer?.id ?? "",
            customer_name: relatedCustomer?.full_name ?? "Customer pending",
            job_title: relatedJob?.title ?? "Job",
            document_number: this.buildEstimateDocumentNumber(quote),
            lifecycle_status: lifecycle,
            description: quote.description,
            price_cents: quote.price_cents,
            status: quote.status,
            sent_at: this.toIsoString(quote.sent_at),
            approved_at: this.toIsoString(quote.approved_at),
          };
        });

      return apiSuccess(estimates);
    } catch (error) {
      apiError(500, "estimate_list_failed", "The estimates list could not be loaded.", error);
    }
  }

  @Get("estimates/:estimateId")
  async getEstimate(
    @Req() request: RequestWithActor,
    @Param("estimateId") estimateId: string,
  ) {
    const actor = this.requireActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const quote = await this.quotesRepository.findOne({
        where: {
          id: estimateId,
          organization_id: organizationId,
        },
        relations: {
          job: {
            customer: true,
            invoice: true,
          },
          line_items: true,
        },
      });

      if (!quote) {
        apiError(404, "estimate_not_found", "The estimate could not be found.");
      }

      const job = this.relationValue(quote.job as RelatedValue<JobEntity>);
      const customer = this.relationValue(job?.customer as RelatedValue<CustomerEntity>);

      if (!job || !customer) {
        apiError(404, "estimate_not_found", "The estimate could not be found.");
      }

      if (!canAccessEstimateResource(actor, job.assigned_technician_id)) {
        apiError(403, "estimate_access_denied", "You do not have access to this estimate.");
      }

      const lifecycle =
        quote.status === "rejected"
          ? "void"
          : quote.status === "approved"
            ? job.invoice
              ? "converted"
              : "approved"
            : quote.status;
      const totalCents = quote.total_cents || quote.price_cents;

      return apiSuccess({
        id: quote.id,
        estimate_id: this.buildEstimateDocumentNumber(quote),
        document_number: this.buildEstimateDocumentNumber(quote),
        job_id: job.id,
        customer_id: customer.id,
        customer_name: customer.full_name,
        job_title: job.title,
        lifecycle_status: lifecycle,
        description: quote.description,
        price_cents: quote.price_cents,
        subtotal_cents: quote.subtotal_cents || quote.price_cents,
        tax_rate_bps_snapshot: quote.tax_rate_bps_snapshot,
        tax_cents: quote.tax_cents,
        total_cents: totalCents,
        status: quote.status,
        sent_at: this.toIsoString(quote.sent_at),
        approval_requested_at: this.toIsoString(quote.approval_requested_at),
        approved_at: this.toIsoString(quote.approved_at),
        signature_requested_at: this.toIsoString(quote.signature_requested_at),
        signature_requested: Boolean(quote.signature_requested_at),
        signed_at: this.toIsoString(quote.signed_at),
        signed_by_name: quote.signed_by_name,
        is_locked: this.isDocumentLocked(quote.approved_at, quote.signed_at),
        line_items: this.buildQuoteLineItemResponse(quote),
      });
    } catch (error) {
      apiError(400, "estimate_lookup_failed", "The estimate could not be loaded.", error);
    }
  }

  @Post("estimates/:estimateId/request-approval")
  async requestEstimateApproval(
    @Req() request: RequestWithActor,
    @Param("estimateId") estimateId: string,
  ) {
    const actor = this.requireCrmPermissionActor(request, "estimates.manage", "estimate_manage_forbidden", "This account cannot change estimates.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const quote = await this.quotesRepository.findOne({
        where: {
          id: estimateId,
          organization_id: organizationId,
        },
      });

      if (!quote) {
        apiError(404, "estimate_not_found", "The estimate could not be found.");
      }

      quote.approval_requested_at = quote.approval_requested_at ?? new Date();
      await this.quotesRepository.save(quote);

      return apiSuccess({ ok: true });
    } catch (error) {
      this.rethrowHttpException(error);
      apiError(400, "estimate_request_approval_failed", "The estimate approval request could not be saved.", error);
    }
  }

  @Post("estimates/:estimateId/approve")
  async approveEstimate(
    @Req() request: RequestWithActor,
    @Param("estimateId") estimateId: string,
  ) {
    const actor = this.requireCrmPermissionActor(request, "estimates.manage", "estimate_manage_forbidden", "This account cannot change estimates.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const quote = await this.quotesRepository.findOne({
        where: {
          id: estimateId,
          organization_id: organizationId,
        },
      });

      if (!quote) {
        apiError(404, "estimate_not_found", "The estimate could not be found.");
      }

      const timestamp = new Date();
      quote.approval_requested_at = quote.approval_requested_at ?? timestamp;
      quote.approved_at = quote.approved_at ?? timestamp;
      await this.quotesRepository.save(quote);

      return apiSuccess({ ok: true });
    } catch (error) {
      this.rethrowHttpException(error);
      apiError(400, "estimate_approve_failed", "The estimate could not be approved.", error);
    }
  }

  @Post("estimates/:estimateId/request-signature")
  async requestEstimateSignature(
    @Req() request: RequestWithActor,
    @Param("estimateId") estimateId: string,
  ) {
    const actor = this.requireCrmPermissionActor(request, "estimates.manage", "estimate_manage_forbidden", "This account cannot change estimates.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const quote = await this.quotesRepository.findOne({
        where: {
          id: estimateId,
          organization_id: organizationId,
        },
      });

      if (!quote) {
        apiError(404, "estimate_not_found", "The estimate could not be found.");
      }

      quote.signature_requested_at = quote.signature_requested_at ?? new Date();
      await this.quotesRepository.save(quote);

      return apiSuccess({ ok: true });
    } catch (error) {
      this.rethrowHttpException(error);
      apiError(400, "estimate_request_signature_failed", "The estimate signature request could not be saved.", error);
    }
  }

  @Post("estimates/:estimateId/sign")
  async signEstimate(
    @Req() request: RequestWithActor,
    @Param("estimateId") estimateId: string,
    @Body() body: unknown,
  ) {
    const actor = this.requireCrmPermissionActor(request, "estimates.manage", "estimate_manage_forbidden", "This account cannot change estimates.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseSignDocumentPayload(body);
      const quote = await this.quotesRepository.findOne({
        where: {
          id: estimateId,
          organization_id: organizationId,
        },
      });

      if (!quote) {
        apiError(404, "estimate_not_found", "The estimate could not be found.");
      }

      const timestamp = new Date();
      quote.approval_requested_at = quote.approval_requested_at ?? timestamp;
      quote.approved_at = quote.approved_at ?? timestamp;
      quote.signature_requested_at = quote.signature_requested_at ?? timestamp;
      quote.signed_at = quote.signed_at ?? timestamp;
      quote.signed_by_name = payload.signedByName;
      await this.quotesRepository.save(quote);

      return apiSuccess({ ok: true });
    } catch (error) {
      this.rethrowHttpException(error);
      apiError(400, "estimate_sign_failed", "The estimate could not be signed.", error);
    }
  }

  @Put("jobs/:jobId/invoice")
  async upsertInvoice(
    @Req() request: RequestWithActor,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
  ) {
    const actor = this.requireCrmPermissionActor(
      request,
      "invoices.manage",
      "invoice_manage_forbidden",
      "This account cannot change invoices.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseUpsertInvoicePayload(body);
      const job = await this.jobsRepository.findOne({
        where: {
          id: jobId,
          organization_id: organizationId,
        },
      });

      if (!job) {
        apiError(404, "job_not_found", "The job could not be found.");
      }

      const existingInvoice = await this.invoicesRepository.findOne({
        where: {
          job_id: jobId,
          organization_id: organizationId,
        },
        relations: {
          payments: true,
        },
      });

      if (existingInvoice && this.isDocumentLocked(existingInvoice.approved_at, existingInvoice.signed_at)) {
        this.throwDocumentLockedError("invoice");
      }

      const hasSnapshotLineItems = payload.lineItems !== undefined;
      const invoiceLineDrafts = hasSnapshotLineItems
        ? await this.buildDocumentLineDrafts(
            payload.lineItems ?? [],
            organizationId,
            "invoice",
            existingInvoice?.id ?? null,
          )
        : [];
      const invoiceTotals = hasSnapshotLineItems
        ? this.documentPricingService.computeSnapshotTotals(
            invoiceLineDrafts.map((lineDraft) => ({
              quantity: lineDraft.quantity,
              unitPriceCents: lineDraft.unit_price_cents_snapshot,
            })),
            payload.taxRateBps ?? 0,
          )
        : this.documentPricingService.buildLegacyTotals(payload.amountCents);

      const timestamp = new Date();
      const paidAtTimestamp = this.formatSqlTimestamp(timestamp);
      const orgSettings = await this.findOrganizationSettings(organizationId);
      const dueDays = this.readDefaultDueDays(orgSettings);
      const invoiceDescription =
        payload.description
        ?? existingInvoice?.description
        ?? `Invoice for ${job.title}`;
      const paid_at = payload.status === "paid"
        ? existingInvoice?.paid_at ?? (paidAtTimestamp as unknown as Date)
        : null;
      const issuedAt = existingInvoice?.issued_at ?? timestamp;
      const dueAt = existingInvoice?.due_at ?? this.computeDueAt(issuedAt, dueDays);

      let invoice: InvoiceEntity;

      if (existingInvoice) {
        existingInvoice.description = invoiceDescription;
        existingInvoice.amount_cents = invoiceTotals.totalCents;
        existingInvoice.subtotal_cents = invoiceTotals.subtotalCents;
        existingInvoice.tax_rate_bps_snapshot = invoiceTotals.taxRateBpsSnapshot;
        existingInvoice.tax_cents = invoiceTotals.taxCents;
        existingInvoice.total_cents = invoiceTotals.totalCents;
        existingInvoice.status = payload.status;
        existingInvoice.paid_at = paid_at;
        existingInvoice.due_at = dueAt;
        invoice = await this.invoicesRepository.save(existingInvoice);
      } else {
        invoice = await this.invoicesRepository.save(
          this.invoicesRepository.create(this.withOrganizationId(organizationId, {
            job_id: jobId,
            description: invoiceDescription,
            amount_cents: invoiceTotals.totalCents,
            subtotal_cents: invoiceTotals.subtotalCents,
            tax_rate_bps_snapshot: invoiceTotals.taxRateBpsSnapshot,
            tax_cents: invoiceTotals.taxCents,
            total_cents: invoiceTotals.totalCents,
            status: payload.status,
            paid_at,
            due_at: dueAt,
          })),
        );
      }

      await this.documentSnapshotService.replaceInvoiceLineItems(
        invoice.id,
        hasSnapshotLineItems ? invoiceLineDrafts : [],
      );

      if ((invoice.payments?.length ?? 0) > 0) {
        await this.syncInvoiceJobPaymentState(invoice, job, actor);
        return apiSuccess(invoice);
      }

      if (
        payload.status === "paid"
        && job.status !== "paid"
        && canTransitionJobStatus(job.status, "paid")
      ) {
        await this.jobsRepository.update(
          {
            id: jobId,
            organization_id: organizationId,
          },
          {
            status: "paid",
            paid_at,
            updated_by_auth_user_id: actor.user.id,
          },
        );

        await this.jobStatusEventsRepository.save(
          this.jobStatusEventsRepository.create({
            organization_id: organizationId,
            job_id: jobId,
            author_profile_id: actor.profile.id,
            status: "paid",
            note: "Invoice marked paid.",
          }),
        );
      }

      if (payload.status === "unpaid" && job.status === "paid") {
        await this.jobsRepository.update(
          {
            id: jobId,
            organization_id: organizationId,
          },
          {
            status: "completed",
            paid_at: null,
            updated_by_auth_user_id: actor.user.id,
          },
        );

        await this.jobStatusEventsRepository.save(
          this.jobStatusEventsRepository.create({
            organization_id: organizationId,
            job_id: jobId,
            author_profile_id: actor.profile.id,
            status: "completed",
            note: "Invoice payment status changed to unpaid.",
          }),
        );
      }

      return apiSuccess(invoice);
    } catch (error) {
      this.rethrowHttpException(error);
      apiError(400, "invalid_invoice_payload", "The invoice payload is invalid.", error);
    }
  }

  @Post("jobs/:jobId/notes")
  async createJobNote(
    @Req() request: RequestWithActor,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
  ) {
    const actor = this.requireCrmPermissionActor(
      request,
      "jobs.notes.create",
      "job_note_create_forbidden",
      "This account cannot create job notes.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseCreateJobNotePayload(body);
      const job = await this.jobsRepository.findOne({
        where: {
          id: jobId,
          organization_id: organizationId,
        },
      });

      if (!job) {
        apiError(404, "job_not_found", "The job could not be found.");
      }

      if (!canAccessJobResource(actor, job.assigned_technician_id)) {
        apiError(403, "job_access_denied", "You do not have access to this job.");
      }

      if (!payload.findings && !payload.recommendations && payload.photoUrls.length === 0) {
        apiError(400, "empty_job_note", "Add findings or recommendations before saving a note.");
      }

      const result = await this.jobNotesRepository.save(
        this.jobNotesRepository.create(this.withOrganizationId(organizationId, {
          job_id: jobId,
          author_profile_id: actor.profile?.id ?? null,
          findings: payload.findings,
          recommendations: payload.recommendations,
          photo_urls: payload.photoUrls,
        })),
      );
      result.author_profile = actor.profile ?? null;

      return apiSuccess(this.buildJobNoteResponse(result));
    } catch (error) {
      apiError(400, "invalid_job_note_payload", "The job note payload is invalid.", error);
    }
  }

  @Get("leads")
  async listLeads(
    @Req() request: RequestWithActor,
    @Query("status") status?: string,
  ) {
    const actor = this.requireCrmPermissionActor(request, "leads.view", "lead_view_forbidden", "This account cannot view leads.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const leads = await this.leadsRepository.find({
        where: status
          ? { status: status as LeadEntity["status"], organization_id: organizationId }
          : { organization_id: organizationId },
        order: {
          created_at: "DESC",
        },
      });

      return apiSuccess(leads);
    } catch (error) {
      apiError(500, "lead_list_failed", "The lead queue could not be loaded.", error);
    }
  }

  @Post("leads")
  async createLead(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = this.requireCrmPermissionActor(
      request,
      "leads.manage",
      "lead_manage_forbidden",
      "This account cannot change leads.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseCreateLeadPayload(body);
      const customerResolution = await this.resolveCustomerForLeadIdentity(organizationId, {
        full_name: payload.fullName,
        phone: payload.phone,
        email: payload.email,
        service_address_line_1: payload.serviceAddressLine1,
        service_address_line_2: payload.serviceAddressLine2,
        service_city: payload.serviceCity,
        service_state_or_region: payload.serviceStateOrRegion,
        service_postal_code: payload.servicePostalCode,
        source: payload.source,
        service_type: payload.serviceType,
        description: payload.description,
      });
      const lead = await this.leadsRepository.save(
        this.leadsRepository.create(this.withOrganizationId(organizationId, {
          full_name: payload.fullName,
          phone: payload.phone,
          email: payload.email,
          service_address_line_1: payload.serviceAddressLine1,
          service_address_line_2: payload.serviceAddressLine2,
          service_city: payload.serviceCity,
          service_state_or_region: payload.serviceStateOrRegion,
          service_postal_code: payload.servicePostalCode,
          source: payload.source,
          service_type: payload.serviceType,
          description: payload.description,
          customer_id: customerResolution.customer.id,
          created_by_auth_user_id: actor.user.id,
        })),
      );

      return apiSuccess(lead);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      apiError(400, "invalid_lead_payload", "The lead payload is invalid.", error);
    }
  }

  @Get("leads/:leadId")
  async getLead(@Req() request: RequestWithActor, @Param("leadId") leadId: string) {
    const actor = this.requireCrmPermissionActor(request, "leads.view", "lead_view_forbidden", "This account cannot view leads.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const lead = await this.leadsRepository.findOne({
        where: {
          id: leadId,
          organization_id: organizationId,
        },
        relations: {
          converted_job: true,
        },
      });

      if (!lead) {
        apiError(404, "lead_not_found", "The lead could not be found.");
      }

      return apiSuccess({
        ...lead,
        converted_job: lead.converted_job
          ? {
            id: lead.converted_job.id,
            title: lead.converted_job.title,
            status: lead.converted_job.status,
            scheduled_for: lead.converted_job.scheduled_for,
          }
          : null,
      });
    } catch (error) {
      apiError(400, "lead_lookup_failed", "The lead could not be loaded.", error);
    }
  }

  @Patch("leads/:leadId")
  async updateLead(
    @Req() request: RequestWithActor,
    @Param("leadId") leadId: string,
    @Body() body: unknown,
  ) {
    const actor = this.requireCrmPermissionActor(request, "leads.manage", "lead_manage_forbidden", "This account cannot change leads.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseUpdateLeadPayload(body);

      if (payload.status === "converted") {
        apiError(
          400,
          "lead_status_managed_by_conversion",
          "Use the conversion endpoint to move a lead into the converted state.",
        );
      }

      const lead = await this.leadsRepository.findOne({
        where: {
          id: leadId,
          organization_id: organizationId,
        },
      });

      if (!lead) {
        apiError(404, "lead_not_found", "The lead could not be found.");
      }

      if (payload.fullName !== undefined) {
        lead.full_name = payload.fullName;
      }

      if (payload.phone !== undefined) {
        lead.phone = payload.phone;
      }

      if (payload.email !== undefined) {
        lead.email = payload.email;
      }

      if (payload.serviceAddressLine1 !== undefined) {
        lead.service_address_line_1 = payload.serviceAddressLine1;
      }

      if (payload.serviceAddressLine2 !== undefined) {
        lead.service_address_line_2 = payload.serviceAddressLine2;
      }

      if (payload.serviceCity !== undefined) {
        lead.service_city = payload.serviceCity;
      }

      if (payload.serviceStateOrRegion !== undefined) {
        lead.service_state_or_region = payload.serviceStateOrRegion;
      }

      if (payload.servicePostalCode !== undefined) {
        lead.service_postal_code = payload.servicePostalCode;
      }

      if (payload.source !== undefined) {
        lead.source = payload.source;
      }

      if (payload.serviceType !== undefined) {
        lead.service_type = payload.serviceType;
      }

      if (payload.description !== undefined) {
        lead.description = payload.description;
      }

      if (payload.status !== undefined) {
        lead.status = payload.status;
      }

      const result = await this.leadsRepository.save(lead);

      return apiSuccess(result);
    } catch (error) {
      apiError(400, "invalid_lead_update_payload", "The lead update payload is invalid.", error);
    }
  }

  @Patch("leads/:leadId/disposition")
  async setLeadDisposition(
    @Req() request: RequestWithActor,
    @Param("leadId") leadId: string,
    @Body() body: unknown,
  ) {
    const actor = this.requireCrmPermissionActor(
      request,
      "leads.manage",
      "lead_manage_forbidden",
      "This account cannot change leads.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseLeadDispositionPayload(body);
      const lead = await this.leadsRepository.findOne({
        where: {
          id: leadId,
          organization_id: organizationId,
        },
      });

      if (!lead) {
        apiError(404, "lead_not_found", "The lead could not be found.");
      }

      if (lead.status === "converted" || lead.converted_job_id) {
        apiError(
          400,
          "lead_already_converted",
          "Converted leads cannot be marked not booked.",
        );
      }

      if (lead.disposition === "not_booked") {
        apiError(400, "lead_disposition_locked", "This lead is already marked not booked.");
      }

      lead.disposition = payload.disposition;
      lead.disposition_reason = payload.dispositionReason;
      lead.disposition_note = payload.dispositionNote;
      lead.disposition_at = new Date();
      lead.disposition_by_auth_user_id = actor.user.id;

      const result = await this.leadsRepository.save(lead);

      return apiSuccess(result);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      apiError(400, "invalid_lead_disposition_payload", "The lead disposition payload is invalid.", error);
    }
  }

  @Post("leads/:leadId/convert")
  async convertLead(
    @Req() request: RequestWithActor,
    @Param("leadId") leadId: string,
    @Body() body: unknown,
  ) {
    const actor = this.requireCrmPermissionActor(
      request,
      "leads.manage",
      "lead_manage_forbidden",
      "This account cannot change leads.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseConvertLeadPayload(body);
      const lead = await this.leadsRepository.findOne({
        where: {
          id: leadId,
          organization_id: organizationId,
        },
      });

      if (!lead) {
        apiError(404, "lead_not_found", "The lead could not be found.");
      }

      if (lead.converted_job_id || lead.status === "converted") {
        apiError(400, "lead_already_converted", "This lead has already been converted into a job.");
      }

      if (lead.disposition === "not_booked") {
        apiError(400, "lead_not_booked", "This lead was marked not booked and cannot be converted.");
      }

      const customerResolution = await this.resolveCustomerForLead(organizationId, lead);
      const customer = customerResolution.customer;

      await this.requireServiceInOrganization(payload.serviceId, organizationId);
      await this.requireTechnicianInOrganization(payload.assignedTechnicianId, organizationId);

      const job = await this.jobsRepository.save(
        this.jobsRepository.create({
          organization_id: organizationId,
          customer_id: customer.id,
          service_id: payload.serviceId,
          assigned_technician_id: payload.assignedTechnicianId,
          title: payload.title,
          description: payload.description ?? lead.description,
          lead_source: lead.source,
          requested_service_type: lead.service_type,
          job_type: payload.jobType ?? mapServiceTypeToDefaultJobType(lead.service_type),
          status: "scheduled",
          service_address_line_1: lead.service_address_line_1,
          service_address_line_2: lead.service_address_line_2,
          service_city: lead.service_city,
          service_state_or_region: lead.service_state_or_region,
          service_postal_code: lead.service_postal_code,
          scheduled_for: payload.scheduledFor ? new Date(payload.scheduledFor) : null,
          scheduled_window: payload.scheduledWindow,
          requested_at: lead.created_at,
          created_by_auth_user_id: actor.user.id,
          updated_by_auth_user_id: actor.user.id,
        }),
      );

      if (this.deriveCustomerLifecycleStatus(customer) !== "active") {
        await this.customersRepository.update(
          {
            id: customer.id,
            organization_id: organizationId,
          },
          {
            lifecycle_status: "active",
          },
        );
        customer.lifecycle_status = "active";
      }

      lead.customer_id = customer.id;
      lead.status = "converted";
      lead.converted_job_id = job.id;
      const updatedLead = await this.leadsRepository.save(lead);

      await this.jobStatusEventsRepository.save(
        this.jobStatusEventsRepository.create({
          organization_id: organizationId,
          job_id: job.id,
          author_profile_id: actor.profile.id,
          status: "scheduled",
          note: "Lead converted to scheduled job.",
        }),
      );

      const detail = await this.loadJobDetail(job.id, organizationId);

      return apiSuccess({
        lead: updatedLead,
        customer,
        job: detail ? this.buildJobDetailResponse(detail) : job,
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      apiError(400, "invalid_lead_conversion_payload", "The lead conversion payload is invalid.", error);
    }
  }

  @Get("services")
  async listServices(@Req() request: RequestWithActor) {
    const actor = this.requireCrmPermissionActor(
      request,
      "jobs.create",
      "job_create_forbidden",
      "This account cannot create jobs.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const services = await this.servicesRepository.find({
        where: {
          organization_id: organizationId,
          is_active: true,
        },
        order: {
          sort_position: "ASC",
          name: "ASC",
        },
      });

      return apiSuccess(
        services.map((service) => ({
          id: service.id,
          name: service.name,
          service_type: service.service_type,
          default_price_cents: service.default_price_cents,
          duration_minutes: service.duration_minutes,
        })),
      );
    } catch (error) {
      apiError(500, "service_list_failed", "The service catalog could not be loaded.", error);
    }
  }

  @Get("technicians")
  async listTechnicians(
    @Req() request: RequestWithActor,
    @Query("active") active?: string,
  ) {
    const actor = this.requireCrmPermissionActor(
      request,
      "jobs.update",
      "technician_list_forbidden",
      "This account cannot view the technician roster.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const activeOnly = active === undefined ? true : active === "true";

      const technicians = await this.listTechniciansWithV1Fallback(organizationId, activeOnly);

      return apiSuccess(technicians);
    } catch (error) {
      apiError(500, "technician_list_failed", "The technician roster could not be loaded.", error);
    }
  }

  @Post("customers")
  async createCustomer(
    @Req() request: RequestWithActor,
    @Body() body: unknown,
  ) {
    const actor = this.requireCrmPermissionActor(
      request,
      "customers.manage",
      "customer_manage_forbidden",
      "This account cannot create customers.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseCreateCustomerPayload(body);
      const customer = await this.customersRepository.save(
        this.customersRepository.create({
          organization_id: organizationId,
          full_name: payload.fullName,
          phone: payload.phone,
          email: payload.email,
          company_name: payload.companyName,
          service_address_line_1: payload.serviceAddressLine1,
          service_address_line_2: payload.serviceAddressLine2,
          service_city: payload.serviceCity,
          service_state_or_region: payload.serviceStateOrRegion,
          service_postal_code: payload.servicePostalCode,
          source: "website",
          notes: payload.notes,
          lifecycle_status: "prospect",
        }),
      );

      return apiSuccess({ id: customer.id });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      apiError(400, "invalid_customer_payload", "The customer payload is invalid.", error);
    }
  }

  @Get("customers/search")
  async searchCustomers(@Req() request: RequestWithActor, @Query("q") query?: string) {
    const actor = this.requireCrmPermissionActor(
      request,
      "customers.view",
      "customer_view_forbidden",
      "This account cannot view customers.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const rows = await this.searchCustomersInOrganization(query ?? "", organizationId);
      return apiSuccess(rows);
    } catch (error) {
      apiError(500, "customer_search_failed", "Customer search could not be completed.", error);
    }
  }

  @Get("customers")
  async listCustomers(@Req() request: RequestWithActor) {
    const actor = this.requireCrmPermissionActor(request, "customers.view", "customer_view_forbidden", "This account cannot view customers.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const customers = await this.customersRepository.find({
        where: {
          organization_id: organizationId,
        },
        order: {
          updated_at: "DESC",
        },
      });

      if (customers.length === 0) {
        return apiSuccess([] as Array<CustomerEntity & { relatedJobs: JobEntity[] }>);
      }

      const customerIds = customers.map((customer) => customer.id);
      const jobs = await this.jobsRepository.find({
        where: {
          customer_id: In(customerIds),
          organization_id: organizationId,
        },
        relations: {
          technician: true,
        },
        order: {
          scheduled_for: "ASC",
          updated_at: "DESC",
        },
      });

      const jobsByCustomer = new Map<string, JobEntity[]>();

      for (const job of jobs) {
        const existing = jobsByCustomer.get(job.customer_id) ?? [];
        existing.push(job);
        jobsByCustomer.set(job.customer_id, existing);
      }

      const result = customers.map((customer) => ({
        ...customer,
        relatedJobs: jobsByCustomer.get(customer.id) ?? [],
      }));

      return apiSuccess(result);
    } catch (error) {
      apiError(500, "customer_list_failed", "The customer list could not be loaded.", error);
    }
  }

  @Get("customers/:customerId")
  async getCustomer(
    @Req() request: RequestWithActor,
    @Param("customerId") customerId: string,
  ) {
    const actor = this.requireCrmPermissionActor(request, "customers.view", "customer_view_forbidden", "This account cannot view customers.");
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const [customer, relatedJobs] = await Promise.all([
        this.customersRepository.findOne({
          where: {
            id: customerId,
            organization_id: organizationId,
          },
        }),
        this.jobsRepository.find({
          where: {
            customer_id: customerId,
            organization_id: organizationId,
          },
          relations: {
            technician: true,
          },
          order: {
            scheduled_for: "ASC",
            updated_at: "DESC",
          },
        }),
      ]);

      if (!customer) {
        apiError(404, "customer_not_found", "The customer could not be found.");
      }

      return apiSuccess({
        customer,
        relatedJobs,
      });
    } catch (error) {
      apiError(400, "customer_lookup_failed", "The customer could not be loaded.", error);
    }
  }

  @Patch("customers/:customerId")
  async updateCustomer(
    @Req() request: RequestWithActor,
    @Param("customerId") customerId: string,
    @Body() body: unknown,
  ) {
    const actor = this.requireCrmPermissionActor(
      request,
      "customers.manage",
      "customer_manage_forbidden",
      "This account cannot change customers.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = parseUpdateCustomerPayload(body);
      const customer = await this.customersRepository.findOne({
        where: {
          id: customerId,
          organization_id: organizationId,
        },
      });

      if (!customer) {
        apiError(404, "customer_not_found", "The customer could not be found.");
      }

      if (payload.fullName !== undefined) {
        customer.full_name = payload.fullName;
      }

      if (payload.phone !== undefined) {
        customer.phone = payload.phone;
      }

      if (payload.email !== undefined) {
        customer.email = payload.email;
      }

      if (payload.companyName !== undefined) {
        customer.company_name = payload.companyName;
      }

      if (payload.serviceAddressLine1 !== undefined) {
        customer.service_address_line_1 = payload.serviceAddressLine1;
      }

      if (payload.serviceAddressLine2 !== undefined) {
        customer.service_address_line_2 = payload.serviceAddressLine2;
      }

      if (payload.serviceCity !== undefined) {
        customer.service_city = payload.serviceCity;
      }

      if (payload.serviceStateOrRegion !== undefined) {
        customer.service_state_or_region = payload.serviceStateOrRegion;
      }

      if (payload.servicePostalCode !== undefined) {
        customer.service_postal_code = payload.servicePostalCode;
      }

      if (payload.notes !== undefined) {
        customer.notes = payload.notes;
      }

      if (payload.preferredServiceType !== undefined) {
        customer.preferred_service_type = payload.preferredServiceType;
      }

      const result = await this.customersRepository.save(customer);

      return apiSuccess(result);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      apiError(400, "invalid_customer_update_payload", "The customer update payload is invalid.", error);
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private normalizeText(value: unknown, maxLength: number) {
    if (typeof value !== "string") {
      return null;
    }

    const normalizedValue = value.trim();

    if (!normalizedValue) {
      return null;
    }

    return normalizedValue.slice(0, maxLength);
  }

  private normalizeEmail(value: string | null) {
    if (!value) {
      return null;
    }

    return value.trim().toLowerCase();
  }

  private normalizePhone(value: string | null) {
    if (!value) {
      return null;
    }

    const digits = value.replace(/\D+/g, "");

    return digits || null;
  }

  private normalizeLookupToken(value: string | null) {
    if (!value) {
      return null;
    }

    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  private formatSqlTimestamp(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    const seconds = String(value.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  private parseLegacyCreatedAt(value: string | null) {
    if (!value) {
      return null;
    }

    const normalizedValue = value.trim();

    if (!normalizedValue) {
      return null;
    }

    const directDate = new Date(normalizedValue);

    if (!Number.isNaN(directDate.getTime())) {
      return this.formatSqlTimestamp(directDate);
    }

    const match = normalizedValue.match(
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[\s,T]+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?)?$/i,
    );

    if (!match) {
      return null;
    }

    const [, monthValue, dayValue, yearValue, hourValue, minuteValue, secondValue, meridiem] = match;
    const month = Number(monthValue);
    const day = Number(dayValue);
    const year = yearValue.length === 2 ? 2000 + Number(yearValue) : Number(yearValue);

    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
      return null;
    }

    let hours = hourValue ? Number(hourValue) : 0;
    const minutes = minuteValue ? Number(minuteValue) : 0;
    const seconds = secondValue ? Number(secondValue) : 0;

    if (!Number.isInteger(hours) || hours < 0 || hours > 23) {
      return null;
    }

    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59 || !Number.isInteger(seconds) || seconds < 0 || seconds > 59) {
      return null;
    }

    if (meridiem) {
      if (hours < 1 || hours > 12) {
        return null;
      }

      const normalizedMeridiem = meridiem.toLowerCase();

      if (normalizedMeridiem === "pm" && hours < 12) {
        hours += 12;
      }

      if (normalizedMeridiem === "am" && hours === 12) {
        hours = 0;
      }
    }

    const parsedDate = new Date(year, month - 1, day, hours, minutes, seconds);

    if (
      Number.isNaN(parsedDate.getTime())
      || parsedDate.getFullYear() !== year
      || parsedDate.getMonth() !== month - 1
      || parsedDate.getDate() !== day
    ) {
      return null;
    }

    return this.formatSqlTimestamp(parsedDate);
  }

  private normalizeAddressKey(
    fullName: string | null,
    addressLine1: string | null,
  ) {
    const normalizedName = this.normalizeLookupToken(fullName);
    const normalizedAddressLine1 = this.normalizeLookupToken(addressLine1);

    if (!normalizedName || !normalizedAddressLine1) {
      return null;
    }

    return [normalizedName, normalizedAddressLine1].join("::");
  }

  private matchesEmailPattern(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private parseEnumValue<T extends readonly string[]>(
    value: string | null,
    allowedValues: T,
  ) {
    if (!value) {
      return null;
    }

    const normalizedValue = this.normalizeLookupToken(value);

    if (!normalizedValue) {
      return null;
    }

    return allowedValues.find((allowedValue) => this.normalizeLookupToken(allowedValue) === normalizedValue) ?? null;
  }

  private deriveCustomerLifecycleStatus(customer: CustomerEntity): CustomerLifecycleStatus | null {
    const normalizedValue = this.normalizeLookupToken((customer as { lifecycle_status?: string | null }).lifecycle_status ?? null);
    if (!normalizedValue) {
      return null;
    }

    return customerLifecycleStatuses.find((status) => this.normalizeLookupToken(status) === normalizedValue) ?? null;
  }

  private async createProspectCustomerFromLeadIdentity(
    organizationId: string,
    input: LeadIdentityInput,
  ) {
    return this.customersRepository.save(
      this.customersRepository.create(this.withOrganizationId(organizationId, {
        full_name: input.full_name,
        phone: input.phone,
        email: input.email,
        service_address_line_1: input.service_address_line_1,
        service_address_line_2: input.service_address_line_2,
        service_city: input.service_city,
        service_state_or_region: input.service_state_or_region,
        service_postal_code: input.service_postal_code,
        source: input.source,
        preferred_service_type: input.service_type,
        notes: input.description,
        lifecycle_status: "prospect" as CustomerLifecycleStatus,
      })),
    );
  }

  private async resolveCustomerForLeadIdentity(
    organizationId: string,
    input: LeadIdentityInput,
  ) {
    const normalizedPhone = this.normalizePhone(input.phone);
    const normalizedEmail = this.normalizeEmail(input.email);
    const customers = await this.customersRepository.find({
      where: {
        organization_id: organizationId,
      },
    });
    const phoneMatches = normalizedPhone
      ? customers.filter((customer) => this.normalizePhone(customer.phone) === normalizedPhone)
      : [];
    const emailMatches = normalizedEmail
      ? customers.filter((customer) => this.normalizeEmail(customer.email) === normalizedEmail)
      : [];

    const uniqueMatches = new Map<string, CustomerEntity>();
    for (const match of [...phoneMatches, ...emailMatches]) {
      uniqueMatches.set(match.id, match);
    }

    if (uniqueMatches.size > 1) {
      apiError(
        409,
        "lead_customer_identity_conflict",
        "Lead phone/email matches different customer records. Resolve customer identity manually before creating the lead.",
      );
    }

    const matchedCustomer = uniqueMatches.values().next().value as CustomerEntity | undefined;
    if (matchedCustomer) {
      return { customer: matchedCustomer, created: false as const };
    }

    const createdCustomer = await this.createProspectCustomerFromLeadIdentity(organizationId, input);
    return { customer: createdCustomer, created: true as const };
  }

  private async resolveCustomerForLead(
    organizationId: string,
    lead: LeadEntity,
  ) {
    const identity: LeadIdentityInput = {
      full_name: lead.full_name,
      phone: lead.phone,
      email: lead.email,
      service_address_line_1: lead.service_address_line_1,
      service_address_line_2: lead.service_address_line_2,
      service_city: lead.service_city,
      service_state_or_region: lead.service_state_or_region,
      service_postal_code: lead.service_postal_code,
      source: lead.source,
      service_type: lead.service_type,
      description: lead.description,
    };

    if (lead.customer_id) {
      const linkedCustomer = await this.customersRepository.findOne({
        where: {
          id: lead.customer_id,
          organization_id: organizationId,
        },
      });

      if (linkedCustomer) {
        return { customer: linkedCustomer, created: false as const };
      }
    }

    return this.resolveCustomerForLeadIdentity(organizationId, identity);
  }

  private parseImportPayload(jsonBody: unknown): ImportPayload {
    if (!this.isRecord(jsonBody)) {
      throw new Error("Customer import payload must be a JSON object.");
    }

    const mode = jsonBody.mode;
    const confirmImport = jsonBody.confirmImport === true;
    const rows = jsonBody.rows;

    if (mode !== "preview" && mode !== "import") {
      throw new Error("mode must be preview or import.");
    }

    if (!Array.isArray(rows)) {
      throw new Error("rows must be an array.");
    }

    const parsedRows = rows.map((row, index) => {
      if (!this.isRecord(row)) {
        throw new Error(`Row ${index + 1} must be an object.`);
      }

      const rowNumber = typeof row.rowNumber === "number" && Number.isFinite(row.rowNumber)
        ? row.rowNumber
        : index + 2;

      const parsedRow: CustomerImportRowInput = { rowNumber };

      for (const field of [
        "external_client_number",
        "full_name",
        "email",
        "company_name",
        "service_address_line_1",
        "phone",
        "legacy_created_at",
        "notes",
        "source",
      ] as CustomerImportField[]) {
        const value = row[field];
        parsedRow[field] = typeof value === "string" ? value : value == null ? null : String(value);
      }

      return parsedRow;
    });

    return {
      mode,
      confirmImport,
      rows: parsedRows,
    };
  }

  private buildExistingDuplicateLabel(customer: CustomerEntity) {
    const customerReference = customer.external_client_number ? `Client # ${customer.external_client_number}` : null;

    return [
      customer.full_name,
      customer.company_name,
      customerReference,
      formatAddress(
        customer.service_address_line_1,
        customer.service_address_line_2,
        customer.service_city,
        customer.service_state_or_region,
        customer.service_postal_code,
      ),
    ]
      .filter(Boolean)
      .join(" • ");
  }

  private analyzeRow(row: CustomerImportRowInput): PreviewRowAnalysis {
    const issues: string[] = [];
    const externalClientNumber = this.normalizeText(row.external_client_number, 120);
    const fullName = this.normalizeText(row.full_name, 255);
    const companyName = this.normalizeText(row.company_name, 255);
    const phone = this.normalizeText(row.phone, 64);
    const email = this.normalizeEmail(this.normalizeText(row.email, 320));
    const serviceAddressLine1 = this.normalizeText(row.service_address_line_1, 255);
    const legacyCreatedAt = this.parseLegacyCreatedAt(this.normalizeText(row.legacy_created_at, 80));
    const notes = this.normalizeText(row.notes, 3000);
    const source = this.parseEnumValue(row.source ?? null, customerImportSourceOptions) ?? "website";

    if (!fullName) {
      issues.push("Full Name is required.");
    }

    if (!phone) {
      issues.push("Phone is required.");
    }

    if (!serviceAddressLine1) {
      issues.push("Address is required.");
    }

    if (email && !this.matchesEmailPattern(email)) {
      issues.push("Email must be a valid email address.");
    }

    if (row.source && !this.parseEnumValue(row.source ?? null, customerImportSourceOptions)) {
      issues.push("Lead Source must be one of: phone, website, google, referral, repeat_customer, other.");
    }

    const addressLabel = formatAddress(
      serviceAddressLine1 ?? "",
      null,
      "",
      null,
      "",
    );

    const normalizedExternalClientNumber = this.normalizeLookupToken(externalClientNumber);
    const normalizedPhone = this.normalizePhone(phone);
    const normalizedEmail = this.normalizeEmail(email);
    const normalizedAddressKey = this.normalizeAddressKey(fullName, serviceAddressLine1);

    return {
      rowNumber: row.rowNumber,
      externalClientNumber,
      fullName,
      phone,
      email,
      companyName,
      legacyCreatedAt,
      addressLabel,
      source: source as CustomerImportSource,
      notes,
      issues,
      duplicateMatches: [],
      status: issues.length > 0 ? "invalid" : "ready",
      insertValue:
        issues.length > 0
          ? null
          : {
            external_client_number: externalClientNumber,
            full_name: fullName as string,
            phone: phone as string,
            email,
            company_name: companyName,
            service_address_line_1: serviceAddressLine1 as string,
            service_address_line_2: null,
            legacy_created_at: legacyCreatedAt ? new Date(legacyCreatedAt) : null,
            source: source as CustomerImportSource,
            notes,
          },
      normalizedExternalClientNumber,
      normalizedPhone,
      normalizedEmail,
      normalizedAddressKey,
    };
  }

  private async loadDuplicateCandidates(rows: PreviewRowAnalysis[], organizationId: string) {
    const exactClientNumbers = Array.from(new Set(
      rows.map((row) => row.insertValue?.external_client_number).filter((value): value is string => Boolean(value)),
    ));
    const exactPhones = Array.from(new Set(rows.map((row) => row.phone).filter((value): value is string => Boolean(value))));
    const exactEmails = Array.from(new Set(rows.map((row) => row.email).filter((value): value is string => Boolean(value))));
    const exactAddressLines = Array.from(new Set(
      rows
        .map((row) => row.insertValue?.service_address_line_1)
        .filter((value): value is string => Boolean(value)),
    ));

    const queries: Array<Promise<CustomerEntity[]>> = [];

    if (exactClientNumbers.length > 0) {
      queries.push(this.customersRepository.find({
        where: {
          organization_id: organizationId,
          external_client_number: In(exactClientNumbers),
        },
      }));
    }

    if (exactPhones.length > 0) {
      queries.push(this.customersRepository.find({
        where: {
          organization_id: organizationId,
          phone: In(exactPhones),
        },
      }));
    }

    if (exactEmails.length > 0) {
      queries.push(this.customersRepository.find({
        where: {
          organization_id: organizationId,
          email: In(exactEmails),
        },
      }));
    }

    if (exactAddressLines.length > 0) {
      queries.push(this.customersRepository.find({
        where: {
          organization_id: organizationId,
          service_address_line_1: In(exactAddressLines),
        },
      }));
    }

    if (queries.length === 0) {
      return [] as CustomerEntity[];
    }

    const results = await Promise.all(queries);
    const candidateMap = new Map<string, CustomerEntity>();

    for (const result of results) {
      for (const customer of result) {
        candidateMap.set(customer.id, customer);
      }
    }

    return Array.from(candidateMap.values());
  }

  private async buildPreviewResponse(
    rows: CustomerImportRowInput[],
    organizationId: string,
  ): Promise<CustomerImportPreviewResponse & { analyzedRows: PreviewRowAnalysis[] }> {
    const analyzedRows = rows.map((row) => this.analyzeRow(row));
    const existingCustomers = await this.loadDuplicateCandidates(
      analyzedRows.filter((row) => row.insertValue),
      organizationId,
    );

    for (const row of analyzedRows) {
      if (!row.insertValue) {
        continue;
      }

      for (const customer of existingCustomers) {
        const duplicateReasons: string[] = [];
        const customerExternalClientNumber = this.normalizeLookupToken(customer.external_client_number);
        const customerPhone = this.normalizePhone(customer.phone);
        const customerEmail = this.normalizeEmail(customer.email);
        const customerAddressKey = this.normalizeAddressKey(
          customer.full_name,
          customer.service_address_line_1,
        );

        if (
          row.normalizedExternalClientNumber
          && customerExternalClientNumber
          && row.normalizedExternalClientNumber === customerExternalClientNumber
        ) {
          duplicateReasons.push("matching Client #");
        }

        if (row.normalizedPhone && customerPhone && row.normalizedPhone === customerPhone) {
          duplicateReasons.push("matching phone");
        }

        if (row.normalizedEmail && customerEmail && row.normalizedEmail === customerEmail) {
          duplicateReasons.push("matching email");
        }

        if (row.normalizedAddressKey && customerAddressKey && row.normalizedAddressKey === customerAddressKey) {
          duplicateReasons.push("matching name and address");
        }

        if (duplicateReasons.length === 0) {
          continue;
        }

        row.duplicateMatches.push({
          kind: "existing_customer",
          reference: customer.id,
          label: this.buildExistingDuplicateLabel(customer),
          reasons: duplicateReasons,
        });
      }
    }

    const seenExternalClientNumber = new Map<string, PreviewRowAnalysis>();
    const seenPhone = new Map<string, PreviewRowAnalysis>();
    const seenEmail = new Map<string, PreviewRowAnalysis>();
    const seenAddress = new Map<string, PreviewRowAnalysis>();

    for (const row of analyzedRows) {
      if (!row.insertValue) {
        continue;
      }

      const matchImportRow = (
        key: string | null,
        seenMap: Map<string, PreviewRowAnalysis>,
        reason: string,
      ) => {
        if (!key) {
          return;
        }

        const existingMatch = seenMap.get(key);

        if (!existingMatch) {
          seenMap.set(key, row);
          return;
        }

        const currentLabel = `CSV row ${row.rowNumber}`;
        const existingLabel = `CSV row ${existingMatch.rowNumber}`;
        const currentMatchAlreadyPresent = row.duplicateMatches.some(
          (duplicateMatch) => duplicateMatch.kind === "import_row" && duplicateMatch.reference === String(existingMatch.rowNumber),
        );
        const existingMatchAlreadyPresent = existingMatch.duplicateMatches.some(
          (duplicateMatch) => duplicateMatch.kind === "import_row" && duplicateMatch.reference === String(row.rowNumber),
        );

        if (!currentMatchAlreadyPresent) {
          row.duplicateMatches.push({
            kind: "import_row",
            reference: String(existingMatch.rowNumber),
            label: existingLabel,
            reasons: [reason],
          });
        }

        if (!existingMatchAlreadyPresent) {
          existingMatch.duplicateMatches.push({
            kind: "import_row",
            reference: String(row.rowNumber),
            label: currentLabel,
            reasons: [reason],
          });
        }
      };

      matchImportRow(row.normalizedExternalClientNumber, seenExternalClientNumber, "matching Client #");
      matchImportRow(row.normalizedPhone, seenPhone, "matching phone");
      matchImportRow(row.normalizedEmail, seenEmail, "matching email");
      matchImportRow(row.normalizedAddressKey, seenAddress, "matching name and address");
    }

    for (const row of analyzedRows) {
      row.status = row.issues.length > 0
        ? "invalid"
        : row.duplicateMatches.length > 0
          ? "duplicate"
          : "ready";
    }

    return {
      analyzedRows,
      summary: {
        totalRows: analyzedRows.length,
        readyRows: analyzedRows.filter((row) => row.status === "ready").length,
        duplicateRows: analyzedRows.filter((row) => row.status === "duplicate").length,
        invalidRows: analyzedRows.filter((row) => row.status === "invalid").length,
      },
      rows: analyzedRows.map((row) => ({
        rowNumber: row.rowNumber,
        externalClientNumber: row.externalClientNumber,
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
        companyName: row.companyName,
        legacyCreatedAt: row.legacyCreatedAt,
        addressLabel: row.addressLabel,
        source: row.source,
        notes: row.notes,
        issues: row.issues,
        duplicateMatches: row.duplicateMatches,
        status: row.status,
      })),
    };
  }

  @Post("admin/customers/import")
  async importCustomers(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = this.requireCrmPermissionActor(
      request,
      "customers.manage",
      "customer_import_forbidden",
      "This account cannot import customers.",
    );
    const organizationId = this.requireActiveOrganizationId(actor);

    try {
      const payload = this.parseImportPayload(body);

      if (payload.rows.length === 0) {
        apiError(400, "empty_customer_import", "Upload and parse at least one CSV row before importing customers.");
      }

      const preview = await this.buildPreviewResponse(payload.rows, organizationId);

      if (payload.mode === "preview") {
        return apiSuccess<CustomerImportPreviewResponse>({
          summary: preview.summary,
          rows: preview.rows,
        });
      }

      if (!payload.confirmImport) {
        apiError(400, "customer_import_confirmation_required", "Confirm the import before writing customers to the CRM.");
      }

      const importableRows = preview.analyzedRows
        .filter((row) => row.status === "ready" && row.insertValue)
        .map((row) => row.insertValue as CustomerInsertCandidate);

      if (importableRows.length === 0) {
        apiError(400, "no_customer_rows_ready", "No customer rows are ready to import. Resolve duplicates or validation issues first.");
      }

      const insertResult = await this.customersRepository.save(
        importableRows.map((row) => this.customersRepository.create(this.withOrganizationId(organizationId, row))),
      );

      return apiSuccess<CustomerImportResult>({
        summary: {
          ...preview.summary,
          importedRows: insertResult.length,
          skippedRows: preview.summary.totalRows - insertResult.length,
        },
        rows: preview.rows,
        importedCustomers: insertResult.map((customer) => ({
          id: customer.id,
          fullName: customer.full_name,
          phone: customer.phone,
          email: customer.email,
        })),
      });
    } catch (error) {
      apiError(400, "invalid_customer_import_payload", "The customer import payload is invalid.", error);
    }
  }

  private parseSendEmailPayload(raw: unknown) {
    if (typeof raw !== "object" || raw === null) {
      return { to: null as string | null, subject: null as string | null, body: null as string | null };
    }
    const payload = raw as Record<string, unknown>;
    return {
      to: typeof payload.to === "string" ? (payload.to as string).trim() : null,
      subject: typeof payload.subject === "string" ? (payload.subject as string).trim() : null,
      body: typeof payload.body === "string" ? (payload.body as string).trim() : null,
    };
  }

  private formatDueDate(dueAt: Date | null | undefined, issuedAt: Date, fallbackDueDays = 30) {
    const due = dueAt ? new Date(dueAt) : new Date(issuedAt);
    if (!dueAt) {
      due.setDate(due.getDate() + fallbackDueDays);
    }
    return due.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  private formatDisplayDate(value: Date | string | null | undefined) {
    if (!value) {
      return "-";
    }
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "-";
    }
    return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  private resolveTemplate(template: string, vars: Record<string, string>) {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
    }
    return result;
  }

  private buildOrganizationSettingsKey(organizationId: string) {
    return `${organizationId}:${ORGANIZATION_SETTINGS_KEY}`;
  }

  private async findOrganizationSettings(organizationId: string) {
    const keyed = await this.organizationSettingsRepository.findOne({
      where: {
        settings_key: this.buildOrganizationSettingsKey(organizationId),
        organization_id: organizationId,
      },
    });
    if (keyed) {
      return keyed;
    }
    return this.organizationSettingsRepository.findOne({
      where: {
        settings_key: ORGANIZATION_SETTINGS_KEY,
        organization_id: organizationId,
      },
    });
  }

  private normalizeOptionalString(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private buildInvoiceBrandingSnapshot(
    settings: OrganizationSettingEntity | null,
  ): InvoicePdfBrandingSnapshot {
    return this.documentBrandingSnapshotService.toInvoiceSnapshot(settings);
  }

  private parseInvoiceBrandingSnapshot(raw: string | null | undefined): InvoicePdfBrandingSnapshot | null {
    return this.documentBrandingSnapshotService.parseInvoiceSnapshot(raw);
  }

  private async ensureInvoiceBrandingSnapshot(invoice: InvoiceEntity, organizationId: string) {
    const existing = this.parseInvoiceBrandingSnapshot(invoice.branding_snapshot_json);
    if (existing) {
      return existing;
    }

    const orgSettings = await this.findOrganizationSettings(organizationId);
    const snapshot = this.buildInvoiceBrandingSnapshot(orgSettings);
    invoice.branding_snapshot_json = JSON.stringify(snapshot);
    await this.invoicesRepository.save(invoice);
    return snapshot;
  }

  private formatCents(cents: number | null | undefined) {
    if (typeof cents !== "number" || !Number.isFinite(cents)) {
      return "$0.00";
    }
    return `$${(cents / 100).toFixed(2)}`;
  }

  private buildInvoicePdfBuffer(input: {
    invoice: InvoiceEntity;
    customer: CustomerEntity | null;
    lifecycleStatus: string;
    totalCents: number;
    netPaidCents: number;
    balanceCents: number;
    branding: InvoicePdfBrandingSnapshot;
    documentNumber: string;
    dueDays: number;
  }) {
    const sortedLineItems = [...(input.invoice.line_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const subtotalCents = input.invoice.subtotal_cents || input.invoice.amount_cents;
    const taxRateBps = input.invoice.tax_rate_bps_snapshot ?? 0;
    const taxLabel = taxRateBps > 0 ? `Tax (${(taxRateBps / 100).toFixed(2)}%)` : "Tax";

    const customerAddressLines = [
      input.customer?.service_address_line_1 ?? null,
      input.customer?.service_address_line_2 ?? null,
      [input.customer?.service_city, input.customer?.service_state_or_region].filter(Boolean).join(", "),
      input.customer?.service_postal_code ?? null,
    ].filter((entry): entry is string => Boolean(entry && entry.trim()));

    const serviceAddressLines = [...customerAddressLines];

    return this.invoicePdfService.renderInvoicePdf({
      documentNumber: input.documentNumber,
      lifecycleStatus: input.lifecycleStatus,
      issuedAtLabel: this.formatDisplayDate(input.invoice.issued_at),
      dueAtLabel: this.formatDueDate(input.invoice.due_at, input.invoice.issued_at, input.dueDays),
      generatedAtIso: new Date().toISOString(),
      customerName: input.customer?.full_name ?? "Customer",
      customerCompany: this.normalizeOptionalString(input.customer?.company_name),
      customerAddressLines,
      customerEmail: this.normalizeOptionalString(input.customer?.email),
      customerPhone: this.normalizeOptionalString(input.customer?.phone),
      serviceAddressLines,
      description: this.normalizeOptionalString(input.invoice.description),
      lineItems: sortedLineItems.map((item) => ({
        name: item.name_snapshot || "Item",
        description: item.description_snapshot,
        quantity: String(item.quantity),
        rateLabel: this.formatCents(item.unit_price_cents_snapshot),
        amountLabel: this.formatCents(item.line_subtotal_cents),
      })),
      subtotalLabel: this.formatCents(subtotalCents),
      taxLabel,
      taxAmountLabel: this.formatCents(input.invoice.tax_cents ?? 0),
      totalLabel: this.formatCents(input.totalCents),
      paidLabel: input.netPaidCents > 0 ? this.formatCents(input.netPaidCents) : null,
      balanceLabel: input.balanceCents > 0 ? this.formatCents(input.balanceCents) : null,
      branding: input.branding,
    });
  }

  private readDefaultDueDays(settings: OrganizationSettingEntity | null) {
    const dueDays = settings?.default_due_days;
    if (typeof dueDays === "number" && Number.isInteger(dueDays) && dueDays >= 0 && dueDays <= 365) {
      return dueDays;
    }
    return 30;
  }

  private computeDueAt(issuedAt: Date, dueDays: number) {
    const dueAt = new Date(issuedAt);
    dueAt.setDate(dueAt.getDate() + dueDays);
    return dueAt;
  }
}

