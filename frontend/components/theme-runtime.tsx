"use client";

import { useLayoutEffect } from "react";

export const THEME_STORAGE_KEY = "wizfield.appearance.theme";
export const DEFAULT_THEME = "brown-cream";

export const THEME_OPTIONS = [
  {
    id: "brown-cream",
    label: "Brown / Cream",
    description: "Warm walnut surfaces with creamy highlights.",
    swatches: ["#1A120B", "#3C2A21", "#D5CEA3", "#E5E5CB"],
  },
  {
    id: "fire-ember",
    label: "Fire / Ember",
    description: "Deep ember reds with a hotter accent edge.",
    swatches: ["#280905", "#740A03", "#C3110C", "#E6501B"],
  },
  {
    id: "ash-rose",
    label: "Ash / Rose",
    description: "Muted ash neutrals with soft rose contrast.",
    swatches: ["#452829", "#57595B", "#E8D1C5", "#F3E8DF"],
  },
] as const;

export type ThemeId = (typeof THEME_OPTIONS)[number]["id"];

function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEME_OPTIONS.some((option) => option.id === value);
}

function readThemeStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeThemeStorage(theme: ThemeId) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures and still apply the theme for the active session.
  }
}

export function readStoredTheme(): ThemeId {
  const stored = readThemeStorage();
  return isThemeId(stored) ? stored : DEFAULT_THEME;
}

export function applyTheme(theme: ThemeId) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }

  writeThemeStorage(theme);
}

export function ThemeRuntime() {
  useLayoutEffect(() => {
    const theme = readStoredTheme();
    applyTheme(theme);
  }, []);

  return null;
}