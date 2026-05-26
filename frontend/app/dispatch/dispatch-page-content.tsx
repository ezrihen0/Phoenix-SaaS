import type { DispatchJobRecord, DispatchTechnicianRecord } from "@/lib/crm/dispatch";
import { requireOfficeCrmRoute } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { getTranslations } from "next-intl/server";

import DispatchWorkspace from "./dispatch-workspace";

export default async function DispatchPageContent() {
  const t = await getTranslations("dispatch");
  await requireOfficeCrmRoute("/dispatch");

  let initialJobs: DispatchJobRecord[] = [];
  let technicians: DispatchTechnicianRecord[] = [];
  let initialErrorMessage: string | null = null;

  try {
    const [jobsResponse, techniciansResponse] = await Promise.all([
      serverApiFetch<DispatchJobRecord[]>("/api/jobs"),
      serverApiFetch<DispatchTechnicianRecord[]>("/api/technicians"),
    ]);

    initialJobs = jobsResponse;
    technicians = techniciansResponse;
  } catch (error) {
    initialErrorMessage = error instanceof Error
      ? error.message
      : t("refreshError");
  }

  return (
    <DispatchWorkspace
      initialJobs={initialJobs}
      technicians={technicians}
      initialErrorMessage={initialErrorMessage}
    />
  );
}
