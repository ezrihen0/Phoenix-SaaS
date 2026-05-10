"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { fetchGlobalSearch } from "@/lib/search/global-search-client";
import type { GlobalSearchResponse } from "@/lib/search/global-search-contract";

import { SEARCH_DEBOUNCE_MS } from "./global-search.constants";
import type { FlattenedResult } from "./global-search.types";

function flattenResults(results: GlobalSearchResponse | null): FlattenedResult[] {
  if (!results) {
    return [];
  }

  return [
    ...results.jobs.map((item) => ({ ...item, group: "jobs" as const })),
    ...results.customers.map((item) => ({ ...item, group: "customers" as const })),
  ];
}

export function useGlobalSearch(enabled: boolean) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [results, setResults] = useState<GlobalSearchResponse | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }

    const timer = setTimeout(() => {
      requestSeqRef.current += 1;
      const requestSeq = requestSeqRef.current;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setTransportError(null);

      void fetchGlobalSearch(trimmed, controller.signal)
        .then((payload) => {
          if (requestSeq !== requestSeqRef.current) {
            return;
          }

          setResults(payload);
          setActiveIndex(-1);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || requestSeq !== requestSeqRef.current) {
            return;
          }

          const message = error instanceof Error ? error.message : "Search request failed.";
          setTransportError(message);
          setResults(null);
          setActiveIndex(-1);
        })
        .finally(() => {
          if (requestSeq === requestSeqRef.current) {
            setLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [enabled, query]);

  const flatResults = useMemo(() => flattenResults(results), [results]);

  function onQueryChange(value: string) {
    setQuery(value);

    if (value.trim().length < 2) {
      abortRef.current?.abort();
      setLoading(false);
      setTransportError(null);
      setResults(null);
      setActiveIndex(-1);
    }
  }

  function moveActiveIndex(delta: number) {
    if (!flatResults.length) {
      setActiveIndex(-1);
      return;
    }

    setActiveIndex((previous) => {
      if (previous < 0) {
        return delta > 0 ? 0 : flatResults.length - 1;
      }

      const next = previous + delta;

      if (next < 0) {
        return flatResults.length - 1;
      }

      if (next >= flatResults.length) {
        return 0;
      }

      return next;
    });
  }

  return {
    query,
    setQuery: onQueryChange,
    loading,
    transportError,
    results,
    flatResults,
    activeIndex,
    setActiveIndex,
    moveActiveIndex,
  };
}
