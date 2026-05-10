import { redirect } from "next/navigation";

import { requireServerDestination } from "@/lib/auth/server-session";

import TechnicianWorkspace from "./technician-workspace";

export default async function TechnicianPage() {
  await requireServerDestination("/technician", "/technician");
  return <TechnicianWorkspace />;
}