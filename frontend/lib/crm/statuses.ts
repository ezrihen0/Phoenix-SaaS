import { getDefaultWorkerUiLocale, resolveSupportedWorkerUiLocale, type SupportedWorkerUiLocale } from "@/lib/i18n/locales";
import type { Database } from "@/lib/types/database";

export const leadStatuses = ["new_lead", "contacted", "converted"] as const;
export const jobStatuses = [
  "new_lead",
  "contacted",
  "submitted",
  "scheduled",
  "on_the_way",
  "in_progress",
  "waiting_for_approval",
  "completed",
  "paid",
  "cancelled",
] as const;

export const operationalJobStatuses = [
  "submitted",
  "scheduled",
  "completed",
  "cancelled",
] as const;

export type OperationalJobStatus = (typeof operationalJobStatuses)[number];

export const activeJobStatusValues: JobStatus[] = [
  "submitted",
  "new_lead",
  "contacted",
  "scheduled",
  "on_the_way",
  "in_progress",
  "waiting_for_approval",
];

export const completedJobStatusValues: JobStatus[] = ["completed", "paid"];

/** @deprecated Use activeJobStatusValues */
export const openJobStatuses: JobStatus[] = activeJobStatusValues;

export const dashboardStatuses = [
  "submitted",
  "scheduled",
  "completed",
] as const;

export const technicianJobStatuses = operationalJobStatuses;

export const officeOnlyJobStatuses = ["paid"] as const;

const officeOnlyJobStatusSet: ReadonlySet<JobStatus> = new Set<JobStatus>(officeOnlyJobStatuses);

const submittedBucket = new Set<JobStatus>(["submitted", "new_lead", "contacted"]);
const scheduledBucket = new Set<JobStatus>([
  "scheduled",
  "on_the_way",
  "in_progress",
  "waiting_for_approval",
]);

