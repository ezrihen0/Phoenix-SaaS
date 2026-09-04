/** Domains permanently excluded from Phoenix Workiz historical import/reconciliation. */
export const EXCLUDED_WORKIZ_EMAIL_DOMAINS = ["allfix.ca"] as const;

export function isExcludedWorkizCustomerEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const normalized = email.trim().toLowerCase();
  return EXCLUDED_WORKIZ_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}

export function isExcludedWorkizCustomer(input: { email?: string | null }): boolean {
  return isExcludedWorkizCustomerEmail(input.email);
}

export function excludedWorkizCustomerReason(email: string | null | undefined): string {
  return `Excluded email domain (@${EXCLUDED_WORKIZ_EMAIL_DOMAINS.join(", @")}): ${email ?? "(none)"}`;
}
