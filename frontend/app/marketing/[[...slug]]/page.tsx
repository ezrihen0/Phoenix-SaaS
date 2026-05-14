import { notFound } from "next/navigation";

import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerRoles } from "@/lib/auth/server-session";
import {
  MarketingFoundationWorkspace,
  type MarketingFoundationData,
  type MarketingRouteKey,
} from "@/components/marketing/marketing-foundation-workspace";

type MarketingPageContext = {
  params: Promise<{
    slug?: string[];
  }>;
  searchParams?: Promise<{ draft?: string | string[] }>;
};

const allowedRoutes = new Set<MarketingRouteKey>([
  "overview",
  "opportunities",
  "create",
  "calendar",
  "campaigns",
  "channels",
  "automations",
  "analytics",
  "settings",
]);

function resolveRouteKey(slug: string[] | undefined): MarketingRouteKey | null {
  if (!slug || slug.length === 0) {
    return "overview";
  }

  if (slug.length !== 1) {
    return null;
  }

  const candidate = slug[0]?.trim().toLowerCase() as MarketingRouteKey | undefined;
  return candidate && allowedRoutes.has(candidate) ? candidate : null;
}

function buildNextPath(slug: string[] | undefined) {
  if (!slug || slug.length === 0) {
    return "/marketing";
  }

  return `/marketing/${slug.join("/")}`;
}

export default async function MarketingPage({ params, searchParams }: MarketingPageContext) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams === undefined ? undefined : await searchParams;
  const routeKey = resolveRouteKey(resolvedParams.slug);

  if (!routeKey) {
    notFound();
  }

  const draftParamRaw = resolvedSearchParams?.draft;
  const normalizedDraft =
    typeof draftParamRaw === "string" ? draftParamRaw.trim()
    : typeof draftParamRaw === "undefined" ? undefined
    : Array.isArray(draftParamRaw) ? draftParamRaw[0]?.trim()
    : undefined;

  await requireServerRoles(buildNextPath(resolvedParams.slug), ["owner", "admin", "office_admin", "dispatcher"]);

  let foundationData: MarketingFoundationData | null = null;
  let loadError: string | null = null;

  try {
    foundationData = await serverApiFetch<MarketingFoundationData>("/api/marketing/foundation");
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The Growth Center foundation could not be loaded.";
  }

  return (
    <MarketingFoundationWorkspace
      activeRouteKey={routeKey}
      foundationData={foundationData}
      loadError={loadError}
      studioDraftQuery={routeKey === "create" ? normalizedDraft : undefined}
    />
  );
}
