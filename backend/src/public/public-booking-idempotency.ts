import { createHash } from "crypto";

import type { PublicBookingInput } from "./public-bookings.service";

export const PUBLIC_BOOKING_IDEMPOTENCY_KEY_MAX_LENGTH = 64;
export const PUBLIC_BOOKING_MAX_SUBMISSIONS_PER_HOUR = 10;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizePublicBookingIdempotencyKey(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > PUBLIC_BOOKING_IDEMPOTENCY_KEY_MAX_LENGTH) {
    return null;
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export function derivePublicBookingFingerprint(organizationId: string, input: PublicBookingInput) {
  const email = input.email?.trim().toLowerCase() ?? null;
  const phoneDigits = lastTenDigits(input.phone);

  return createHash("sha256").update(JSON.stringify({
    organizationId,
    fullName: input.fullName.trim().toLowerCase(),
    phoneLast10: phoneDigits,
    email,
    serviceAddressLine1: input.serviceAddressLine1.trim().toLowerCase(),
    serviceAddressLine2: input.serviceAddressLine2?.trim().toLowerCase() ?? null,
    serviceCity: input.serviceCity.trim().toLowerCase(),
    serviceStateOrRegion: input.serviceStateOrRegion?.trim().toLowerCase() ?? null,
    servicePostalCode: input.servicePostalCode.trim().toLowerCase(),
    serviceType: input.serviceType,
    description: input.description?.trim() ?? null,
    source: "website",
  })).digest("hex");
}

export function hashClientIp(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return createHash("sha256").update(normalized).digest("hex");
}

export function lastTenDigits(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export function resolvePublicBookingIdempotencyKey(
  organizationId: string,
  input: PublicBookingInput,
  headerValue: string | null | undefined,
) {
  return normalizePublicBookingIdempotencyKey(headerValue)
    ?? derivePublicBookingFingerprint(organizationId, input);
}
