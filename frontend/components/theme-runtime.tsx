"use client";

import { useLayoutEffect } from "react";

export const THEME_STORAGE_KEY = "wizfield.appearance.theme";
export const THEME_CHANGE_EVENT = "wizfield-theme-change";
const PREVIOUS_NON_BRIGHT_THEME_KEY = "wizfield.appearance.previous-non-bright-theme";
export const DEFAULT_THEME = "brown-cream";
export const BRIGHT_THEME_ID = "fire-ember" as const;

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

function readPreviousNonBrightTheme(): ThemeId {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  try {
    const stored = window.localStorage.getItem(PREVIOUS_NON_BRIGHT_THEME_KEY);
    return isThemeId(stored) && stored !== BRIGHT_THEME_ID ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function rememberNonBrightTheme(theme: ThemeId) {
  if (typeof window === "undefined" || theme === BRIGHT_THEME_ID) {
    return;
  }

  try {
    window.localStorage.setItem(PREVIOUS_NON_BRIGHT_THEME_KEY, theme);
  } catch {
    // Ignore storage failures. Bright mode can still fall back to the default theme.
  }
}

function syncDocumentColorScheme(theme: ThemeId) {
  if (typeof document === "undefined") {
    return;
  }

  const bright = theme === BRIGHT_THEME_ID;
  document.documentElement.style.colorScheme = bright ? "light" : "dark";
  document.documentElement.style.backgroundColor = bright ? "#f8fafc" : "#05070c";

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", bright ? "#f8fafc" : "#05070c");
  }
}

export function applyTheme(theme: ThemeId) {
  if (theme !== BRIGHT_THEME_ID) {
    rememberNonBrightTheme(theme);
  }

  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
    syncDocumentColorScheme(theme);
  }

  writeThemeStorage(theme);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }));
  }
}

export function toggleBrightMode(): ThemeId {
  const current = readStoredTheme();
  if (current !== BRIGHT_THEME_ID) {
    rememberNonBrightTheme(current);
  }

  const next = current === BRIGHT_THEME_ID ? readPreviousNonBrightTheme() : BRIGHT_THEME_ID;
  applyTheme(next);
  return next;
}

export function ThemeRuntime() {
  useLayoutEffect(() => {
    const theme = readStoredTheme();
    applyTheme(theme);
  }, []);

  return null;
}