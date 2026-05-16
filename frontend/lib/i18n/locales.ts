export const supportedWorkerUiLocales = ["en", "es", "he", "uk", "pl"] as const;

export type SupportedWorkerUiLocale = (typeof supportedWorkerUiLocales)[number];
export type WorkerUiDirection = "ltr" | "rtl";

type WorkerUiLocaleDefinition = {
  code: SupportedWorkerUiLocale;
  direction: WorkerUiDirection;
  intlLocale: string;
  nativeLabel: string;
};

const localeDefinitions: Record<SupportedWorkerUiLocale, WorkerUiLocaleDefinition> = {
  en: {
    code: "en",
    direction: "ltr",
    intlLocale: "en-US",
    nativeLabel: "English",
  },
  es: {
    code: "es",
    direction: "ltr",
    intlLocale: "es-ES",
    nativeLabel: "Espanol",
  },
  he: {
    code: "he",
    direction: "rtl",
    intlLocale: "he-IL",
    nativeLabel: "עברית",
  },
  uk: {
    code: "uk",
    direction: "ltr",
    intlLocale: "uk-UA",
    nativeLabel: "Українська",
  },
  pl: {
    code: "pl",
    direction: "ltr",
    intlLocale: "pl-PL",
    nativeLabel: "Polski",
  },
};

const defaultLocale: SupportedWorkerUiLocale = "en";

export function isSupportedWorkerUiLocale(value: string): value is SupportedWorkerUiLocale {
  return supportedWorkerUiLocales.includes(value as SupportedWorkerUiLocale);
}

export function resolveSupportedWorkerUiLocale(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return isSupportedWorkerUiLocale(normalized) ? normalized : defaultLocale;
}

export function getWorkerUiLocaleDefinition(locale: SupportedWorkerUiLocale) {
  return localeDefinitions[locale];
}

export function getWorkerUiDirection(locale: SupportedWorkerUiLocale) {
  return getWorkerUiLocaleDefinition(locale).direction;
}

export function getWorkerUiIntlLocale(locale: SupportedWorkerUiLocale) {
  return getWorkerUiLocaleDefinition(locale).intlLocale;
}

export function getWorkerUiLanguageLabel(locale: SupportedWorkerUiLocale) {
  return getWorkerUiLocaleDefinition(locale).nativeLabel;
}

export function getDefaultWorkerUiLocale() {
  return defaultLocale;
}
