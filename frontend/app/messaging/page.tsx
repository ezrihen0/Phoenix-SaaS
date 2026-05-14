import { redirect } from "next/navigation";

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

  return (
    <main className="min-h-screen bg-[color:var(--flat-canvas)] text-[color:var(--text-primary)]">
      <div className="mx-auto max-w-[1400px] px-6 py-12 lg:px-10">
        <MessagingDashboard
          initialLane={initialLane}
          initialCustomerId={initialCustomerId}
          initialPhoneKey={initialPhoneKey}
        />
      </div>
    </main>
  );
}
