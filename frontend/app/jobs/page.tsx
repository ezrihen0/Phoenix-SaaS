import { redirect } from "next/navigation";

import { requireServerDestination } from "@/lib/auth/server-session";

import JobsWorkspace from "./jobs-workspace";

export default async function JobsPage() {
  await requireServerDestination("/jobs", "/jobs");
  return <JobsWorkspace />;
}