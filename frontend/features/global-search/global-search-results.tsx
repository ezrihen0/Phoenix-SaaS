"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import type { GlobalSearchResponse } from "@/lib/search/global-search-contract";

import type { FlattenedResult } from "./global-search.types";

type Props = {
  loading: boolean;
  transportError: string | null;
  results: GlobalSearchResponse | null;
  activeIndex: number;
  flatResults: FlattenedResult[];
  onHover: (index: number) => void;
};

export function GlobalSearchResults({
  loading,
  transportError,
  results,
  activeIndex,
  flatResults,
  onHover,
}: Props) {
  const t = useTranslations("search");
  if (loading) {
    return (
      <div className="theme-control-surface rounded-[18px] border p-3 text-sm text-[color:var(--sem-text-secondary)]">
        {t("searching")}
      </div>
    );
  }

  if (transportError) {
    return (
      <div className="theme-alert-error rounded-[18px] border p-3 text-sm">
        {transportError}
      </div>
    );
  }

  if (!results) {
    return null;
  }

  if (!flatResults.length) {
    return (
      <div className="theme-control-surface rounded-[18px] border p-3 text-sm text-[color:var(--sem-text-secondary)]">
        {t("noMatches")}
      </div>
    );
  }

  return (
    <div className="theme-surface-card overflow-hidden rounded-[18px] border shadow-sm">
      {results.meta.partial ? (
        <div className="theme-alert-warning border-b px-3 py-2 text-xs">
          {t("partial")}
        </div>
      ) : null}
      <ul className="max-h-96 overflow-auto py-1">
        {flatResults.map((item, index) => (
          <li key={`${item.entity}-${item.id}`}>
            <Link
              href={item.destination}
              className={[
                "block px-3 py-2 text-sm transition",
                activeIndex === index
                  ? "bg-[color:var(--cmp-hover-surface)]"
                  : "hover:bg-[color:var(--cmp-hover-surface)]",
              ].join(" ")}
              onMouseEnter={() => onHover(index)}
            >
              <div className="font-medium">{item.title}</div>
              <div className="text-xs text-[color:var(--sem-text-muted)]">{item.subtitle}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
