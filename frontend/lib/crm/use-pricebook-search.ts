"use client";

import { useEffect, useRef, useState } from "react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  buildPricebookBundleQuery,
  buildPricebookItemQuery,
  type PricebookBundle,
  type PricebookBundleDetail,
  type PricebookBundleListResult,
  type PricebookItem,
  type PricebookItemListResult,
} from "@/lib/crm/pricebook-model";

type PricebookSearchResult = {
  items: PricebookItem[];
  bundles: PricebookBundle[];
};

const SEARCH_DEBOUNCE_MS = 180;
const searchCache = new Map<string, PricebookSearchResult>();
const bundleDetailCache = new Map<string, PricebookBundleDetail>();

function normalizeQuery(query: string) {
  return query.trim().toLowerCase();
}

async function fetchPricebookSearch(query: string) {
  const itemParams = buildPricebookItemQuery({
    q: query,
    activeState: "active",
    pageSize: 8,
  });
  const bundleParams = buildPricebookBundleQuery({
    q: query,
    activeState: "active",
    pageSize: 6,
  });

  const [itemResult, bundleResult] = await Promise.all([
    crmApiFetch<PricebookItemListResult>(`/api/pricebook/items?${itemParams.toString()}`),
    crmApiFetch<PricebookBundleListResult>(`/api/pricebook/bundles?${bundleParams.toString()}`),
  ]);

  return {
    items: itemResult.items,
    bundles: bundleResult.items,
  };
}

export function usePricebookSearch(query: string) {
  const normalizedQuery = normalizeQuery(query);
  const [items, setItems] = useState<PricebookItem[]>([]);
  const [bundles, setBundles] = useState<PricebookBundle[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!normalizedQuery) {
      setItems([]);
      setBundles([]);
      setErrorMessage(null);
      setIsSearching(false);
      return;
    }

    const cached = searchCache.get(normalizedQuery);

    if (cached) {
      setItems(cached.items);
      setBundles(cached.bundles);
      setErrorMessage(null);
      setIsSearching(false);
      return;
    }

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const timeoutId = window.setTimeout(() => {
      setIsSearching(true);
      void fetchPricebookSearch(normalizedQuery)
        .then((result) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          searchCache.set(normalizedQuery, result);
          setItems(result.items);
          setBundles(result.bundles);
          setErrorMessage(null);
        })
        .catch((error: unknown) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          setErrorMessage(error instanceof Error ? error.message : "Pricebook search failed.");
          setItems([]);
          setBundles([]);
        })
        .finally(() => {
          if (requestIdRef.current === requestId) {
            setIsSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [normalizedQuery]);

  return {
    items,
    bundles,
    isSearching,
    errorMessage,
  };
}

export async function loadPricebookBundleDetail(bundleId: string) {
  const cached = bundleDetailCache.get(bundleId);

  if (cached) {
    return cached;
  }

  const detail = await crmApiFetch<PricebookBundleDetail>(`/api/pricebook/bundles/${bundleId}`);
  bundleDetailCache.set(bundleId, detail);
  return detail;
}
