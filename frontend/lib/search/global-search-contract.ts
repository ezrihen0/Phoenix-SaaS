export type SearchEntityKey = "jobs" | "customers";

export type SearchResultItem = {
  id: string;
  entity: SearchEntityKey;
  title: string;
  subtitle: string;
  status: string | null;
  destination: string;
  updatedAt: string;
};

export type SearchMetaError = {
  entity: SearchEntityKey;
  code: string;
  message: string;
};

export type GlobalSearchResponse = {
  jobs: SearchResultItem[];
  customers: SearchResultItem[];
  meta: {
    requestId: string;
    tookMs: number;
    partial: boolean;
    errors: SearchMetaError[];
  };
};
