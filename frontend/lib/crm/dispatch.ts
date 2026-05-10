import { formatAddress } from "@/lib/crm/display";
import { getJobStatusLabel, getServiceTypeLabel, type JobStatus } from "@/lib/crm/statuses";

export type DispatchCustomerRecord = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
};

export type DispatchTechnicianRecord = {
  id: string;
  display_name: string;
  phone: string | null;
  specialties: string[];
  is_active: boolean;
  last_seen_at: string | null;
};

export type DispatchServiceRecord = {
  id: string;
  name: string;
  description: string | null;
  service_type: "inspection" | "cleaning" | "repair" | "rebuild";
  default_price_cents: number;
  duration_minutes: number;
};

export type DispatchRelatedValue<T> = T | T[] | null;

export type DispatchJobRecord = {
  id: string;
  assigned_technician_id: string | null;
  title: string;
  description: string | null;
  requested_service_type: DispatchServiceRecord["service_type"];
  status: JobStatus;
  service_address_line_1: string;
  service_address_line_2: string | null;
  service_city: string;
  service_state_or_region: string | null;
  service_postal_code: string;
  scheduled_for: string | null;
  scheduled_window: string | null;
  created_at: string;
  updated_at: string;
  customer: DispatchRelatedValue<DispatchCustomerRecord>;
  service: DispatchRelatedValue<DispatchServiceRecord>;
  technician: DispatchRelatedValue<DispatchTechnicianRecord>;
};

export type DispatchStop = {
  id: string;
  title: string;
  description: string | null;
  customerLabel: string;
  customerPhone: string | null;
  serviceLabel: string;
  statusLabel: string;
  technicianId: string | null;
  technicianLabel: string;
  scheduledDayKey: string | null;
  scheduledDayLabel: string;
  scheduledTimeLabel: string;
  scheduledWindow: string | null;
  addressLabel: string;
  addressQuery: string;
  googleMapsUrl: string;
};

export type DispatchTechnicianCluster = {
  technicianId: string | null;
  technicianLabel: string;
  stopCount: number;
  stops: DispatchStop[];
};

export type DispatchDayGroup = {
  dayKey: string | null;
  dayLabel: string;
  stopCount: number;
  technicians: DispatchTechnicianCluster[];
};

export type DispatchOptimizationSeed = {
  generatedAt: string;
  stopCount: number;
  dayCount: number;
  technicianCount: number;
  stops: Array<{
    stopId: string;
    scheduledDayKey: string | null;
    technicianId: string | null;
    addressQuery: string;
    googleMapsUrl: string;
  }>;
};

function relationValue<T>(value: DispatchRelatedValue<T> | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatDayLabel(value: string | null) {
  if (!value) {
    return "Unscheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function formatTimeLabel(value: string | null) {
  if (!value) {
    return "Time not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildAddressQuery(job: DispatchJobRecord) {
  return [
    job.service_address_line_1,
    job.service_address_line_2,
    job.service_city,
    job.service_state_or_region,
    job.service_postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildGoogleMapsSearchUrl(addressQuery: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`;
}

export function buildDispatchStop(job: DispatchJobRecord): DispatchStop {
  const customer = relationValue(job.customer);
  const technician = relationValue(job.technician);
  const scheduledDayKey = job.scheduled_for ? job.scheduled_for.slice(0, 10) : null;
  const addressQuery = buildAddressQuery(job);

  return {
    id: job.id,
    title: job.title,
    description: job.description,
    customerLabel: customer?.full_name ?? "Customer",
    customerPhone: customer?.phone ?? null,
    serviceLabel: getServiceTypeLabel(job.requested_service_type),
    statusLabel: getJobStatusLabel(job.status),
    technicianId: technician?.id ?? job.assigned_technician_id,
    technicianLabel: technician?.display_name ?? "Unassigned",
    scheduledDayKey,
    scheduledDayLabel: formatDayLabel(job.scheduled_for),
    scheduledTimeLabel: formatTimeLabel(job.scheduled_for),
    scheduledWindow: job.scheduled_window,
    addressLabel: formatAddress(
      job.service_address_line_1,
      job.service_address_line_2,
      job.service_city,
      job.service_state_or_region,
      job.service_postal_code,
    ),
    addressQuery,
    googleMapsUrl: buildGoogleMapsSearchUrl(addressQuery),
  };
}

export function buildDispatchDayGroups(stops: DispatchStop[]): DispatchDayGroup[] {
  const dayMap = new Map<string, DispatchStop[]>();

  for (const stop of stops) {
    const dayKey = stop.scheduledDayKey ?? "unscheduled";
    const existingStops = dayMap.get(dayKey) ?? [];
    existingStops.push(stop);
    dayMap.set(dayKey, existingStops);
  }

  return [...dayMap.entries()]
    .sort(([leftKey], [rightKey]) => {
      if (leftKey === "unscheduled") {
        return 1;
      }

      if (rightKey === "unscheduled") {
        return -1;
      }

      return leftKey.localeCompare(rightKey);
    })
    .map(([dayKey, groupedStops]) => {
      const technicianMap = new Map<string, DispatchStop[]>();

      for (const stop of groupedStops.sort((left, right) => left.scheduledTimeLabel.localeCompare(right.scheduledTimeLabel))) {
        const technicianKey = stop.technicianId ?? "unassigned";
        const existingStops = technicianMap.get(technicianKey) ?? [];
        existingStops.push(stop);
        technicianMap.set(technicianKey, existingStops);
      }

      const technicians = [...technicianMap.entries()]
        .sort(([, leftStops], [, rightStops]) => leftStops[0].technicianLabel.localeCompare(rightStops[0].technicianLabel))
        .map(([technicianKey, technicianStops]) => ({
          technicianId: technicianKey === "unassigned" ? null : technicianKey,
          technicianLabel: technicianStops[0]?.technicianLabel ?? "Unassigned",
          stopCount: technicianStops.length,
          stops: technicianStops,
        }));

      return {
        dayKey: dayKey === "unscheduled" ? null : dayKey,
        dayLabel: groupedStops[0]?.scheduledDayLabel ?? "Unscheduled",
        stopCount: groupedStops.length,
        technicians,
      } satisfies DispatchDayGroup;
    });
}

export function buildDispatchOptimizationSeed(stops: DispatchStop[]): DispatchOptimizationSeed {
  const technicianIds = new Set(stops.map((stop) => stop.technicianId).filter(Boolean));
  const dayKeys = new Set(stops.map((stop) => stop.scheduledDayKey).filter(Boolean));

  return {
    generatedAt: new Date().toISOString(),
    stopCount: stops.length,
    dayCount: dayKeys.size,
    technicianCount: technicianIds.size,
    stops: stops.map((stop) => ({
      stopId: stop.id,
      scheduledDayKey: stop.scheduledDayKey,
      technicianId: stop.technicianId,
      addressQuery: stop.addressQuery,
      googleMapsUrl: stop.googleMapsUrl,
    })),
  };
}