import { getLeadSourceLabel, getServiceTypeLabel, type LeadSource, type LeadStatus } from "@/lib/crm/statuses";

export type LeadDispositionReason =
  | "price"
  | "no_availability"
  | "researching"
  | "no_response"
  | "outside_area"
  | "other_company"
  | "other";

export type LeadQueueItem = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  service_address_line_1: string;
  service_address_line_2: string | null;
  service_city: string;
  service_state_or_region: string | null;
  service_postal_code: string;
  source: LeadSource;
  service_type: "inspection" | "cleaning" | "repair" | "rebuild";
  description: string | null;
  status: LeadStatus;
  converted_job_id: string | null;
  customer_id: string | null;
  created_by_auth_user_id: string | null;
  disposition: "not_booked" | null;
  disposition_reason: LeadDispositionReason | null;
  disposition_note: string | null;
  disposition_at: string | null;
  disposition_by_auth_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InboxBucket = "all" | "new" | "contacted" | "added_to_job" | "not_booked";

export type InboxDateFilter = "all" | "today" | "7d" | "30d";

export type InboxSummaryCounts = {
  new: number;
  contacted: number;
  addedToJob: number;
  notBooked: number;
};

export function isLeadNotBooked(lead: LeadQueueItem) {
  return lead.disposition === "not_booked";
}

export function isLeadAddedToJob(lead: LeadQueueItem) {
  return lead.status === "converted" || Boolean(lead.converted_job_id);
}

export function isLeadOpen(lead: LeadQueueItem) {
  return !isLeadNotBooked(lead) && !isLeadAddedToJob(lead);
}

export function getInboxBucket(lead: LeadQueueItem): Exclude<InboxBucket, "all"> {
  if (isLeadNotBooked(lead)) {
    return "not_booked";
  }

  if (isLeadAddedToJob(lead)) {
    return "added_to_job";
  }

  if (lead.status === "contacted") {
    return "contacted";
  }

  return "new";
}

export function getInboxStatusLabel(lead: LeadQueueItem) {
  switch (getInboxBucket(lead)) {
    case "not_booked":
      return "Not Booked";
    case "added_to_job":
      return "Added to Job";
    case "contacted":
      return "Contacted";
    default:
      return "New";
  }
}

export function getLeadNeedLabel(lead: LeadQueueItem, locale?: string | null) {
  const description = lead.description?.trim();

  if (description) {
    return description.split("\n")[0]?.trim() || description;
  }

  return getServiceTypeLabel(lead.service_type, locale);
}

export function formatLeadCity(lead: LeadQueueItem) {
  return lead.service_city?.trim() || "—";
}

export function formatLeadAgeShort(value: string) {
  const diffMs = Math.max(0, Date.now() - new Date(value).getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatLeadReceivedLabel(lead: LeadQueueItem) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(lead.created_at));
}

export function formatLeadAddress(lead: LeadQueueItem) {
  const lines = [
    lead.service_address_line_1,
    lead.service_address_line_2,
    [lead.service_city, lead.service_state_or_region].filter(Boolean).join(", "),
    lead.service_postal_code,
  ].filter(Boolean);

  return lines.join("\n");
}

export function getDispositionReasonLabel(reason: LeadDispositionReason) {
  switch (reason) {
    case "price":
      return "Price";
    case "no_availability":
      return "No availability";
    case "researching":
      return "Just researching";
    case "no_response":
      return "No response";
    case "outside_area":
      return "Outside service area";
    case "other_company":
      return "Chose another company";
    default:
      return "Other";
  }
}

export const DISPOSITION_REASONS: LeadDispositionReason[] = [
  "price",
  "no_availability",
  "researching",
  "no_response",
  "outside_area",
  "other_company",
  "other",
];

export function leadMatchesInboxSearch(lead: LeadQueueItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [
    lead.full_name,
    lead.phone,
    lead.email,
    lead.service_city,
    lead.description,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function matchesDateFilter(lead: LeadQueueItem, dateFilter: InboxDateFilter) {
  if (dateFilter === "all") {
    return true;
  }

  const createdAt = new Date(lead.created_at);

  if (Number.isNaN(createdAt.getTime())) {
    return false;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (dateFilter === "today") {
    return createdAt >= startOfToday;
  }

  const days = dateFilter === "7d" ? 7 : 30;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return createdAt >= cutoff;
}

export function filterLeadsInbox(
  leads: LeadQueueItem[],
  {
    search,
    bucket,
    source,
    dateFilter,
  }: {
    search: string;
    bucket: InboxBucket;
    source: LeadSource | "all";
    dateFilter: InboxDateFilter;
  },
) {
  return leads.filter((lead) => {
    if (bucket !== "all" && getInboxBucket(lead) !== bucket) {
      return false;
    }

    if (source !== "all" && lead.source !== source) {
      return false;
    }

    if (!matchesDateFilter(lead, dateFilter)) {
      return false;
    }

    return leadMatchesInboxSearch(lead, search);
  });
}

export function buildInboxSummaryCounts(leads: LeadQueueItem[]): InboxSummaryCounts {
  return leads.reduce<InboxSummaryCounts>(
    (counts, lead) => {
      switch (getInboxBucket(lead)) {
        case "not_booked":
          counts.notBooked += 1;
          break;
        case "added_to_job":
          counts.addedToJob += 1;
          break;
        case "contacted":
          counts.contacted += 1;
          break;
        default:
          counts.new += 1;
          break;
      }

      return counts;
    },
    { new: 0, contacted: 0, addedToJob: 0, notBooked: 0 },
  );
}

export function getInboxStatusToneClass(lead: LeadQueueItem) {
  switch (getInboxBucket(lead)) {
    case "not_booked":
      return "text-[color:var(--text-muted)]";
    case "added_to_job":
      return "text-emerald-700";
    case "contacted":
      return "text-sky-700";
    default:
      return "text-[color:var(--sem-accent-primary)]";
  }
}

export function getLeadSourceDisplayLabel(source: LeadSource, locale?: string | null) {
  return getLeadSourceLabel(source, locale);
}
