import { getWorkerUiIntlLocale, type SupportedWorkerUiLocale } from "@/lib/i18n/locales";

type DateTimeOptions = Intl.DateTimeFormatOptions;
type NumberOptions = Intl.NumberFormatOptions;

function intlLocale(locale: SupportedWorkerUiLocale) {
  return getWorkerUiIntlLocale(locale);
}

export function formatLocalizedDate(
  value: string | Date,
  locale: SupportedWorkerUiLocale,
  options: DateTimeOptions,
) {
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(new Date(value));
}

export function formatLocalizedNumber(
  value: number,
  locale: SupportedWorkerUiLocale,
  options?: NumberOptions,
) {
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}

export function formatLocalizedCurrency(
  value: number,
  locale: SupportedWorkerUiLocale,
  currency: string,
  options?: NumberOptions,
) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    ...options,
  }).format(value);
}
