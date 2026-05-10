"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_THEME,
  THEME_OPTIONS,
  applyTheme,
  readStoredTheme,
  type ThemeId,
} from "@/components/theme-runtime";

export function ThemeAppearanceSelector() {
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const theme = readStoredTheme();
    setSelectedTheme(theme);
    applyTheme(theme);
  }, []);

  function handleThemeChange(theme: ThemeId) {
    setSelectedTheme(theme);
    applyTheme(theme);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-7 text-[color:var(--sem-text-secondary)]">
        Choose one of the approved frontend appearance themes. The selection is stored only in this browser and reapplies on reload.
      </p>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-[color:var(--sem-text-primary)]">Theme Selection</legend>
        <div className="grid gap-3">
          {THEME_OPTIONS.map((option) => {
            const selected = selectedTheme === option.id;

            return (
              <label
                key={option.id}
                className={[
                  selected ? "theme-selected-card" : "theme-control-surface",
                  "flex cursor-pointer flex-col gap-4 rounded-[22px] border px-4 py-4 transition hover:border-[color:var(--cmp-border-accent)]",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="appearance-theme"
                  value={option.id}
                  checked={selected}
                  onChange={() => handleThemeChange(option.id)}
                  className="sr-only"
                />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{option.label}</p>
                      {selected ? (
                        <span className="theme-badge inline-flex rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em]">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-[color:var(--sem-text-secondary)]">{option.description}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {option.swatches.map((swatch) => (
                      <span
                        key={swatch}
                        aria-hidden="true"
                        className="h-7 w-7 rounded-full border border-[color:var(--cmp-border-subtle)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                        style={{ backgroundColor: swatch }}
                      />
                    ))}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="theme-control-surface-soft rounded-[20px] border px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
        The active theme is applied by setting a theme attribute on the document root. No API call, backend preference, or database storage is used.
      </div>
    </div>
  );
}