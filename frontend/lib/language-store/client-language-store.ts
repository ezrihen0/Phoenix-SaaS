type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export type LanguageStoreCardState = "active" | "available" | "locked" | "slot_full";

export type LanguageStoreLanguageCard = {
  code: string;
  label: string;
  direction: "ltr" | "rtl";
  is_default: boolean;
  consumes_paid_slot: boolean;
  sort_order: number;
  state: LanguageStoreCardState;
  can_activate: boolean;
  can_deactivate: boolean;
  locked_reason: string | null;
};

export type LanguageStoreSurfacePayload = {
  organization_id: string;
  billing_account_id: string;
  plan_key: string;
  billing_status: string;
  language_store_enabled: boolean;
  can_manage_languages: boolean;
  active_additional_language_count: number;
  remaining_additional_language_slots: number;
  included_additional_language_slots: number;
  addon_additional_language_slots: number;
  total_additional_language_slots: number;
  included_translation_units: number;
  addon_translation_units: number;
  total_translation_units: number;
  languages: LanguageStoreLanguageCard[];
  prompt: {
    kind: "upgrade" | "add_on" | "billing_attention" | null;
    title: string | null;
    message: string | null;
  };
};

async function languageStoreFetch<T>(input: string, init?: RequestInit): Promise<T> {
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
    throw new Error(payload?.error?.message ?? "The Language Store request could not be completed.");
  }

  return payload?.data as T;
}

export async function activateOrganizationLanguage(languageCode: string) {
  return languageStoreFetch<LanguageStoreSurfacePayload>("/api/language-store/languages/activate", {
    method: "POST",
    body: JSON.stringify({ language_code: languageCode }),
  });
}

export async function deactivateOrganizationLanguage(languageCode: string) {
  return languageStoreFetch<LanguageStoreSurfacePayload>("/api/language-store/languages/deactivate", {
    method: "POST",
    body: JSON.stringify({ language_code: languageCode }),
  });
}
