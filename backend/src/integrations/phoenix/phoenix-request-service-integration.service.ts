import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { createHash } from "crypto";
import { And, DataSource, In, LessThan, MoreThanOrEqual, QueryFailedError } from "typeorm";

import { apiError } from "../../common/api-response";
import { normalizeServiceProvinceToBranchCode } from "../../crm/branch-province-resolution";
import { mapServiceTypeToDefaultJobType, type ServiceType } from "../../crm/constants";
import { BranchScopeService } from "../../crm/branch-scope.service";
import { occupiedBlockingWindowKey } from "../../crm/job-scheduling-normalization";
import { CustomerEntity } from "../../database/entities/customer.entity";
import { JobEntity } from "../../database/entities/job.entity";
import { LeadEntity } from "../../database/entities/lead.entity";
import { PublicBookingSubmissionEntity } from "../../database/entities/public-booking-submission.entity";
import { CustomerPortalService } from "../../customer-portal/customer-portal.service";
import { PhoenixIntegrationAuthService } from "./phoenix-integration-auth.service";
import {
  findPhoenixTimeWindow,
  formatScheduledWindowKey,
  isIsoDate,
  isIsoDateWithinHorizon,
  enumerateIsoDates,
  validateAvailabilityRangeQuery,
  compareIsoDates,
  PHOENIX_REQUEST_SERVICE_TIME_WINDOWS,
  PHOENIX_SLOT_BLOCKING_JOB_STATUSES,
} from "./phoenix-scheduling.constants";
import {
  parsePhoenixRequestServiceLiveTimingLocation,
  resolveBranchProvinceCodeForLocation,
  type PhoenixRequestServiceLiveTimingLocation,
} from "./phoenix-location-resolution";
import {
  dayRangeUtcBounds,
  isoDateKeyFromUtcInstant,
  zonedLocalDateTimeToUtc,
} from "./phoenix-scheduling-timezone";

export type PhoenixRequestServicePayload = {
  requestId: string;
  customer: {
    fullName: string;
    phone: string;
    email: string | null;
  };
  serviceAddress: {
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string;
  };
  service: {
    type: ServiceType;
    originalService: string | null;
  };
  request: {
    description: string | null;
    urgency: string | null;
    preferredDay: string | null;
    preferredTime: string | null;
  };
  attribution: {
    source: "website";
    city: string | null;
    cta: string | null;
    sourceUrl: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
  };
  scheduling?: {
    location: PhoenixRequestServiceLiveTimingLocation;
    preferredDate: string;
    timeWindow: { start: string; end: string };
  } | null;
};

const PHOENIX_RS_IDEMPOTENCY_PREFIX = "phoenix-rs:";

function isDuplicateEntryError(error: unknown) {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as { code?: string; errno?: number };
  return driverError?.errno === 1062 || driverError?.code === "ER_DUP_ENTRY";
}

function buildDescription(payload: PhoenixRequestServicePayload) {
  const lines = [
    payload.request.description,
    payload.request.urgency ? `Urgency: ${payload.request.urgency}` : null,
    payload.request.preferredDay ? `Preferred day: ${payload.request.preferredDay}` : null,
    payload.request.preferredTime ? `Preferred time: ${payload.request.preferredTime}` : null,
    payload.attribution.sourceUrl ? `Page: ${payload.attribution.sourceUrl}` : null,
  ].filter(Boolean);

  return lines.join("\n") || null;
}

function scheduledForFromDateWindow(date: string, start: string, provinceCode: "AB" | "ON") {
  return zonedLocalDateTimeToUtc(date, start, provinceCode);
}

function dayRangeUtc(date: string, provinceCode: "AB" | "ON") {
  const { start, endExclusive } = dayRangeUtcBounds(date, provinceCode);
  return { start, end: endExclusive };
}

function buildDaySlots(occupiedWindows: Set<string>) {
  return PHOENIX_REQUEST_SERVICE_TIME_WINDOWS.map((window) => {
    const key = formatScheduledWindowKey(window.start, window.end);
    return {
      start: window.start,
      end: window.end,
      available: !occupiedWindows.has(key),
    };
  });
}