const operationalTransitionMap: Record<OperationalJobStatus, OperationalJobStatus[]> = {
  submitted: ["scheduled", "completed", "cancelled"],
  scheduled: ["submitted", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function mapJobStatusToOperationalBucket(status: JobStatus): OperationalJobStatus {
  if ((operationalJobStatuses as readonly string[]).includes(status)) {
    return status as OperationalJobStatus;
  }

  if (submittedBucket.has(status)) {
    return "submitted";
  }

  if (scheduledBucket.has(status)) {
    return "scheduled";
  }

  if (status === "paid") {
    return "completed";
  }

  return "cancelled";
}

export function isActiveJobStatus(status: JobStatus): boolean {
  return activeJobStatusValues.includes(status);
}

export function isCompletedJobStatus(status: JobStatus): boolean {
  return completedJobStatusValues.includes(status);
}

export type LeadStatus = Database["public"]["Enums"]["lead_status"];
export type JobStatus = Database["public"]["Enums"]["job_status"];
export type ServiceType = Database["public"]["Enums"]["service_type"];
export type LeadSource = Database["public"]["Enums"]["lead_source"];
export type DashboardStatus = (typeof dashboardStatuses)[number];

type LocalizedMap<T extends string> = Record<SupportedWorkerUiLocale, Record<T, string>>;

const localizedOperationalJobStatusLabels: LocalizedMap<OperationalJobStatus> = {
  en: {
    submitted: "Submitted",
    scheduled: "Scheduled",
    completed: "Completed",
    cancelled: "Cancelled",
  },
  es: {
    submitted: "Enviado",
    scheduled: "Programado",
    completed: "Completado",
    cancelled: "Cancelado",
  },
  he: {
    submitted: "הוגש",
    scheduled: "מתוזמן",
    completed: "הושלם",
    cancelled: "בוטל",
  },
  uk: {
    submitted: "Подано",
    scheduled: "Заплановано",
    completed: "Завершено",
    cancelled: "Скасовано",
  },
  pl: {
    submitted: "Zgloszony",
    scheduled: "Zaplanowany",
    completed: "Zakonczony",
    cancelled: "Anulowany",
  },
};

const localizedLeadStatusLabels: LocalizedMap<Exclude<LeadStatus, "converted">> = {
  en: {
    new_lead: "New Lead",
    contacted: "Contacted",
  },
  es: {
    new_lead: "Nuevo prospecto",
    contacted: "Contactado",
  },
  he: {
    new_lead: "ליד חדש",
    contacted: "נוצר קשר",
  },
  uk: {
    new_lead: "Новий лід",
    contacted: "Контактовано",
  },
  pl: {
    new_lead: "Nowy lead",
    contacted: "Skontaktowany",
  },
};

const localizedServiceTypeLabels: LocalizedMap<ServiceType> = {
  en: {
    inspection: "Inspection",
    cleaning: "Cleaning",
    repair: "Repair",
    rebuild: "Rebuild",
  },
  es: {
    inspection: "Inspeccion",
    cleaning: "Limpieza",
    repair: "Reparacion",
    rebuild: "Reconstruccion",
  },
  he: {
    inspection: "בדיקה",
    cleaning: "ניקוי",
    repair: "תיקון",
    rebuild: "בניה מחדש",
  },
  uk: {
    inspection: "Інспекція",
    cleaning: "Очищення",
    repair: "Ремонт",
    rebuild: "Перебудова",
  },
  pl: {
    inspection: "Inspekcja",
    cleaning: "Czyszczenie",
    repair: "Naprawa",
    rebuild: "Odbudowa",
  },
};

const localizedLeadSourceLabels: LocalizedMap<LeadSource> = {
  en: {
    phone: "Direct",
    website: "Website",
    google: "Google",
    facebook: "Facebook",
    referral: "Referral",
    repeat_customer: "Repeat Customer",
    other: "Other",
  },
  es: {
    phone: "Directo",
    website: "Sitio web",
    google: "Google",
    facebook: "Facebook",
    referral: "Referencia",
    repeat_customer: "Cliente recurrente",
    other: "Otro",
  },
  he: {
    phone: "ישיר",
    website: "אתר",
    google: "Google",
    facebook: "Facebook",
    referral: "הפניה",
    repeat_customer: "לקוח חוזר",
    other: "אחר",
  },
  uk: {
    phone: "Прямий",
    website: "Сайт",
    google: "Google",
    facebook: "Facebook",
    referral: "Рекомендація",
    repeat_customer: "Постійний клієнт",
    other: "Інше",
  },
  pl: {
    phone: "Bezposredni",
    website: "Strona",
    google: "Google",
    facebook: "Facebook",
    referral: "Polecenie",
    repeat_customer: "Powracajacy klient",
    other: "Inne",
  },
};

function normalizeLocale(locale?: string | null) {
  return resolveSupportedWorkerUiLocale(locale ?? getDefaultWorkerUiLocale());
}

export function canTransitionJobStatus(currentStatus: JobStatus, nextStatus: JobStatus) {
  if (currentStatus === nextStatus) {
    return true;
  }

  if (nextStatus === "paid" || !(operationalJobStatuses as readonly string[]).includes(nextStatus)) {
    return false;
  }

  const currentBucket = mapJobStatusToOperationalBucket(currentStatus);
  return operationalTransitionMap[currentBucket].includes(nextStatus as OperationalJobStatus);
}

export function isOfficeOnlyJobStatus(status: JobStatus) {
  return officeOnlyJobStatusSet.has(status);
}

export function getJobStatusLabel(status: JobStatus, locale?: string | null) {
  const bucket = mapJobStatusToOperationalBucket(status);
  return localizedOperationalJobStatusLabels[normalizeLocale(locale)][bucket];
}

export function getDashboardStatusLabel(
  status: Exclude<LeadStatus, "converted"> | JobStatus,
  locale?: string | null,
) {
  const resolvedLocale = normalizeLocale(locale);
  if (status === "new_lead" || status === "contacted") {
    return localizedLeadStatusLabels[resolvedLocale][status];
  }

  return getJobStatusLabel(status, resolvedLocale);
}

export function getDashboardBoardStatus(
  status: Exclude<LeadStatus, "converted"> | JobStatus,
): DashboardStatus | null {
  if (status === "cancelled") {
    return null;
  }

  if (status === "new_lead" || status === "contacted") {
    return "submitted";
  }

  if (
    status === "on_the_way"
    || status === "in_progress"
    || status === "waiting_for_approval"
  ) {
    return "scheduled";
  }

  if (status === "paid") {
    return "completed";
  }

  if ((dashboardStatuses as readonly string[]).includes(status)) {
    return status as DashboardStatus;
  }

  return null;
}

export function getServiceTypeLabel(serviceType: ServiceType, locale?: string | null) {
  return localizedServiceTypeLabels[normalizeLocale(locale)][serviceType];
}

export function getLeadSourceLabel(source: LeadSource, locale?: string | null) {
  return localizedLeadSourceLabels[normalizeLocale(locale)][source];
}
