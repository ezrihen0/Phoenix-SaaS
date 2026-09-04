import { requireServerSession } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import {
  buildPricebookItemQuery,
  buildPricebookNavigationSummaryQuery,
  type PricebookCategoryListResult,
  type PricebookItemFilters,
  type PricebookItemListResult,
  type PricebookNavigationSummary,
  type PricebookSystemListResult,
} from "@/lib/crm/pricebook-model";
import { PricebookTable } from "@/components/pricebook-table";

type SearchParam = string | string[] | undefined;

type PricebookPageContext = {
  searchParams: Promise<{
    q?: SearchParam;
    itemType?: SearchParam;
    systemId?: SearchParam;
    categoryId?: SearchParam;
    tradeArea?: SearchParam;
    activeState?: SearchParam;
    popularOnly?: SearchParam;
    page?: SearchParam;
    pageSize?: SearchParam;
  }>;
};

function firstValue(value: SearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PricebookPage({ searchParams }: PricebookPageContext) {
  const session = await requireServerSession("/pricebook");
  const sessionRole = session.profile?.role ?? session.active_membership?.role ?? null;

  const resolvedSearchParams = await searchParams;
  const filters: PricebookItemFilters = {
    q: (firstValue(resolvedSearchParams.q) ?? "").trim(),
    itemType: (firstValue(resolvedSearchParams.itemType) ?? "").trim(),
    systemId: (firstValue(resolvedSearchParams.systemId) ?? "").trim(),
    categoryId: (firstValue(resolvedSearchParams.categoryId) ?? "").trim(),
    tradeArea: (firstValue(resolvedSearchParams.tradeArea) ?? "").trim(),
    activeState: (() => {
      const value = (firstValue(resolvedSearchParams.activeState) ?? "active").trim();
      return value === "archived" || value === "all" ? value : "active";
    })(),
    popularOnly: ["true", "1"].includes((firstValue(resolvedSearchParams.popularOnly) ?? "").trim().toLowerCase()),
    page: (() => {
      const parsed = Number.parseInt((firstValue(resolvedSearchParams.page) ?? "1").trim(), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    })(),
    pageSize: (() => {
      const parsed = Number.parseInt((firstValue(resolvedSearchParams.pageSize) ?? "50").trim(), 10);
      return Number.isFinite(parsed) && [10, 25, 50, 100].includes(parsed) ? parsed : 50;
    })(),
  };

  const params = buildPricebookItemQuery(filters);
  const endpoint = `/api/pricebook/items${params.size ? `?${params.toString()}` : ""}`;

  let initialResult: PricebookItemListResult = {
    items: [],
    totalCount: 0,
    page: filters.page,
    pageSize: filters.pageSize,
  };
  let catalogSystems: PricebookSystemListResult["systems"] = [];
  let catalogCategories: PricebookCategoryListResult["categories"] = [];
  let navigationSummary: PricebookNavigationSummary | null = null;
  let loadError: string | null = null;

  const navigationParams = buildPricebookNavigationSummaryQuery(filters);
  const navigationEndpoint = `/api/pricebook/navigation-summary${navigationParams.size ? `?${navigationParams.toString()}` : ""}`;

  const [itemsResult, systemsResult, categoriesResult, summaryResult] = await Promise.allSettled([
    serverApiFetch<PricebookItemListResult>(endpoint),
    serverApiFetch<PricebookSystemListResult>("/api/pricebook/systems"),
    serverApiFetch<PricebookCategoryListResult>("/api/pricebook/categories"),
    serverApiFetch<PricebookNavigationSummary>(navigationEndpoint),
  ]);

  if (itemsResult.status === "fulfilled" && itemsResult.value) {
    initialResult = itemsResult.value;
  } else {
    loadError = itemsResult.status === "rejected" && itemsResult.reason instanceof Error
      ? itemsResult.reason.message
      : "The pricebook workspace could not be loaded.";
  }

  if (systemsResult.status === "fulfilled" && systemsResult.value?.systems) {
    catalogSystems = systemsResult.value.systems;
  }

  if (categoriesResult.status === "fulfilled" && categoriesResult.value?.categories) {
    catalogCategories = categoriesResult.value.categories;
  }

  if (summaryResult.status === "fulfilled" && summaryResult.value) {
    navigationSummary = summaryResult.value;
  } else if (summaryResult.status === "rejected" && !loadError) {
    loadError = summaryResult.reason instanceof Error
      ? summaryResult.reason.message
      : "Pricebook navigation counts could not be loaded.";
  }

  return (
    <PricebookTable
      sessionRole={sessionRole}
      initialResult={initialResult}
      initialFilters={filters}
      catalogSystems={catalogSystems}
      catalogCategories={catalogCategories}
      navigationSummary={navigationSummary}
      loadError={loadError}
    />
  );
}