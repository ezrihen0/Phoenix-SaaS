import { Body, Controller, Headers, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";

import { apiError, apiSuccess } from "../common/api-response";
import { hashClientIp, normalizePublicBookingIdempotencyKey } from "./public-booking-idempotency";
import { PublicBookingsService, type PublicBookingInput } from "./public-bookings.service";

type BookingPayload = {
  fullName?: unknown;
  phone?: unknown;
  email?: unknown;
  serviceAddressLine1?: unknown;
  serviceAddressLine2?: unknown;
  serviceCity?: unknown;
  serviceStateOrRegion?: unknown;
  servicePostalCode?: unknown;
  serviceType?: unknown;
  description?: unknown;
  source?: unknown;
};

function resolveClientIp(request: Request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }

  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(",")[0]?.trim() ?? null;
  }

  return request.ip ?? request.socket.remoteAddress ?? null;
}

@Controller("api/public")
export class PublicBookingsController {
  constructor(private readonly publicBookingsService: PublicBookingsService) {}

  @Post("orgs/:organizationSlug/bookings")
  async createBooking(
    @Param("organizationSlug") organizationSlug: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKeyHeader: string | undefined,
    @Req() request: Request,
  ) {
    const organization = await this.publicBookingsService.resolveActiveOrganizationBySlug(organizationSlug);
    const payload = this.parsePayload(body);

    if (idempotencyKeyHeader !== undefined && normalizePublicBookingIdempotencyKey(idempotencyKeyHeader) === null) {
      apiError(400, "invalid_idempotency_key", "Idempotency-Key must be 1-64 URL-safe characters.");
    }

    return apiSuccess(await this.publicBookingsService.createBooking({
      organizationId: organization.id,
      input: payload,
      idempotencyKeyHeader,
      clientIpHash: hashClientIp(resolveClientIp(request)),
    }));
  }

  private parsePayload(body: unknown): PublicBookingInput {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      apiError(400, "invalid_booking_payload", "Payload must be an object.");
    }

    const payload = body as BookingPayload;

    const source = this.requiredString(payload.source, "source", 24);
    if (source !== "website") {
      apiError(400, "invalid_booking_source", "source must be website.");
    }

    const serviceType = this.requiredString(payload.serviceType, "serviceType", 32);
    if (!["inspection", "cleaning", "repair", "rebuild"].includes(serviceType)) {
      apiError(400, "invalid_booking_service_type", "serviceType is invalid.");
    }

    return {
      fullName: this.requiredString(payload.fullName, "fullName", 255),
      phone: this.requiredString(payload.phone, "phone", 64),
      email: this.optionalString(payload.email, "email", 320),
      serviceAddressLine1: this.requiredString(payload.serviceAddressLine1, "serviceAddressLine1", 255),
      serviceAddressLine2: this.optionalString(payload.serviceAddressLine2, "serviceAddressLine2", 255),
      serviceCity: this.requiredString(payload.serviceCity, "serviceCity", 120),
      serviceStateOrRegion: this.optionalString(payload.serviceStateOrRegion, "serviceStateOrRegion", 120),
      servicePostalCode: this.requiredString(payload.servicePostalCode, "servicePostalCode", 20),
      serviceType: serviceType as PublicBookingInput["serviceType"],
      description: this.optionalString(payload.description, "description", 8000),
    };
  }

  private requiredString(value: unknown, fieldName: string, maxLength: number) {
    if (typeof value !== "string") {
      apiError(400, "invalid_booking_payload", `${fieldName} must be a string.`);
    }

    const normalized = value.trim();
    if (!normalized) {
      apiError(400, "invalid_booking_payload", `${fieldName} is required.`);
    }

    if (normalized.length > maxLength) {
      apiError(400, "invalid_booking_payload", `${fieldName} is too long.`);
    }

    return normalized;
  }

  private optionalString(value: unknown, fieldName: string, maxLength: number) {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== "string") {
      apiError(400, "invalid_booking_payload", `${fieldName} must be a string when provided.`);
    }

    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    if (normalized.length > maxLength) {
      apiError(400, "invalid_booking_payload", `${fieldName} is too long.`);
    }

    return normalized;
  }
}
