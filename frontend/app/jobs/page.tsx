import { getLocale } from "next-intl/server";

import { requireJobsListRoute } from "@/lib/auth/server-session";

import JobsWorkspace from "./jobs-workspace";

export default async function JobsPage() {
  const session = await requireJobsListRoute("/jobs");
  const locale = await getLocale();

  return (
    <JobsWorkspace
      canViewAllJobs={session.permissions.includes("jobs.view")}
      canCreateJob={session.permissions.includes("jobs.create")}
      locale={locale}
    />
  );
}
