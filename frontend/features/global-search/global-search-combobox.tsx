"use client";

import { useRouter } from "next/navigation";

import type { FlattenedResult } from "./global-search.types";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  moveActiveIndex: (delta: number) => void;
  activeIndex: number;
  flatResults: FlattenedResult[];
  autoFocus?: boolean;
};

export function GlobalSearchCombobox({
  query,
  onQueryChange,
  moveActiveIndex,
  activeIndex,
  flatResults,
  autoFocus = false,
}: Props) {
  const router = useRouter();

  return (
    <input
      autoFocus={autoFocus}
      value={query}
      onChange={(event) => onQueryChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveActiveIndex(1);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveActiveIndex(-1);
          return;
        }

        if (event.key === "Enter" && activeIndex >= 0 && activeIndex < flatResults.length) {
          event.preventDefault();
          router.push(flatResults[activeIndex].destination);
        }
      }}
      placeholder="Search jobs and customers"
      className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none placeholder:text-[color:var(--cmp-input-placeholder)]"
      aria-label="Global search"
    />
  );
}
