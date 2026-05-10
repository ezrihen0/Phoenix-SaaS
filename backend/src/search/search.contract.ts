import type { SearchMeta, SearchResultItem } from "./search.types";

export type GlobalSearchResponse = {
  jobs: SearchResultItem[];
  customers: SearchResultItem[];
  meta: SearchMeta;
};

export type GlobalSearchApiResponse = {
  data: GlobalSearchResponse;
};
