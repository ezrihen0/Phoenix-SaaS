import { redirect } from "next/navigation";

import { requireOfficeCrmRoute } from "@/lib/auth/server-session";

import CustomerImportWorkspace from "./customer-import-workspace";

export default async function CustomerImportPage() {
  await requireOfficeCrmRoute("/admin/import/customers");

  return <CustomerImportWorkspace />;
}