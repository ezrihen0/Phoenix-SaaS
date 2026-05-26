import { PricebookBundlesWorkspace } from "@/components/pricebook-bundle-editor";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerSession } from "@/lib/auth/server-session";
import { buildPricebookBundleQuery, type PricebookBundleFilters, type PricebookBundleListResult } from "@/lib/crm/pricebook-model";

type SearchParam = string | string[] | undefined;

type PricebookBundlesPageContext = {
  searchParams: Promise<{
    q?: SearchParam;
    activeState?: SearchParam;
    page?: SearchParam;
    pageSize?: SearchParam;
  }>;
};

function firstValue(value: SearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PricebookBundlesPage({ searchParams }: PricebookBundlesPageContext) {
  const session = await requireServerSession("/pricebook/bundles");
  const sessionRole = session.profile?.role ?? session.active_membership?.role ?? null;
  const resolvedSearchParams = await searchParams;

  const filters: PricebookBundleFilters = {
    q: (firstValue(resolvedSearchParams.q) ?? "").trim(),
    activeState: (() => {
      const value = (firstValue(resolvedSearchParams.activeState) ?? "active").trim();
      return value === "archived" || value === "all" ? value : "active";
    })(),
    page: (() => {
      const parsed = Number.parseInt((firstValue(resolvedSearchParams.page) ?? "1").trim(), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    })(),
    pageSize: (() => {
      const parsed = Number.parseInt((firstValue(resolvedSearchParams.pageSize) ?? "25").trim(), 10);
      return Number.isFinite(parsed) && [10, 25, 50, 100].includes(parsed) ? parsed : 25;
    })(),
  };

  const params = buildPricebookBundleQuery(filters);
  const endpoint = `/api/pricebook/bundles${params.size ? `?${params.toString()}` : ""}`;

  let initialResult: PricebookBundleListResult = {
    items: [],
    totalCount: 0,
    page: filters.page,
    pageSize: filters.pageSize,
  };
  let loadError: string | null = null;

  try {
    initialResult = await serverApiFetch<PricebookBundleListResult>(endpoint);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The bundle workspace could not be loaded.";
  }

  return (
    <PricebookBundlesWorkspace
      sessionRole={sessionRole}
      initialResult={initialResult}
      initialFilters={filters}
      loadError={loadError}
    />
  );
}