import type { AbstractIntlMessages } from "next-intl";

import en from "@/messages/en";
import es from "@/messages/es";
import he from "@/messages/he";
import pl from "@/messages/pl";
import uk from "@/messages/uk";
import type { SupportedWorkerUiLocale } from "@/lib/i18n/locales";

const messageCatalogs: Record<SupportedWorkerUiLocale, AbstractIntlMessages> = {
  en,
  es,
  he,
  uk,
  pl,
};

export function loadMessages(locale: SupportedWorkerUiLocale) {
  return messageCatalogs[locale];
}
