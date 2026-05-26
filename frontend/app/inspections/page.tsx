import { requireServerSession } from "@/lib/auth/server-session";
import { isProbablyMobileUserAgent } from "@/lib/device/desktop-only";
import { headers } from "next/headers";

import InspectionsWorkspace from "./inspections-workspace";

export default async function InspectionsPage() {
  const session = await requireServerSession("/inspections");
  const sessionRole = session.profile?.role ?? session.active_membership?.role ?? null;
  const userAgent = (await headers()).get("user-agent");
  if (isProbablyMobileUserAgent(userAgent)) {
    return (
      <main className="min-h-screen bg-[color:var(--flat-canvas)] px-6 py-12 text-[color:var(--sem-text-secondary)]">
        <section className="mx-auto max-w-3xl rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[linear-gradient(170deg,rgba(8,8,8,0.96),rgba(19,19,19,0.9))] p-6 text-sm shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
          Desktop authoring required for MVP. Open Inspections from a desktop browser.
        </section>
      </main>
    );
  }
  return (
    <InspectionsWorkspace
      permissions={session.permissions}
      sessionRole={sessionRole}
    />
  );
}
