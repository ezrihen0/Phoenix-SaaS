type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export type LanguagePreferencePayload = {
  organization_id: string;
  user_id: string;
  stored_language_code: string | null;
  effective_language_code: string;
  effective_language: {
    code: string;
    label: string;
    direction: "ltr" | "rtl";
    is_default: boolean;
    consumes_paid_slot: boolean;
    sort_order: number;
  };
  enabled_languages: Array<{
    code: string;
    label: string;
    direction: "ltr" | "rtl";
    is_default: boolean;
    consumes_paid_slot: boolean;
    sort_order: number;
  }>;
  fallback_to_default: boolean;
  fallback_reason: string | null;
};

async function languagePreferenceFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "The language preference request could not be completed.");
  }

  return payload?.data as T;
}

export async function getClientLanguagePreference() {
  return languagePreferenceFetch<LanguagePreferencePayload>("/api/language-store/preference");
}

export async function updateClientLanguagePreference(languageCode: string) {
  return languagePreferenceFetch<LanguagePreferencePayload>("/api/language-store/preference", {
    method: "POST",
    body: JSON.stringify({ language_code: languageCode }),
  });
}
