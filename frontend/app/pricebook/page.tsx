import { requireServerSession } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { buildPricebookItemQuery, type PricebookItemFilters, type PricebookItemListResult } from "@/lib/crm/pricebook-model";
import { PricebookTable } from "@/components/pricebook-table";

type SearchParam = string | string[] | undefined;

type PricebookPageContext = {
  searchParams: Promise<{
    q?: SearchParam;
    itemType?: SearchParam;
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
  await requireServerSession("/pricebook");

  const resolvedSearchParams = await searchParams;
  const filters: PricebookItemFilters = {
    q: (firstValue(resolvedSearchParams.q) ?? "").trim(),
    itemType: (firstValue(resolvedSearchParams.itemType) ?? "").trim(),
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
      const parsed = Number.parseInt((firstValue(resolvedSearchParams.pageSize) ?? "25").trim(), 10);
      return Number.isFinite(parsed) && [10, 25, 50, 100].includes(parsed) ? parsed : 25;
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
  let loadError: string | null = null;

  try {
    initialResult = await serverApiFetch<PricebookItemListResult>(endpoint);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The pricebook workspace could not be loaded.";
  }

  return <PricebookTable initialResult={initialResult} initialFilters={filters} loadError={loadError} />;
}