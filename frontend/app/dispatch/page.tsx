import { redirect } from "next/navigation";

import { DISPATCH_ROUTE_ENABLED } from "@/lib/navigation/shell-nav-policy";

import DispatchPageContent from "./dispatch-page-content";

export default async function DispatchPage() {
  if (!DISPATCH_ROUTE_ENABLED) {
    redirect("/jobs");
  }

  return <DispatchPageContent />;
}