function isoDateKeyForScheduledJob(scheduledAt: Date, provinceCode: "AB" | "ON") {
  return isoDateKeyFromUtcInstant(scheduledAt, provinceCode);
}

function logAvailabilityFailure(event: string, details: Record<string, unknown>) {
  console.warn(`[phoenix-rs] ${event}`, details);
}

@Injectable()
export class PhoenixRequestServiceIntegrationService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly branchScopeService: BranchScopeService,
    private readonly phoenixIntegrationAuthService: PhoenixIntegrationAuthService,
    private readonly customerPortalService: CustomerPortalService,
  ) {}

  private requireOrganizationId() {
    const organizationId = this.phoenixIntegrationAuthService.getIntegrationOrganizationId();
    if (!organizationId) {
      apiError(
        503,
        "phoenix_integration_not_configured",
        "PHOENIX_INTEGRATION_ORGANIZATION_ID is required for Request Service integration.",
      );
    }
    return organizationId;
  }

  async getAvailability(locationInput: string, dateInput: string) {
    const date = dateInput.trim();
    if (!isIsoDate(date)) {
      apiError(400, "invalid_availability_date", "date must be YYYY-MM-DD.");
    }

    const range = await this.getAvailabilityRange(locationInput, date, date);
    return {
      date: range.days[0]?.date ?? date,
      location: range.location,
      slots: range.days[0]?.slots ?? buildDaySlots(new Set()),
    };
  }

  async getAvailabilityRange(locationInput: string, fromInput: string, toInput: string) {
    const organizationId = this.requireOrganizationId();
    let location: PhoenixRequestServiceLiveTimingLocation;
    try {
      location = parsePhoenixRequestServiceLiveTimingLocation(locationInput);
    } catch (error) {
      logAvailabilityFailure("availability_location_rejected", {
        location: locationInput?.trim() || "",
        reason: error instanceof Error ? error.message : "invalid_location",
      });
      throw error;
    }

    const validated = validateAvailabilityRangeQuery(fromInput, toInput);

    if (!validated.ok) {
      logAvailabilityFailure("availability_range_rejected", {
        location,
        from: fromInput?.trim(),
        to: toInput?.trim(),
        code: validated.code,
      });
      apiError(400, validated.code, validated.message);
    }

    const { from, to } = validated;
    const branchCode = resolveBranchProvinceCodeForLocation(location);
    const branch = await this.branchScopeService.findActiveBranchByCode(organizationId, branchCode);
    if (!branch) {
      logAvailabilityFailure("availability_branch_missing", { location, branchCode });
      apiError(404, "branch_not_found", "Scheduling branch is not configured for this location.");
    }

    const { start: rangeStart } = dayRangeUtc(from, branchCode);
    const { end: rangeEndExclusive } = dayRangeUtc(to, branchCode);

    const jobs = await this.dataSource.getRepository(JobEntity).find({
      where: {
        organization_id: organizationId,
        branch_id: branch.id,
        status: In([...PHOENIX_SLOT_BLOCKING_JOB_STATUSES]),
        scheduled_for: And(MoreThanOrEqual(rangeStart), LessThan(rangeEndExclusive)),
      },
      select: { scheduled_window: true, scheduled_for: true },
    });

    const occupiedByDate = new Map<string, Set<string>>();
    for (const job of jobs) {
      if (!job.scheduled_window || !job.scheduled_for) {
        continue;
      }

      const scheduledAt = new Date(job.scheduled_for);
      if (scheduledAt >= rangeEndExclusive) {
        continue;
      }

      const dateKey = isoDateKeyForScheduledJob(scheduledAt, branchCode);
      if (compareIsoDates(dateKey, from) < 0 || compareIsoDates(dateKey, to) > 0) {
        continue;
      }

      const windowKey = occupiedBlockingWindowKey(job.scheduled_window);
      if (!windowKey) {
        continue;
      }

      const windows = occupiedByDate.get(dateKey) ?? new Set<string>();
      windows.add(windowKey);
      occupiedByDate.set(dateKey, windows);
    }

    const days = enumerateIsoDates(from, to).map((date) => ({
      date,
      slots: buildDaySlots(occupiedByDate.get(date) ?? new Set()),
    }));

    return {
      location,
      from,
      to,
      days,
    };
  }

  async isSlotAvailable(params: {
    organizationId: string;
    branchId: string;
    date: string;
    windowStart: string;
    windowEnd: string;
    provinceCode: "AB" | "ON";
  }) {
    const windowKey = formatScheduledWindowKey(params.windowStart, params.windowEnd);
    const { start: dayStart, end: dayEnd } = dayRangeUtc(params.date, params.provinceCode);

    const jobs = await this.dataSource.getRepository(JobEntity).find({
      where: {
        organization_id: params.organizationId,
        branch_id: params.branchId,
        status: In([...PHOENIX_SLOT_BLOCKING_JOB_STATUSES]),
        scheduled_for: And(MoreThanOrEqual(dayStart), LessThan(dayEnd)),
      },
      select: { scheduled_for: true, scheduled_window: true },
    });

    return !jobs.some((job) => {
      if (occupiedBlockingWindowKey(job.scheduled_window) !== windowKey) {
        return false;
      }
      if (!job.scheduled_for) {
        return false;
      }
      const scheduledAt = new Date(job.scheduled_for);
      return scheduledAt >= dayStart && scheduledAt < dayEnd;
    });
  }

  async submitRequest(payload: PhoenixRequestServicePayload, request: import("express").Request) {
    const organizationId = this.requireOrganizationId();
    const requestId = payload.requestId.trim().toLowerCase();
    if (!requestId) {
      apiError(400, "invalid_phoenix_request_service_payload", "requestId is required.");
    }

    const idempotencyKey = `${PHOENIX_RS_IDEMPOTENCY_PREFIX}${requestId}`;
    const lockName = createHash("sha256").update(`${organizationId}:${idempotencyKey}`).digest("hex");

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    let acquiredSlotLock: string | null = null;

    try {
      const lockRows = (await queryRunner.query("SELECT GET_LOCK(?, 10) AS acquired", [lockName])) as Array<{
        acquired: number | null;
      }>;
      if (Number(lockRows[0]?.acquired ?? 0) !== 1) {
        apiError(503, "phoenix_request_service_busy", "Request is already being processed. Please retry shortly.");
      }

      await queryRunner.startTransaction();
      const manager = queryRunner.manager;
      const submissionRepo = manager.getRepository(PublicBookingSubmissionEntity);

      const existingSubmission = await submissionRepo.findOne({
        where: { organization_id: organizationId, idempotency_key: idempotencyKey },
      });

      if (existingSubmission) {
        const replay = await this.resolveIdempotentBookingIdentity(
          manager,
          organizationId,
          existingSubmission,
        );
        await queryRunner.commitTransaction();
        return this.buildSuccessEnvelope({
          requestId,
          customerId: replay.customerId,
          leadId: replay.leadId,
          jobId: replay.jobId,
          request,
          organizationId,
          email: payload.customer.email,
        });
      }

      let branchId: string | null = null;
      let scheduledFor: Date | null = null;
      let scheduledWindow: string | null = null;
      let provinceCode: "AB" | "ON" = "AB";

      if (payload.scheduling) {
        const scheduling = payload.scheduling;
        const location = parsePhoenixRequestServiceLiveTimingLocation(scheduling.location);
        provinceCode = resolveBranchProvinceCodeForLocation(location);
        const date = scheduling.preferredDate.trim();
        if (!isIsoDate(date)) {
          apiError(400, "invalid_scheduling_date", "preferredDate must be YYYY-MM-DD.");
        }
        if (!isIsoDateWithinHorizon(date)) {
          apiError(400, "scheduling_outside_horizon", "preferredDate is outside the booking horizon.");
        }

        const window = findPhoenixTimeWindow(
          scheduling.timeWindow.start,
          scheduling.timeWindow.end,
        );
        if (!window) {
          apiError(400, "invalid_time_window", "timeWindow must be one of the approved service windows.");
        }

        const branch = await this.branchScopeService.findActiveBranchByCode(organizationId, provinceCode);
        if (!branch) {
          apiError(404, "branch_not_found", "Scheduling branch is not configured for this location.");
        }
        branchId = branch.id;

        const slotLock = createHash("sha256")
          .update(`phoenix-slot:${branchId}:${date}:${window.start}:${window.end}`)
          .digest("hex");
        const slotLockRows = (await queryRunner.query("SELECT GET_LOCK(?, 10) AS acquired", [
          slotLock,
        ])) as Array<{ acquired: number | null }>;
        if (Number(slotLockRows[0]?.acquired ?? 0) !== 1) {
          apiError(503, "phoenix_request_service_busy", "That time slot is being booked. Please retry.");
        }
        acquiredSlotLock = slotLock;

        const available = await this.isSlotAvailable({
          organizationId,
          branchId,
          date,
          windowStart: window.start,
          windowEnd: window.end,
          provinceCode,
        });

        if (!available) {
          apiError(409, "SLOT_UNAVAILABLE", "That time slot is no longer available. Please choose another.");
        }

        scheduledFor = scheduledForFromDateWindow(date, window.start, provinceCode);
        scheduledWindow = formatScheduledWindowKey(window.start, window.end);
      } else {
        provinceCode =
          normalizeServiceProvinceToBranchCode(payload.serviceAddress.region) ||
          normalizeServiceProvinceToBranchCode(payload.attribution.city) ||
          "AB";
        branchId = await this.branchScopeService.resolveBranchIdFromServiceProvince(
          organizationId,
          provinceCode,
        );
      }

      const customer = await this.findOrCreateCustomer(manager, organizationId, payload);
      const lead = await manager.getRepository(LeadEntity).save(
        manager.getRepository(LeadEntity).create({
          organization_id: organizationId,
          full_name: payload.customer.fullName,
          phone: payload.customer.phone,
          email: payload.customer.email,
          service_address_line_1: payload.serviceAddress.line1,
          service_address_line_2: payload.serviceAddress.line2,
          service_city: payload.serviceAddress.city,
          service_state_or_region: payload.serviceAddress.region,
          service_postal_code: payload.serviceAddress.postalCode,
          source: "website",
          service_type: payload.service.type,
          description: buildDescription(payload),
          customer_id: customer.id,
          created_by_auth_user_id: null,
        }),
      );

      let jobId: string | undefined;
      if (scheduledFor && scheduledWindow && branchId) {
        const job = await manager.getRepository(JobEntity).save(
          manager.getRepository(JobEntity).create({
            organization_id: organizationId,
            branch_id: branchId,
            customer_id: customer.id,
            service_id: null,
            assigned_technician_id: null,
            title: `${payload.service.originalService || payload.service.type} for ${payload.customer.fullName}`,
            description: buildDescription(payload),
            lead_source: "website",
            requested_service_type: payload.service.type,
            job_type: mapServiceTypeToDefaultJobType(payload.service.type),
            status: "scheduled",
            service_address_line_1: payload.serviceAddress.line1,
            service_address_line_2: payload.serviceAddress.line2,
            service_city: payload.serviceAddress.city,
            service_state_or_region: payload.serviceAddress.region,
            service_postal_code: payload.serviceAddress.postalCode,
            scheduled_for: scheduledFor,
            scheduled_window: scheduledWindow,
            requested_at: new Date(),
            created_by_auth_user_id: null,
            updated_by_auth_user_id: null,
          }),
        );
        jobId = job.id;
        lead.status = "converted";
        lead.converted_job_id = job.id;
        await manager.getRepository(LeadEntity).save(lead);
      }

      await submissionRepo.save(
        submissionRepo.create({
          organization_id: organizationId,
          idempotency_key: idempotencyKey,
          lead_id: lead.id,
          customer_id: customer.id,
          client_ip_hash: null,
          phone_last_10: payload.customer.phone.replace(/\D/g, "").slice(-10) || null,
        }),
      );

      await queryRunner.commitTransaction();

      if (acquiredSlotLock) {
        await queryRunner.query("SELECT RELEASE_LOCK(?)", [acquiredSlotLock]).catch(() => undefined);
        acquiredSlotLock = null;
      }

      return this.buildSuccessEnvelope({
        requestId,
        customerId: customer.id,
        leadId: lead.id,
        jobId,
        request,
        organizationId,
        email: payload.customer.email,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction().catch(() => undefined);

      if (isDuplicateEntryError(error)) {
        const raced = await this.dataSource.getRepository(PublicBookingSubmissionEntity).findOne({
          where: { organization_id: organizationId, idempotency_key: idempotencyKey },
        });
        if (raced) {
          const replay = await this.resolveIdempotentBookingIdentity(
            this.dataSource.manager,
            organizationId,
            raced,
          );
          return this.buildSuccessEnvelope({
            requestId,
            customerId: replay.customerId,
            leadId: replay.leadId,
            jobId: replay.jobId,
            request,
            organizationId,
            email: payload.customer.email,
          });
        }
      }

      throw error;
    } finally {
      if (acquiredSlotLock) {
        await queryRunner.query("SELECT RELEASE_LOCK(?)", [acquiredSlotLock]).catch(() => undefined);
      }
      await queryRunner.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => undefined);
      await queryRunner.release();
    }
  }

  private async resolveIdempotentBookingIdentity(
    manager: import("typeorm").EntityManager,
    organizationId: string,
    submission: PublicBookingSubmissionEntity,
  ) {
    const lead = await manager.getRepository(LeadEntity).findOne({
      where: { id: submission.lead_id, organization_id: organizationId },
      select: { id: true, customer_id: true, converted_job_id: true },
    });

    const customerId = submission.customer_id ?? lead?.customer_id ?? "";
    const jobId = lead?.converted_job_id?.trim() || undefined;

    return {
      customerId,
      leadId: submission.lead_id,
      jobId,
    };
  }

  private async buildSuccessEnvelope(params: {
    requestId: string;
    customerId: string;
    leadId: string;
    jobId?: string;
    request: import("express").Request;
    organizationId: string;
    email: string | null;
  }) {
    let portalAccess: { status: string; expiresAt: string | null } | undefined;

    if (params.email) {
      try {
        const minted = await this.customerPortalService.createMagicLinkForPhoenixIntegration({
          organizationId: params.organizationId,
          customerId: params.customerId || null,
          email: params.email,
          request: params.request,
        });
        portalAccess = {
          status: "sent",
          expiresAt: minted.expires_at ?? null,
        };
      } catch {
        portalAccess = { status: "email_failed", expiresAt: null };
      }
    }

    return {
      requestId: params.requestId,
      customerId: params.customerId,
      leadId: params.leadId,
      jobId: params.jobId,
      portalAccess,
    };
  }

  private async findOrCreateCustomer(
    manager: import("typeorm").EntityManager,
    organizationId: string,
    payload: PhoenixRequestServicePayload,
  ) {
    const customersRepo = manager.getRepository(CustomerEntity);
    const email = payload.customer.email?.trim() || null;
    const phone = payload.customer.phone.trim();

    if (email) {
      const byEmail = await customersRepo.findOne({
        where: { organization_id: organizationId, email },
      });
      if (byEmail) {
        return byEmail;
      }
    }

    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length >= 10) {
      const candidates = await customersRepo.find({
        where: { organization_id: organizationId },
        take: 50,
        order: { updated_at: "DESC" },
      });
      const match = candidates.find((candidate) => candidate.phone.replace(/\D/g, "").endsWith(phoneDigits.slice(-10)));
      if (match) {
        return match;
      }
    }

    return customersRepo.save(
      customersRepo.create({
        organization_id: organizationId,
        full_name: payload.customer.fullName,
        phone,
        email,
        service_address_line_1: payload.serviceAddress.line1,
        service_address_line_2: payload.serviceAddress.line2,
        service_city: payload.serviceAddress.city,
        service_state_or_region: payload.serviceAddress.region,
        service_postal_code: payload.serviceAddress.postalCode,
        source: "website",
        lifecycle_status: "prospect",
      }),
    );
  }
}
