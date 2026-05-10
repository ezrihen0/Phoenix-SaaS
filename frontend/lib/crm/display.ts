export function formatAddress(
  line1: string,
  line2: string | null,
  city: string,
  stateOrRegion: string | null,
  postalCode: string,
) {
  return [line1, line2, [city, stateOrRegion].filter(Boolean).join(", "), postalCode]
    .filter(Boolean)
    .join(" • ");
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

export function formatDateTime(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function formatCallSourceLabel(value: string | null) {
  switch (value) {
    case "google":
      return "Google";
    case "website":
      return "Website";
    case "repeat_customer":
      return "Repeat Customer";
    case "phone":
      return "Phone";
    case "referral":
      return "Referral";
    case "other":
      return "Other";
    case "unknown":
    case null:
      return "Unknown";
    default:
      return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
  }
}

export function formatBusinessHoursStatusLabel(value: string | null) {
  switch (value) {
    case "open_hours":
      return "Open Hours";
    case "after_hours":
      return "After Hours";
    case null:
      return "";
    default:
      return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
  }
}

export function formatCallFlowActionLabel(value: string | null) {
  switch (value) {
    case "standard_answer":
      return "Standard Answer";
    case "dispatcher_queue":
      return "Dispatcher Queue";
    case "after_hours_message":
      return "After-Hours Message";
    case "voicemail":
      return "Voicemail";
    case "callback_queue":
      return "Callback Queue";
    case null:
      return "";
    default:
      return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
  }
}

function formatTokenLabel(value: string | null) {
  if (!value) {
    return "";
  }

  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatIvrStatusLabel(value: string | null) {
  switch (value) {
    case "gather_started":
      return "IVR Gather Started";
    case "gather_simulated":
      return "IVR Gather Simulated";
    case "valid_input":
      return "IVR Selection Captured";
    case "invalid_input":
      return "IVR Invalid Input";
    case "no_input":
      return "IVR No Input";
    case null:
      return "";
    default:
      return formatTokenLabel(value);
  }
}

export function formatRouteExecutionStatusLabel(value: string | null) {
  switch (value) {
    case "awaiting_ivr_input":
      return "Awaiting IVR Input";
    case "transfer_requested":
      return "Transfer Requested";
    case "transfer_simulated":
      return "Transfer Simulated";
    case "transfer_failed":
      return "Transfer Failed";
    case "message_played":
      return "After-Hours Message Played";
    case "message_simulated":
      return "After-Hours Message Simulated";
    case "voicemail_record_requested":
      return "Voicemail Requested";
    case "voicemail_simulated":
      return "Voicemail Simulated";
    case "route_skipped_missing_target":
      return "Route Target Missing";
    case null:
      return "";
    default:
      return formatTokenLabel(value);
  }
}

export function formatVoicemailStatusLabel(value: string | null) {
  switch (value) {
    case "recording_requested":
      return "Voicemail Recording Requested";
    case "recording_received":
      return "Voicemail Recording Received";
    case "available":
      return "Voicemail Available";
    case "simulated":
      return "Voicemail Simulated";
    case "recording_failed":
      return "Voicemail Recording Failed";
    case null:
      return "";
    default:
      return formatTokenLabel(value);
  }
}

export function formatQueueStatusLabel(value: string | null) {
  switch (value) {
    case "queued":
      return "In Queue";
    case "bridged":
      return "Queue Bridged";
    case "callback_requested":
      return "Queue Callback Requested";
    case "timeout":
      return "Queue Timed Out";
    case "abandoned":
      return "Queue Abandoned";
    case "exited":
      return "Queue Exited";
    case null:
      return "";
    default:
      return formatTokenLabel(value);
  }
}

export function formatAiStatusLabel(value: string | null) {
  switch (value) {
    case "completed":
      return "AI Ready";
    case "provider_hint":
      return "AI Provider Hint";
    case "pending":
      return "AI Pending";
    case "failed":
      return "AI Failed";
    case null:
      return "";
    default:
      return formatTokenLabel(value);
  }
}

export function formatAiSentimentLabel(value: string | null) {
  switch (value) {
    case "positive":
      return "Positive";
    case "neutral":
      return "Neutral";
    case "negative":
      return "Negative";
    case "mixed":
      return "Mixed";
    case null:
      return "";
    default:
      return formatTokenLabel(value);
  }
}

export function formatSelectedServiceTypeLabel(value: string | null) {
  switch (value) {
    case "inspection":
      return "Inspection";
    case "cleaning":
      return "Cleaning";
    case "repair":
      return "Repair";
    case "rebuild":
      return "Rebuild";
    case null:
      return "";
    default:
      return formatTokenLabel(value);
  }
}