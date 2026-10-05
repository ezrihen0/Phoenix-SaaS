"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
  BRIGHT_THEME_ID,
  DEFAULT_THEME,
  THEME_CHANGE_EVENT,
  readStoredTheme,
  toggleBrightMode,
  type ThemeId,
} from "@/components/theme-runtime";

type MobileBrightModeToggleProps = {
  variant: "header" | "menu";
};

export function MobileBrightModeToggle({ variant }: MobileBrightModeToggleProps) {
  const t = useTranslations("shell.mobile");
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const bright = theme === BRIGHT_THEME_ID;

  useEffect(() => {
    const sync = () => setTheme(readStoredTheme());
    sync();
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  function handleToggle() {
    setTheme(toggleBrightMode());
  }

  if (variant === "header") {
    return (
      <button
        type="button"
        aria-pressed={bright}
        aria-label={bright ? t("useDarkMode") : t("useBrightMode")}
        onClick={handleToggle}
        className={[
          bright ? "theme-selected-card" : "theme-control-surface-soft",
          "inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border px-2 text-[11px] font-semibold transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)] max-[400px]:w-9 max-[400px]:justify-center max-[400px]:px-0",
        ].join(" ")}
      >
        {bright ? <Moon className="h-3.5 w-3.5 shrink-0" /> : <Sun className="h-3.5 w-3.5 shrink-0" />}
        <span className="max-[400px]:sr-only">{bright ? t("darkMode") : t("brightMode")}</span>
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
        {t("appearance")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={!bright}
          onClick={() => {
            if (bright) {
              handleToggle();
            }
          }}
          className={[
            !bright ? "theme-selected-card" : "theme-control-surface",
            "inline-flex min-h-11 items-center justify-center gap-2 rounded-[16px] border px-3 text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)]",
          ].join(" ")}
        >
          <Moon className="h-4 w-4 shrink-0" />
          <span>{t("darkMode")}</span>
        </button>
        <button
          type="button"
          aria-pressed={bright}
          onClick={() => {
            if (!bright) {
              handleToggle();
            }
          }}
          className={[
            bright ? "theme-selected-card" : "theme-control-surface",
            "inline-flex min-h-11 items-center justify-center gap-2 rounded-[16px] border px-3 text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)]",
          ].join(" ")}
        >
          <Sun className="h-4 w-4 shrink-0" />
          <span>{t("brightMode")}</span>
        </button>
      </div>
    </div>
  );
}
