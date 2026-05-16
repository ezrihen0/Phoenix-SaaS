import { requireOfficeCrmRoute } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { getTranslations } from "next-intl/server";

import ScheduleWorkspace from "./schedule-workspace";

export default async function SchedulePage() {
  const t = await getTranslations("schedule");
  await requireOfficeCrmRoute("/schedule");

  let initialJobs: unknown[] = [];
  let technicians: unknown[] = [];
  let initialErrorMessage: string | null = null;

  try {
    const [jobsResponse, techniciansResponse] = await Promise.all([
      serverApiFetch<unknown[]>("/api/jobs"),
      serverApiFetch<unknown[]>("/api/technicians"),
    ]);

    initialJobs = jobsResponse;
    technicians = techniciansResponse;
  } catch (error) {
    initialErrorMessage = error instanceof Error
      ? error.message
      : t("refreshError");
  }

  return (
    <ScheduleWorkspace
      initialJobs={initialJobs as never[]}
      technicians={technicians as never[]}
      initialErrorMessage={initialErrorMessage}
    />
  );
}
