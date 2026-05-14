type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export type CustomerOutputTranslationDocumentKind = "quote" | "invoice";
export type CustomerOutputTranslationFieldKey = "name" | "description";
export type CustomerOutputTranslationStatus = "draft" | "final";
export type CustomerOutputTranslationSurfaceKey =
  | "estimate_line_item_name"
  | "estimate_line_item_description"
  | "invoice_line_item_name"
  | "invoice_line_item_description"
  | "manual_line_text";

export type CustomerOutputTranslationRecord = {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  finalized_by_user_id: string | null;
  surface_key: CustomerOutputTranslationSurfaceKey;
  source_language_code: string;
  target_language_code: string;
  document_kind: CustomerOutputTranslationDocumentKind | null;
  document_id: string | null;
  document_line_key: string | null;
  field_key: CustomerOutputTranslationFieldKey | null;
  source_text: string;
  translated_text: string;
  final_text: string | null;
  source_character_count: number;
  units_consumed: number;
  provider_key: string;
  provider_model: string | null;
  provider_request_id: string | null;
  status: CustomerOutputTranslationStatus;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerOutputTranslationUsageSummary = {
  organization_id: string;
  total_translation_units: number;
  consumed_translation_units: number;
  remaining_translation_units: number;
  billing_period_start: string | null;
  billing_period_end: string | null;
};

export type CustomerOutputTranslationResult = {
  record: CustomerOutputTranslationRecord;
  usage: CustomerOutputTranslationUsageSummary;
};

type GenerateCustomerOutputTranslationPayload = {
  surface_key: CustomerOutputTranslationSurfaceKey;
  source_language_code: string;
  source_text: string;
  document_kind: CustomerOutputTranslationDocumentKind;
  document_id: string;
  document_line_key: string;
  field_key: CustomerOutputTranslationFieldKey;
};

async function customerOutputTranslationFetch<T>(input: string, init?: RequestInit): Promise<T> {
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
    throw new Error(payload?.error?.message ?? "The customer English output request could not be completed.");
  }

  return payload?.data as T;
}

export async function generateCustomerOutputTranslation(
  payload: GenerateCustomerOutputTranslationPayload,
) {
  return customerOutputTranslationFetch<CustomerOutputTranslationResult>(
    "/api/language-store/customer-output-translations/generate",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function finalizeCustomerOutputTranslation(recordId: string, finalText: string | null) {
  return customerOutputTranslationFetch<CustomerOutputTranslationResult>(
    `/api/language-store/customer-output-translations/${recordId}/finalize`,
    {
      method: "POST",
      body: JSON.stringify({ final_text: finalText }),
    },
  );
}

export async function listDocumentCustomerOutputTranslations(
  documentKind: CustomerOutputTranslationDocumentKind,
  documentId: string,
) {
  const query = new URLSearchParams({
    document_kind: documentKind,
    document_id: documentId,
  });

  return customerOutputTranslationFetch<CustomerOutputTranslationRecord[]>(
    `/api/language-store/customer-output-translations/document?${query.toString()}`,
  );
}
