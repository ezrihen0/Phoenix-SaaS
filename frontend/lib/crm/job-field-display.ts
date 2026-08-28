import { formatAddress } from "@/lib/crm/display";
import { getJobStatusLabel, getServiceTypeLabel, type JobStatus } from "@/lib/crm/statuses";

export type RelatedValue<T> = T | T[] | null;

export function relationValue<T>(value: RelatedValue<T> | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function formatJobLocation(city: string, stateOrRegion: string | null) {
  const parts = [city, stateOrRegion].filter(Boolean);

  if (parts.length === 0) {
    return "—";
  }

  return parts.join(", ");
}

export function formatJobScheduleLabel(
  scheduledFor: string | null,
  scheduledWindow: string | null,
  locale: string,
  emptyLabel: string,
) {
  if (scheduledWindow?.trim()) {
    return scheduledWindow.trim();
  }

  if (!scheduledFor) {
    return emptyLabel;
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(scheduledFor));
}

export function formatJobTimeOnly(
  scheduledFor: string | null,
  locale: string,
  emptyLabel: string,
) {
  if (!scheduledFor) {
    return emptyLabel;
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(scheduledFor));
}

export function formatJobCurrency(cents: number | null | undefined, locale = "en-US") {
  if (cents === null || cents === undefined) {
    return null;
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatLifecycleStatus(status: string | null | undefined) {
  if (!status) {
    return null;
  }

  return status
    .split("_")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function jobStatusToneClass(status: JobStatus | string) {
  if (status === "cancelled") {
    return "theme-status-error";
  }

  if (status === "new_lead" || status === "contacted" || status === "waiting_for_approval") {
    return "theme-status-warning";
  }

  if (status === "completed" || status === "paid") {
    return "theme-status-success";
  }

  return "theme-status-info";
}

type PaymentSignalInput = {
  invoice?: { amount_cents: number; status: string } | null;
  quote?: { price_cents: number; status: string } | null;
  service?: { default_price_cents: number } | null;
};

export function getJobPaymentSignal(input: PaymentSignalInput): string | null {
  if (input.invoice) {
    const amount = formatJobCurrency(input.invoice.amount_cents);
    return `Invoice · ${formatLifecycleStatus(input.invoice.status)}${amount ? ` · ${amount}` : ""}`;
  }

  if (input.quote) {
    const amount = formatJobCurrency(input.quote.price_cents);
    return `Quote · ${formatLifecycleStatus(input.quote.status)}${amount ? ` · ${amount}` : ""}`;
  }

  if (input.service?.default_price_cents) {
    const amount = formatJobCurrency(input.service.default_price_cents);
    return amount ? `Est. ${amount}` : null;
  }

  return null;
}

export function buildJobAddressLabel(
  line1: string,
  line2: string | null,
  city: string,
  stateOrRegion: string | null,
  postalCode: string,
) {
  return formatAddress(line1, line2, city, stateOrRegion, postalCode);
}

export function buildJobServiceLabel(
  serviceName: string | null | undefined,
  requestedServiceType: string,
  locale?: string | null,
) {
  if (serviceName?.trim()) {
    return serviceName.trim();
  }

  return getServiceTypeLabel(requestedServiceType as never, locale ?? undefined);
}

export function buildJobStatusLabel(status: JobStatus, locale?: string | null) {
  return getJobStatusLabel(status, locale ?? undefined);
}

export type JobTypeValue = "inspection" | "installation_repair" | "callback_warranty";

export function getJobTypeLabel(jobType: JobTypeValue | string | null | undefined) {
  switch (jobType) {
    case "inspection":
      return "Inspection";
    case "installation_repair":
      return "Installation / Repair";
    case "callback_warranty":
      return "Callback / Warranty";
    default:
      return "—";
  }
}
