import { getDefaultWorkerUiLocale, resolveSupportedWorkerUiLocale, type SupportedWorkerUiLocale } from "@/lib/i18n/locales";
import type { Database } from "@/lib/types/database";

export const leadStatuses = ["new_lead", "contacted", "converted"] as const;
export const jobStatuses = [
  "new_lead",
  "contacted",
  "scheduled",
  "on_the_way",
  "in_progress",
  "waiting_for_approval",
  "completed",
  "paid",
  "cancelled",
] as const;
export const dashboardStatuses = [
  "new_lead",
  "contacted",
  "scheduled",
  "on_the_way",
  "in_progress",
  "waiting_for_approval",
  "completed",
  "paid",
] as const;

export const technicianJobStatuses = [
  "on_the_way",
  "in_progress",
  "completed",
] as const;

export const officeOnlyJobStatuses = ["new_lead", "contacted", "paid", "cancelled"] as const;

const officeOnlyJobStatusSet: ReadonlySet<JobStatus> = new Set<JobStatus>(officeOnlyJobStatuses);

export type LeadStatus = Database["public"]["Enums"]["lead_status"];
export type JobStatus = Database["public"]["Enums"]["job_status"];
export type ServiceType = Database["public"]["Enums"]["service_type"];
export type LeadSource = Database["public"]["Enums"]["lead_source"];
export type DashboardStatus = (typeof dashboardStatuses)[number];

const jobTransitionMap: Record<JobStatus, JobStatus[]> = {
  new_lead: ["contacted", "scheduled", "cancelled"],
  contacted: ["new_lead", "scheduled", "cancelled"],
  scheduled: ["contacted", "on_the_way", "in_progress", "waiting_for_approval", "completed", "cancelled"],
  on_the_way: ["scheduled", "in_progress", "waiting_for_approval", "completed", "cancelled"],
  in_progress: ["on_the_way", "waiting_for_approval", "completed", "cancelled"],
  waiting_for_approval: ["scheduled", "on_the_way", "in_progress", "completed", "cancelled"],
  completed: ["waiting_for_approval", "paid"],
  paid: ["completed"],
  cancelled: [],
};

type LocalizedMap<T extends string> = Record<SupportedWorkerUiLocale, Record<T, string>>;

const localizedJobStatusLabels: LocalizedMap<JobStatus> = {
  en: {
    new_lead: "New Lead",
    contacted: "Contacted",
    scheduled: "Scheduled",
    on_the_way: "On The Way",
    in_progress: "In Progress",
    waiting_for_approval: "Waiting Approval",
    completed: "Completed",
    paid: "Paid",
    cancelled: "Cancelled",
  },
  es: {
    new_lead: "Nuevo prospecto",
    contacted: "Contactado",
    scheduled: "Programado",
    on_the_way: "En camino",
    in_progress: "En progreso",
    waiting_for_approval: "Esperando aprobacion",
    completed: "Completado",
    paid: "Pagado",
    cancelled: "Cancelado",
  },
  he: {
    new_lead: "ליד חדש",
    contacted: "נוצר קשר",
    scheduled: "מתוזמן",
    on_the_way: "בדרך",
    in_progress: "בתהליך",
    waiting_for_approval: "ממתין לאישור",
    completed: "הושלם",
    paid: "שולם",
    cancelled: "בוטל",
  },
  uk: {
    new_lead: "Новий лід",
    contacted: "Контактовано",
    scheduled: "Заплановано",
    on_the_way: "В дорозі",
    in_progress: "У процесі",
    waiting_for_approval: "Очікує схвалення",
    completed: "Завершено",
    paid: "Оплачено",
    cancelled: "Скасовано",
  },
  pl: {
    new_lead: "Nowy lead",
    contacted: "Skontaktowany",
    scheduled: "Zaplanowany",
    on_the_way: "W drodze",
    in_progress: "W trakcie",
    waiting_for_approval: "Oczekuje na akceptacje",
    completed: "Zakonczony",
    paid: "Oplacony",
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

  return jobTransitionMap[currentStatus].includes(nextStatus);
}

export function isOfficeOnlyJobStatus(status: JobStatus) {
  return officeOnlyJobStatusSet.has(status);
}

export function getJobStatusLabel(status: JobStatus, locale?: string | null) {
  return localizedJobStatusLabels[normalizeLocale(locale)][status];
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
  if (
    status === "new_lead"
    || status === "contacted"
    || status === "scheduled"
    || status === "on_the_way"
    || status === "in_progress"
    || status === "waiting_for_approval"
    || status === "completed"
    || status === "paid"
  ) {
    return status;
  }

  if (status === "cancelled") {
    return null;
  }

  return "scheduled";
}

export function getServiceTypeLabel(serviceType: ServiceType, locale?: string | null) {
  return localizedServiceTypeLabels[normalizeLocale(locale)][serviceType];
}

export function getLeadSourceLabel(source: LeadSource, locale?: string | null) {
  return localizedLeadSourceLabels[normalizeLocale(locale)][source];
}
