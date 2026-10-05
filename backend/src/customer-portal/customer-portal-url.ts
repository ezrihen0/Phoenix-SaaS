import type { ConfigService } from "@nestjs/config";

/**
 * Public hostname customers use for portal magic-link entry and portal pages.
 * Distinct from PUBLIC_BASE_URL (staff WizField application).
 *
 * Precedence: CUSTOMER_PORTAL_BASE_URL → PHOENIX_PORTAL_PUBLIC_BASE_URL → PUBLIC_BASE_URL → local dev default.
 */
export function resolveCustomerPortalBaseUrl(configService: ConfigService): string {
  const explicit = configService.get<string>("CUSTOMER_PORTAL_BASE_URL")?.trim().replace(/\/+$/, "");
  if (explicit) {
    return explicit;
  }

  const phoenixPortal = configService.get<string>("PHOENIX_PORTAL_PUBLIC_BASE_URL")?.trim().replace(/\/+$/, "");
  if (phoenixPortal) {
    return phoenixPortal;
  }

  const appBase = configService.get<string>("PUBLIC_BASE_URL")?.trim().replace(/\/+$/, "");
  if (appBase) {
    return appBase;
  }

  return "http://localhost:3000";
}

export type CustomerPortalAccessUrlOptions = {
  /** Invoice delivery links auto-redeem via POST after the magic page loads. */
  entry?: "invoice";
};

export function buildCustomerPortalAccessUrl(
  configService: ConfigService,
  rawToken: string,
  options?: CustomerPortalAccessUrlOptions,
): string {
  const token = rawToken.trim();
  const base = resolveCustomerPortalBaseUrl(configService);
  const params = new URLSearchParams({ token });
  if (options?.entry === "invoice") {
    params.set("entry", "invoice");
  }
  return `${base}/portal/auth/magic?${params.toString()}`;
}
