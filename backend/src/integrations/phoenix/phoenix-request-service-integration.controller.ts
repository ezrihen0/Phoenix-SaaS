import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";

import { apiError, apiSuccess } from "../../common/api-response";
import type { ServiceType } from "../../crm/constants";
import { PhoenixIntegrationGuard } from "./phoenix-integration.guard";
import { parsePhoenixRequestServiceLiveTimingLocation } from "./phoenix-location-resolution";
import { PhoenixRequestServiceIntegrationService } from "./phoenix-request-service-integration.service";

type RequestServiceBody = {
  requestId?: unknown;
  customer?: unknown;
  serviceAddress?: unknown;
  service?: unknown;
  request?: unknown;
  attribution?: unknown;
  scheduling?: unknown;
};

const PHOENIX_SERVICE_TYPES = new Set<ServiceType>(["inspection", "cleaning", "repair", "rebuild"]);

function readString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    apiError(400, "invalid_phoenix_request_service_payload", `${field} is required.`);
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

function parseRequestServiceBody(body: RequestServiceBody) {
  const requestId = readString(body.requestId, "requestId");
  const customerRaw = body.customer;
  const serviceAddressRaw = body.serviceAddress;
  const serviceRaw = body.service;
  const requestRaw = body.request;
  const attributionRaw = body.attribution;

  if (!customerRaw || typeof customerRaw !== "object") {
    apiError(400, "invalid_phoenix_request_service_payload", "customer is required.");
  }
  if (!serviceAddressRaw || typeof serviceAddressRaw !== "object") {
    apiError(400, "invalid_phoenix_request_service_payload", "serviceAddress is required.");
  }
  if (!serviceRaw || typeof serviceRaw !== "object") {
    apiError(400, "invalid_phoenix_request_service_payload", "service is required.");
  }
  if (!requestRaw || typeof requestRaw !== "object") {
    apiError(400, "invalid_phoenix_request_service_payload", "request is required.");
  }
  if (!attributionRaw || typeof attributionRaw !== "object") {
    apiError(400, "invalid_phoenix_request_service_payload", "attribution is required.");
  }

  const customer = customerRaw as Record<string, unknown>;
  const serviceAddress = serviceAddressRaw as Record<string, unknown>;
  const service = serviceRaw as Record<string, unknown>;
  const request = requestRaw as Record<string, unknown>;
  const attribution = attributionRaw as Record<string, unknown>;

  const serviceType = readString(service.type, "service.type") as ServiceType;
  if (!PHOENIX_SERVICE_TYPES.has(serviceType)) {
    apiError(400, "invalid_phoenix_request_service_payload", "service.type is not supported.");
  }

  let scheduling:
    | {
        location: "calgary" | "ottawa";
        preferredDate: string;
        timeWindow: { start: string; end: string };
      }
    | undefined;

  if (body.scheduling != null) {
    if (typeof body.scheduling !== "object") {
      apiError(400, "invalid_phoenix_request_service_payload", "scheduling must be an object.");
    }
    const schedulingRaw = body.scheduling as Record<string, unknown>;
    const location = readString(schedulingRaw.location, "scheduling.location");
    parsePhoenixRequestServiceLiveTimingLocation(location);
    const preferredDate = readString(schedulingRaw.preferredDate, "scheduling.preferredDate");
    const timeWindowRaw = schedulingRaw.timeWindow;
    if (!timeWindowRaw || typeof timeWindowRaw !== "object") {
      apiError(400, "invalid_phoenix_request_service_payload", "scheduling.timeWindow is required.");
    }
    const timeWindow = timeWindowRaw as Record<string, unknown>;
    scheduling = {
      location: location as "calgary" | "ottawa",
      preferredDate,
      timeWindow: {
        start: readString(timeWindow.start, "scheduling.timeWindow.start"),
        end: readString(timeWindow.end, "scheduling.timeWindow.end"),
      },
    };
  }

  return {
    requestId,
    customer: {
      fullName: readString(customer.fullName, "customer.fullName"),
      phone: readString(customer.phone, "customer.phone"),
      email: readOptionalString(customer.email),
    },
    serviceAddress: {
      line1: readString(serviceAddress.line1, "serviceAddress.line1"),
      line2: readOptionalString(serviceAddress.line2),
      city: readString(serviceAddress.city, "serviceAddress.city"),
      region: readOptionalString(serviceAddress.region),
      postalCode: readString(serviceAddress.postalCode, "serviceAddress.postalCode"),
    },
    service: {
      type: serviceType,
      originalService: readOptionalString(service.originalService),
    },
    request: {
      description: readOptionalString(request.description),
      urgency: readOptionalString(request.urgency),
      preferredDay: readOptionalString(request.preferredDay),
      preferredTime: readOptionalString(request.preferredTime),
    },
    attribution: {
      source: "website" as const,
      city: readOptionalString(attribution.city),
      cta: readOptionalString(attribution.cta),
      sourceUrl: readOptionalString(attribution.sourceUrl),
      utmSource: readOptionalString(attribution.utmSource),
      utmMedium: readOptionalString(attribution.utmMedium),
      utmCampaign: readOptionalString(attribution.utmCampaign),
    },
    scheduling,
  };
}

@Controller("api/integrations/phoenix")
@UseGuards(PhoenixIntegrationGuard)
export class PhoenixRequestServiceIntegrationController {
  constructor(private readonly phoenixRequestServiceIntegrationService: PhoenixRequestServiceIntegrationService) {}

  @Get("request-service/availability")
  async getAvailability(
    @Query("location") location: string,
    @Query("date") date: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
  ) {
    if (from?.trim() && to?.trim()) {
      const availability = await this.phoenixRequestServiceIntegrationService.getAvailabilityRange(
        location,
        from,
        to,
      );
      return apiSuccess(availability);
    }

    if (date?.trim()) {
      const availability = await this.phoenixRequestServiceIntegrationService.getAvailability(location, date);
      return apiSuccess(availability);
    }

    apiError(400, "invalid_availability_query", "Provide date or from and to query parameters.");
  }

  @Post("request-service")
  async submitRequest(@Body() body: RequestServiceBody, @Req() request: Request) {
    const payload = parseRequestServiceBody(body);
    const result = await this.phoenixRequestServiceIntegrationService.submitRequest(payload, request);
    return apiSuccess(result);
  }
}
