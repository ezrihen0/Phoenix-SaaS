import { crmApiFetch } from "@/lib/crm/browser-api";

import type { GlobalSearchResponse } from "./global-search-contract";
import { validateGlobalSearchResponse } from "./global-search-validation";
import { SEARCH_TRANSPORT_TIMEOUT_MS } from "@/features/global-search/global-search.constants";

export async function fetchGlobalSearch(
  query: string,
  signal?: AbortSignal,
): Promise<GlobalSearchResponse> {
  const params = new URLSearchParams({ q: query });
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort();
  }, SEARCH_TRANSPORT_TIMEOUT_MS);

  const relayController = new AbortController();
  const abortRelay = () => relayController.abort();
  signal?.addEventListener("abort", abortRelay);
  timeoutController.signal.addEventListener("abort", abortRelay);

  try {
    const raw = await crmApiFetch<unknown>(`/api/search?${params.toString()}`, {
      method: "GET",
      signal: relayController.signal,
    });

    return validateGlobalSearchResponse(raw);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortRelay);
    timeoutController.signal.removeEventListener("abort", abortRelay);
  }
}
