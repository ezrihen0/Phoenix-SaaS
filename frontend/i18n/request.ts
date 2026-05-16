import { getRequestConfig } from "next-intl/server";

import { loadMessages } from "@/lib/i18n/load-messages";
import { getRequestLocaleState } from "@/lib/i18n/request-locale";

export default getRequestConfig(async () => {
  const state = await getRequestLocaleState();

  return {
    locale: state.locale,
    messages: loadMessages(state.locale),
  };
});
