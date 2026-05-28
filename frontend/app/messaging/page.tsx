import { redirect } from "next/navigation";

import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerSession } from "@/lib/auth/server-session";
import MessagingDashboard from "./messaging-dashboard";

type SearchParam = string | string[] | undefined;

type MessagingPageContext = {
  searchParams: Promise<{
    lane?: SearchParam;
    customerId?: SearchParam;
    phoneKey?: SearchParam;
  }>;
};

function firstValue(value: SearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MessagingPage({ searchParams }: MessagingPageContext) {
  const session = await requireServerSession("/messaging");

  if (session.profile?.role === "technician") {
    redirect("/home");
  }

  const resolvedSearchParams = await searchParams;
  const laneValue = (firstValue(resolvedSearchParams.lane) ?? "").trim().toLowerCase();
  const initialLane = laneValue === "customers" ? laneValue : "unknown";
  const initialCustomerId = (firstValue(resolvedSearchParams.customerId) ?? "").trim() || null;
  const initialPhoneKey = (firstValue(resolvedSearchParams.phoneKey) ?? "").trim() || null;

  let organizationDisplayName = "Your company";

  try {
    const settings = await serverApiFetch<{ businessName?: string | null }>("/api/settings/organization");
    organizationDisplayName = settings.businessName?.trim() || organizationDisplayName;
  } catch {
    organizationDisplayName = session.active_organization?.name?.trim() || organizationDisplayName;
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-[color:var(--cmp-surface-canvas)] pb-24 text-[color:var(--sem-text-primary)] lg:pb-0">
      <MessagingDashboard
        initialLane={initialLane}
        initialCustomerId={initialCustomerId}
        initialPhoneKey={initialPhoneKey}
        organizationDisplayName={organizationDisplayName}
      />
    </main>
  );
}
