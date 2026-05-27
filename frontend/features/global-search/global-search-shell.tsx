"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { getClientSession } from "@/lib/auth/client-auth";
import { ThemeRuntime } from "@/components/theme-runtime";

import { GlobalSearchCombobox } from "./global-search-combobox";
import { GlobalSearchResults } from "./global-search-results";
import { useGlobalSearch } from "./use-global-search";

const DISALLOWED_PREFIXES = ["/login", "/reset-password"];

type SearchCapableRole = "owner" | "admin" | "office_admin";

type GlobalSearchShellProps = {
  mode?: "bar" | "popover" | "sheet";
  open?: boolean;
  onClose?: () => void;
};

function isAllowedPath(pathname: string) {
  return !DISALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function canUseGlobalSearch(role: string | null | undefined): role is SearchCapableRole {
  return role === "owner" || role === "admin" || role === "office_admin";
}

export function GlobalSearchShell({ mode = "bar", open = true, onClose }: GlobalSearchShellProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const [isOfficeRoute, setIsOfficeRoute] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolveVisibility() {
      await Promise.resolve();

      if (!pathname || !isAllowedPath(pathname)) {
        if (!cancelled) {
          setIsOfficeRoute(false);
        }

        return;
      }

      const session = await getClientSession().catch(() => null);
      const isOffice = canUseGlobalSearch(session?.profile?.role);

      if (!cancelled) {
        setIsOfficeRoute(Boolean(isOffice));
      }
    }

    void resolveVisibility();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const enabled = useMemo(() => isOfficeRoute, [isOfficeRoute]);
  const {
    query,
    setQuery,
    loading,
    transportError,
    results,
    flatResults,
    activeIndex,
    setActiveIndex,
    moveActiveIndex,
  } = useGlobalSearch(enabled);

  if (!enabled) {
    return <ThemeRuntime />;
  }

  if ((mode === "popover" || mode === "sheet") && !open) {
    return null;
  }

  if (mode === "sheet") {
    return (
      <>
        <ThemeRuntime />
        <div className="fixed inset-0 z-[70] flex flex-col bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
          <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--cmp-border-subtle)] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">
              {t("shell.searchAria")}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="theme-btn-ghost rounded-full px-3 py-2 text-xs font-semibold"
            >
              {t("common.actions.close")}
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col space-y-2 overflow-y-auto p-4">
            <GlobalSearchCombobox
              query={query}
              onQueryChange={setQuery}
              moveActiveIndex={moveActiveIndex}
              activeIndex={activeIndex}
              flatResults={flatResults}
              autoFocus
            />
            <GlobalSearchResults
              loading={loading}
              transportError={transportError}
              results={results}
              activeIndex={activeIndex}
              flatResults={flatResults}
              onHover={setActiveIndex}
            />
          </div>
        </div>
      </>
    );
  }

  if (mode === "popover") {
    return (
      <div className="absolute right-0 top-full mt-3 w-[min(34rem,calc(100vw-2rem))] rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/98 p-3 text-[color:var(--sem-text-primary)] shadow-[0_24px_70px_color-mix(in_srgb,var(--bg-canvas)_58%,transparent)] backdrop-blur-xl">
        <div className="space-y-2">
          <GlobalSearchCombobox
            query={query}
            onQueryChange={setQuery}
            moveActiveIndex={moveActiveIndex}
            activeIndex={activeIndex}
            flatResults={flatResults}
            autoFocus
          />
          <GlobalSearchResults
            loading={loading}
            transportError={transportError}
            results={results}
            activeIndex={activeIndex}
            flatResults={flatResults}
            onHover={setActiveIndex}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <ThemeRuntime />
      <div className="border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-3 text-[color:var(--sem-text-primary)]">
        <div className="mx-auto w-full max-w-4xl space-y-2">
          <GlobalSearchCombobox
            query={query}
            onQueryChange={setQuery}
            moveActiveIndex={moveActiveIndex}
            activeIndex={activeIndex}
            flatResults={flatResults}
            autoFocus={false}
          />
          <GlobalSearchResults
            loading={loading}
            transportError={transportError}
            results={results}
            activeIndex={activeIndex}
            flatResults={flatResults}
            onHover={setActiveIndex}
          />
        </div>
      </div>
    </>
  );
}
