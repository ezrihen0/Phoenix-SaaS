"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { LanguageStoreLanguageCard } from "@/components/language-store-language-card";
import { getWorkerUiLanguageLabel, isSupportedWorkerUiLocale } from "@/lib/i18n/locales";
import type { LanguageStoreLanguageCard as LanguageStoreLanguageCardPayload } from "@/lib/language-store/client-language-store";

type LanguageTab = "all" | "enabled" | "availableLocked";

type LanguageStoreLanguageGridProps = {
  languages: LanguageStoreLanguageCardPayload[];
  busyCode: string | null;
  onActivate: (languageCode: string) => void;
  onDeactivate: (languageCode: string) => void;
};

function matchesSearch(language: LanguageStoreLanguageCardPayload, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const nativeLabel = isSupportedWorkerUiLocale(language.code)
    ? getWorkerUiLanguageLabel(language.code).toLowerCase()
    : "";

  return (
    language.code.toLowerCase().includes(normalized)
    || language.label.toLowerCase().includes(normalized)
    || nativeLabel.includes(normalized)
  );
}

function matchesTab(language: LanguageStoreLanguageCardPayload, tab: LanguageTab) {
  if (tab === "all") {
    return true;
  }

  if (tab === "enabled") {
    return language.state === "active";
  }

  return language.state !== "active";
}

export function LanguageStoreLanguageGrid({
  languages,
  busyCode,
  onActivate,
  onDeactivate,
}: LanguageStoreLanguageGridProps) {
  const t = useTranslations("languageStore");
  const [tab, setTab] = useState<LanguageTab>("all");
  const [search, setSearch] = useState("");

  const filteredLanguages = useMemo(
    () => languages.filter((language) => matchesTab(language, tab) && matchesSearch(language, search)),
    [languages, search, tab],
  );

  const tabs: Array<{ id: LanguageTab; label: string }> = [
    { id: "all", label: t("tabs.all") },
    { id: "enabled", label: t("tabs.enabled") },
    { id: "availableLocked", label: t("tabs.availableLocked") },
  ];

  return (
    <section className="sem-ai-inspector-surface rounded-2xl p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-ai-grid-text-muted)]">{t("panels.registry")}</p>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--sem-ai-grid-text-primary)]">{t("tabs.all")}</h2>
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--sem-ai-grid-text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="theme-input-control w-full rounded-xl py-2.5 pl-10 pr-3 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((item) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={
                selected
                  ? "theme-selected-card rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]"
                  : "theme-control-surface rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--sem-ai-grid-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)]"
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {filteredLanguages.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-[color:var(--sem-ai-node-border)] px-4 py-8 text-center text-sm text-[color:var(--sem-ai-grid-text-muted)]">
          {t("noSearchResults")}
        </p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {filteredLanguages.map((language) => (
            <LanguageStoreLanguageCard
              key={language.code}
              language={language}
              busyCode={busyCode}
              onActivate={onActivate}
              onDeactivate={onDeactivate}
              variant="premium"
            />
          ))}
        </div>
      )}
    </section>
  );
}
