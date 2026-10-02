export type ScheduleTechnicianFilter = "all" | string;

export function buildScheduleJobsApiPath(technicianFilter: ScheduleTechnicianFilter): string {
  if (technicianFilter === "all") {
    return "/api/jobs";
  }

  return `/api/jobs?technicianId=${encodeURIComponent(technicianFilter)}`;
}

export function resolveInitialTechnicianFilter(
  technicianParam: string | undefined,
  rosterIds: ReadonlySet<string>,
): ScheduleTechnicianFilter {
  if (!technicianParam?.trim()) {
    return "all";
  }

  const normalized = technicianParam.trim();
  return rosterIds.has(normalized) ? normalized : "all";
}
