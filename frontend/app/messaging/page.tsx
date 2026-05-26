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
    <main className="min-h-screen bg-[color:var(--flat-canvas)] text-[color:var(--text-primary)]">
      <div className="mx-auto max-w-[1400px] px-6 py-12 lg:px-10">
        <MessagingDashboard
          initialLane={initialLane}
          initialCustomerId={initialCustomerId}
          initialPhoneKey={initialPhoneKey}
          organizationDisplayName={organizationDisplayName}
        />
      </div>
    </main>
  );
}
