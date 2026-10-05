import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";

import { apiError, apiSuccess } from "../../common/api-response";
import type { RequestWithPortalSession } from "../../common/request-types";
import type { ServiceType } from "../../crm/constants";
import { PortalSessionGuard } from "../../customer-portal/portal-session.guard";
import { PortalCustomerAddressesService } from "../../customer-portal/portal-customer-addresses.service";
import { PortalIdentityService } from "../../customer-portal/portal-identity.service";
import { CustomerEntity } from "../../database/entities/customer.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { normalizeEmail } from "../../database/workiz/workiz-invoice-parser";
import {
  PhoenixRequestServiceIntegrationService,
  type PhoenixRequestServicePayload,
} from "./phoenix-request-service-integration.service";

const PHOENIX_SERVICE_TYPES = new Set<ServiceType>(["inspection", "cleaning", "repair", "rebuild"]);

@Controller("api/portal/request-service")
@UseGuards(PortalSessionGuard)
export class PhoenixPortalRequestServiceController {
  constructor(
    private readonly phoenixRequestService: PhoenixRequestServiceIntegrationService,
    private readonly portalCustomerAddressesService: PortalCustomerAddressesService,
    private readonly portalIdentityService: PortalIdentityService,
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
  ) {}

  @Get("context")
  async getContext(@Req() request: RequestWithPortalSession) {
    const session = request.portalSession!.session;
    const organizationId = session.organization_id?.trim() ?? "";
    const customerId = session.customer_id;
    if (!organizationId) {
      apiError(400, "portal_session_org_missing", "Portal session is missing organization context.");
    }

    const customer = await this.customersRepository.findOne({
      where: { id: customerId, organization_id: organizationId },
    });
    if (!customer) {
      apiError(404, "customer_not_found", "Customer not found.");
    }

    const addresses = await this.portalCustomerAddressesService.listAddressesForCustomer(
      organizationId,
      customerId,
    );

    return apiSuccess({
      customer: {
        id: customer.id,
        fullName: customer.full_name,
        phone: customer.phone,
        email: customer.email,
      },
      addresses,
    });
  }

  @Get("availability")
  async getAvailability(
    @Query("location") location: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    const range = await this.phoenixRequestService.getAvailabilityRange(location, from, to);
    return apiSuccess(range);
  }

  @Get("availability/day")
  async getAvailabilityDay(@Query("location") location: string, @Query("date") date: string) {
    const day = await this.phoenixRequestService.getAvailability(location, date);
    return apiSuccess(day);
  }

  @Post()
  async submit(@Body() body: Record<string, unknown>, @Req() request: RequestWithPortalSession) {
    if ("customerId" in body) {
      apiError(400, "invalid_portal_request_service_payload", "customerId must not be supplied.");
    }

    const session = request.portalSession!.session;
    const organizationId = session.organization_id?.trim() ?? "";
    const customerId = session.customer_id;
    if (!organizationId) {
      apiError(400, "portal_session_org_missing", "Portal session is missing organization context.");
    }

    const customer = await this.customersRepository.findOne({
      where: { id: customerId, organization_id: organizationId },
    });
    if (!customer) {
      apiError(404, "customer_not_found", "Customer not found.");
    }

    await this.applyOptionalProfileUpdate(customer, body);

    const addresses = await this.portalCustomerAddressesService.listAddressesForCustomer(
      organizationId,
      customer.id,
    );
    const payload = this.parsePortalSubmitBody(body, customer, addresses);
    const result = await this.phoenixRequestService.submitRequestForPortalCustomer(
      organizationId,
      customer.id,
      payload,
      request as Request,
    );

    return apiSuccess(result);
  }

  private async applyOptionalProfileUpdate(customer: CustomerEntity, body: Record<string, unknown>) {
    const updateRaw = body.customerProfileUpdate;
    if (!updateRaw || typeof updateRaw !== "object") {
      return;
    }

    const update = updateRaw as Record<string, unknown>;
    const saveAsPrimary = update.saveAsPrimaryAddress === true;
    const addressRaw = update.address;
    if (addressRaw && typeof addressRaw === "object") {
      const address = addressRaw as Record<string, unknown>;
      if (saveAsPrimary) {
        customer.service_address_line_1 = readRequiredString(address.line1, "address.line1");
        customer.service_address_line_2 = readOptionalString(address.line2);
        customer.service_city = readRequiredString(address.city, "address.city");
        customer.service_state_or_region = readOptionalString(address.region);
        customer.service_postal_code = readRequiredString(address.postalCode, "address.postalCode");
      }
    }

    if (typeof update.fullName === "string" && update.fullName.trim()) {
      customer.full_name = update.fullName.trim();
    }
    if (typeof update.phone === "string" && update.phone.trim()) {
      customer.phone = update.phone.trim();
    }
    if (typeof update.email === "string" && update.email.trim()) {
      const normalized = normalizeEmail(update.email);
      if (!normalized) {
        apiError(400, "invalid_customer_email", "Email is not valid.");
      }
      customer.email = normalized;
    }

    await this.customersRepository.save(customer);
    await this.portalIdentityService.ensurePortalIdentityForCustomer(customer.id);
  }

