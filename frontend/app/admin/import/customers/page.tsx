import { redirect } from "next/navigation";

import { requireServerDestination } from "@/lib/auth/server-session";

import CustomerImportWorkspace from "./customer-import-workspace";

export default async function CustomerImportPage() {
  await requireServerDestination("/admin/import/customers", "/jobs");

  return <CustomerImportWorkspace />;
}