import { redirect } from "next/navigation";

import { requireOfficeCrmRoute } from "@/lib/auth/server-session";

import JobsWorkspace from "./jobs-workspace";

export default async function JobsPage() {
  await requireOfficeCrmRoute("/jobs");
  return <JobsWorkspace />;
}