  private parsePortalSubmitBody(
    body: Record<string, unknown>,
    customer: CustomerEntity,
    addresses: Awaited<ReturnType<PortalCustomerAddressesService["listAddressesForCustomer"]>>,
  ): PhoenixRequestServicePayload {
    const requestId = readRequiredString(body.requestId, "requestId").toLowerCase();
    const serviceRaw = body.service;
    if (!serviceRaw || typeof serviceRaw !== "object") {
      apiError(400, "invalid_portal_request_service_payload", "service is required.");
    }
    const service = serviceRaw as Record<string, unknown>;
    const serviceType = readRequiredString(service.type, "service.type") as ServiceType;
    if (!PHOENIX_SERVICE_TYPES.has(serviceType)) {
      apiError(400, "invalid_portal_request_service_payload", "service.type is not supported.");
    }

    let serviceAddress: PhoenixRequestServicePayload["serviceAddress"];
    if (body.newAddress && typeof body.newAddress === "object") {
      const row = body.newAddress as Record<string, unknown>;
      serviceAddress = {
        line1: readRequiredString(row.line1, "newAddress.line1"),
        line2: readOptionalString(row.line2),
        city: readRequiredString(row.city, "newAddress.city"),
        region: readOptionalString(row.region),
        postalCode: readRequiredString(row.postalCode, "newAddress.postalCode"),
      };
    } else {
      const selectedId = typeof body.selectedAddressId === "string" ? body.selectedAddressId.trim() : "primary";
      const selected = addresses.find((row) => row.id === selectedId);
      if (!selected) {
        apiError(400, "invalid_portal_request_service_payload", "selectedAddressId is not valid.");
      }
      serviceAddress = {
        line1: selected.line1,
        line2: selected.line2,
        city: selected.city,
        region: selected.region,
        postalCode: selected.postalCode,
      };
    }

    const requestRaw = body.request;
    const requestBlock =
      requestRaw && typeof requestRaw === "object"
        ? (requestRaw as Record<string, unknown>)
        : {};

    const scheduling = parseScheduling(body.scheduling);

    return {
      requestId,
      customer: {
        fullName: customer.full_name,
        phone: customer.phone,
        email: customer.email,
      },
      serviceAddress,
      service: {
        type: serviceType,
        originalService: readOptionalString(service.originalService),
      },
      request: {
        description: readOptionalString(requestBlock.description),
        urgency: readOptionalString(requestBlock.urgency),
        preferredDay: readOptionalString(requestBlock.preferredDay),
        preferredTime: readOptionalString(requestBlock.preferredTime),
      },
      attribution: {
        source: "website",
        city: readOptionalString(body.city),
        cta: "portal-repeat-booking",
        sourceUrl: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
      },
      scheduling,
    };
  }
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    apiError(400, "invalid_portal_request_service_payload", `${field} is required.`);
  }
  return value.trim();
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function parseScheduling(value: unknown): PhoenixRequestServicePayload["scheduling"] {
  if (value == null) {
    return null;
  }
  if (typeof value !== "object") {
    apiError(400, "invalid_portal_request_service_payload", "scheduling must be an object.");
  }
  const scheduling = value as Record<string, unknown>;
  const timeWindowRaw = scheduling.timeWindow;
  if (!timeWindowRaw || typeof timeWindowRaw !== "object") {
    apiError(400, "invalid_portal_request_service_payload", "scheduling.timeWindow is required.");
  }
  const timeWindow = timeWindowRaw as Record<string, unknown>;
  return {
    location: readRequiredString(scheduling.location, "scheduling.location") as "calgary" | "ottawa",
    preferredDate: readRequiredString(scheduling.preferredDate, "scheduling.preferredDate"),
    timeWindow: {
      start: readRequiredString(timeWindow.start, "scheduling.timeWindow.start"),
      end: readRequiredString(timeWindow.end, "scheduling.timeWindow.end"),
    },
  };
}
