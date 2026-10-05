import { redirect } from "next/navigation";

import { customerPortalMagicLinkUrl } from "@/lib/portal/staff-magic-link-api";

type LegacyPortalAccessPageProps = {
  params: Promise<{ token: string }>;
};

/** Legacy links on the staff app origin redirect to the live portal magic confirm step. */
export default async function LegacyPortalAccessPage({ params }: LegacyPortalAccessPageProps) {
  const { token } = await params;
  const trimmed = token.trim();
  if (!trimmed) {
    redirect(
      `${process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_BASE_URL?.replace(/\/$/, "") || "https://portal.phoenixfireplace.ca"}/portal/login`,
    );
  }

  redirect(`${customerPortalMagicLinkUrl(trimmed)}&entry=invoice`);
}
