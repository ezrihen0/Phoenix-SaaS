import { cookies } from "next/headers";
import { cache } from "react";

import {
  getDefaultWorkerUiLocale,
  getWorkerUiDirection,
  resolveSupportedWorkerUiLocale,
  type SupportedWorkerUiLocale,
  type WorkerUiDirection,
} from "@/lib/i18n/locales";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

type LanguagePreferenceResponse = {
  effective_language_code?: string | null;
  fallback_to_default?: boolean;
  fallback_reason?: string | null;
};

export type RequestLocaleState = {
  locale: SupportedWorkerUiLocale;
  direction: WorkerUiDirection;
  fallbackToDefault: boolean;
  fallbackReason: string | null;
};

const defaultLocale = getDefaultWorkerUiLocale();

function backendBaseUrl() {
  return process.env.BACKEND_INTERNAL_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
}

export const getRequestLocaleState = cache(async (): Promise<RequestLocaleState> => {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  if (!cookieHeader) {
    return {
      locale: defaultLocale,
      direction: getWorkerUiDirection(defaultLocale),
      fallbackToDefault: false,
      fallbackReason: null,
    };
  }

  try {
    const response = await fetch(`${backendBaseUrl()}/api/language-store/preference`, {
      method: "GET",
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        locale: defaultLocale,
        direction: getWorkerUiDirection(defaultLocale),
        fallbackToDefault: false,
        fallbackReason: null,
      };
    }

    const payload = await response.json().catch(() => null) as ApiEnvelope<LanguagePreferenceResponse> | null;
    const locale = resolveSupportedWorkerUiLocale(payload?.data?.effective_language_code);

    return {
      locale,
      direction: getWorkerUiDirection(locale),
      fallbackToDefault: Boolean(payload?.data?.fallback_to_default),
      fallbackReason: payload?.data?.fallback_reason ?? null,
    };
  } catch {
    return {
      locale: defaultLocale,
      direction: getWorkerUiDirection(defaultLocale),
      fallbackToDefault: false,
      fallbackReason: null,
    };
  }
});
