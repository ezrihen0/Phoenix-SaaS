import { getDefaultWorkerUiLocale, resolveSupportedWorkerUiLocale } from "@/lib/i18n/locales";
import { formatLocalizedDate } from "@/lib/i18n/formatters";

function normalizedLocale(locale?: string | null) {
  return resolveSupportedWorkerUiLocale(locale ?? getDefaultWorkerUiLocale());
}

export function formatAddress(
  line1: string,
  line2: string | null,
  city: string,
  stateOrRegion: string | null,
  postalCode: string,
) {
  return [line1, line2, [city, stateOrRegion].filter(Boolean).join(", "), postalCode]
    .filter(Boolean)
    .join(" | ");
}

export function buildAddressQuery(
  line1: string,
  line2: string | null,
  city: string,
  stateOrRegion: string | null,
  postalCode: string,
) {
  return [line1, line2, city, stateOrRegion, postalCode]
    .filter(Boolean)
    .join(", ");
}

export function buildGoogleMapsSearchUrl(addressQuery: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`;
}

export function formatDateTime(value: string | null, locale?: string | null, emptyLabel = "Not scheduled") {
  if (!value) {
    return emptyLabel;
  }

  return formatLocalizedDate(value, normalizedLocale(locale), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(value: string, locale?: string | null) {
  return formatLocalizedDate(value, normalizedLocale(locale), {
    month: "short",
    day: "numeric",
  });
}

function localizedToken(
  value: string | null,
  localized: Record<string, string>,
  emptyValue = "",
) {
  if (value === null) {
    return emptyValue;
  }

  return localized[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

const tokenLabels = {
  en: {
    google: "Google",
    website: "Website",
    repeat_customer: "Repeat Customer",
    phone: "Phone",
    referral: "Referral",
    other: "Other",
    unknown: "Unknown",
    open_hours: "Open Hours",
    after_hours: "After Hours",
    standard_answer: "Standard Answer",
    dispatcher_queue: "Dispatcher Queue",
    after_hours_message: "After-Hours Message",
    voicemail: "Voicemail",
    callback_queue: "Callback Queue",
    gather_started: "IVR Gather Started",
    gather_simulated: "IVR Gather Simulated",
    valid_input: "IVR Selection Captured",
    invalid_input: "IVR Invalid Input",
    no_input: "IVR No Input",
    awaiting_ivr_input: "Awaiting IVR Input",
    transfer_requested: "Transfer Requested",
    transfer_simulated: "Transfer Simulated",
    transfer_failed: "Transfer Failed",
    message_played: "After-Hours Message Played",
    message_simulated: "After-Hours Message Simulated",
    voicemail_record_requested: "Voicemail Requested",
    voicemail_simulated: "Voicemail Simulated",
    route_skipped_missing_target: "Route Target Missing",
    recording_requested: "Voicemail Recording Requested",
    recording_received: "Voicemail Recording Received",
    available: "Voicemail Available",
    simulated: "Voicemail Simulated",
    recording_failed: "Voicemail Recording Failed",
    queued: "In Queue",
    bridged: "Queue Bridged",
    callback_requested: "Queue Callback Requested",
    timeout: "Queue Timed Out",
    abandoned: "Queue Abandoned",
    exited: "Queue Exited",
    completed: "AI Ready",
    provider_hint: "AI Provider Hint",
    pending: "AI Pending",
    failed: "AI Failed",
    positive: "Positive",
    neutral: "Neutral",
    negative: "Negative",
    mixed: "Mixed",
    inspection: "Inspection",
    cleaning: "Cleaning",
    repair: "Repair",
    rebuild: "Rebuild",
  },
} as const;

function englishTokens() {
  return tokenLabels.en;
}

export function formatCallSourceLabel(value: string | null) {
  return localizedToken(value, englishTokens(), "Unknown");
}

export function formatBusinessHoursStatusLabel(value: string | null) {
  return localizedToken(value, englishTokens());
}

export function formatCallFlowActionLabel(value: string | null) {
  return localizedToken(value, englishTokens());
}

export function formatIvrStatusLabel(value: string | null) {
  return localizedToken(value, englishTokens());
}

export function formatRouteExecutionStatusLabel(value: string | null) {
  return localizedToken(value, englishTokens());
}

export function formatVoicemailStatusLabel(value: string | null) {
  return localizedToken(value, englishTokens());
}

export function formatQueueStatusLabel(value: string | null) {
  return localizedToken(value, englishTokens());
}

export function formatAiStatusLabel(value: string | null) {
  return localizedToken(value, englishTokens());
}

export function formatAiSentimentLabel(value: string | null) {
  return localizedToken(value, englishTokens());
}

export function formatSelectedServiceTypeLabel(value: string | null) {
  return localizedToken(value, englishTokens());
}
