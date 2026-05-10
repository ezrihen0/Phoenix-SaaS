import type { GlobalSearchResponse, SearchResultItem } from "@/lib/search/global-search-contract";

export type SearchViewState = {
  query: string;
  loading: boolean;
  transportError: string | null;
  results: GlobalSearchResponse | null;
  activeIndex: number;
};

export type FlattenedResult = SearchResultItem & {
  group: "jobs" | "customers";
};
