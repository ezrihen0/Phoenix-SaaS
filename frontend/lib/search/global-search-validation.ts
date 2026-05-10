import type { GlobalSearchResponse, SearchMetaError, SearchResultItem } from "./global-search-contract";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSearchResultItem(value: unknown): value is SearchResultItem {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === "string"
    && (value.entity === "jobs" || value.entity === "customers")
    && typeof value.title === "string"
    && typeof value.subtitle === "string"
    && (typeof value.status === "string" || value.status === null)
    && typeof value.destination === "string"
    && typeof value.updatedAt === "string";
}

function isMetaError(value: unknown): value is SearchMetaError {
  if (!isRecord(value)) {
    return false;
  }

  return (value.entity === "jobs" || value.entity === "customers")
    && typeof value.code === "string"
    && typeof value.message === "string";
}

export function validateGlobalSearchResponse(value: unknown): GlobalSearchResponse {
  if (!isRecord(value) || !Array.isArray(value.jobs) || !Array.isArray(value.customers) || !isRecord(value.meta)) {
    throw new Error("Invalid search response shape.");
  }

  if (!value.jobs.every(isSearchResultItem) || !value.customers.every(isSearchResultItem)) {
    throw new Error("Invalid search result items.");
  }

  if (
    typeof value.meta.requestId !== "string"
    || typeof value.meta.tookMs !== "number"
    || typeof value.meta.partial !== "boolean"
    || !Array.isArray(value.meta.errors)
    || !value.meta.errors.every(isMetaError)
  ) {
    throw new Error("Invalid search response metadata.");
  }

  return value as GlobalSearchResponse;
}
