import { requireOfficeCrmRoute } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import {
  buildScheduleJobsApiPath,
  resolveInitialTechnicianFilter,
} from "@/lib/crm/schedule-technician-query";
import { getTranslations } from "next-intl/server";

import ScheduleWorkspace from "./schedule-workspace";

type TechnicianRecord = { id: string };

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ technician?: string }>;
}) {
  const t = await getTranslations("schedule");
  await requireOfficeCrmRoute("/schedule");

  const resolvedSearchParams = await searchParams;

  let initialJobs: unknown[] = [];
  let technicians: TechnicianRecord[] = [];
  let initialErrorMessage: string | null = null;
  let techniciansLoadWarning: string | null = null;

  try {
    technicians = await serverApiFetch<TechnicianRecord[]>("/api/technicians?purpose=roster");
  } catch (error) {
    techniciansLoadWarning = error instanceof Error
      ? error.message
      : t("technicianRosterLoadError");
  }

  const rosterIds = new Set(technicians.map((technician) => technician.id));
  const initialTechnicianFilter = resolveInitialTechnicianFilter(
    resolvedSearchParams.technician,
    rosterIds,
  );

  try {
    initialJobs = await serverApiFetch<unknown[]>(
      buildScheduleJobsApiPath(initialTechnicianFilter),
    );
  } catch (error) {
    initialErrorMessage = error instanceof Error
      ? error.message
      : t("refreshError");
  }

  return (
    <ScheduleWorkspace
      initialJobs={initialJobs as never[]}
      technicians={technicians as never[]}
      initialTechnicianFilter={initialTechnicianFilter}
      initialErrorMessage={initialErrorMessage}
      techniciansLoadWarning={techniciansLoadWarning}
    />
  );
}
