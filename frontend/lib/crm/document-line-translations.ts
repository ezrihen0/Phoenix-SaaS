import type {
  CustomerOutputTranslationDocumentKind,
  CustomerOutputTranslationFieldKey,
  CustomerOutputTranslationRecord,
  CustomerOutputTranslationStatus,
} from "@/lib/language-store/client-customer-output-translations";
import { listDocumentCustomerOutputTranslations } from "@/lib/language-store/client-customer-output-translations";
import { getClientLanguagePreference } from "@/lib/language-store/client-language-preferences";

export type DocumentLineTranslationState = {
  recordId: string | null;
  text: string | null;
  status: CustomerOutputTranslationStatus | null;
  sourceText: string | null;
  sourceLanguageCode: string | null;
};

export type DocumentLineTranslationFields = {
  documentLineKey: string;
  nameTranslationRecordId: string | null;
  nameTranslationText: string | null;
  nameTranslationStatus: CustomerOutputTranslationStatus | null;
  nameTranslationSourceText: string | null;
  nameTranslationSourceLanguageCode: string | null;
  descriptionTranslationRecordId: string | null;
  descriptionTranslationText: string | null;
  descriptionTranslationStatus: CustomerOutputTranslationStatus | null;
  descriptionTranslationSourceText: string | null;
  descriptionTranslationSourceLanguageCode: string | null;
};

export function createEmptyDocumentLineTranslationState(): DocumentLineTranslationState {
  return {
    recordId: null,
    text: null,
    status: null,
    sourceText: null,
    sourceLanguageCode: null,
  };
}

export function createEmptyDocumentLineTranslationFields(): Omit<DocumentLineTranslationFields, "documentLineKey"> {
  const emptyState = createEmptyDocumentLineTranslationState();
  return {
    nameTranslationRecordId: emptyState.recordId,
    nameTranslationText: emptyState.text,
    nameTranslationStatus: emptyState.status,
    nameTranslationSourceText: emptyState.sourceText,
    nameTranslationSourceLanguageCode: emptyState.sourceLanguageCode,
    descriptionTranslationRecordId: emptyState.recordId,
    descriptionTranslationText: emptyState.text,
    descriptionTranslationStatus: emptyState.status,
    descriptionTranslationSourceText: emptyState.sourceText,
    descriptionTranslationSourceLanguageCode: emptyState.sourceLanguageCode,
  };
}

export function getDocumentLineTranslationState<T extends DocumentLineTranslationFields>(
  line: T,
  field: CustomerOutputTranslationFieldKey,
): DocumentLineTranslationState {
  if (field === "name") {
    return {
      recordId: line.nameTranslationRecordId,
      text: line.nameTranslationText,
      status: line.nameTranslationStatus,
      sourceText: line.nameTranslationSourceText,
      sourceLanguageCode: line.nameTranslationSourceLanguageCode,
    };
  }

  return {
    recordId: line.descriptionTranslationRecordId,
    text: line.descriptionTranslationText,
    status: line.descriptionTranslationStatus,
    sourceText: line.descriptionTranslationSourceText,
    sourceLanguageCode: line.descriptionTranslationSourceLanguageCode,
  };
}

export function applyDocumentLineTranslationState<T extends DocumentLineTranslationFields>(
  line: T,
  field: CustomerOutputTranslationFieldKey,
  value: DocumentLineTranslationState,
): T {
  if (field === "name") {
    return {
      ...line,
      nameTranslationRecordId: value.recordId,
      nameTranslationText: value.text,
      nameTranslationStatus: value.status,
      nameTranslationSourceText: value.sourceText,
      nameTranslationSourceLanguageCode: value.sourceLanguageCode,
    };
  }

  return {
    ...line,
    descriptionTranslationRecordId: value.recordId,
    descriptionTranslationText: value.text,
    descriptionTranslationStatus: value.status,
    descriptionTranslationSourceText: value.sourceText,
    descriptionTranslationSourceLanguageCode: value.sourceLanguageCode,
  };
}

export function hydrateDocumentLineTranslations<T extends DocumentLineTranslationFields>(
  lines: T[],
  records: CustomerOutputTranslationRecord[],
): T[] {
  const translationByLineField = new Map<string, CustomerOutputTranslationRecord>();

  for (const record of records) {
    if (!record.document_line_key || !record.field_key) {
      continue;
    }

    translationByLineField.set(`${record.document_line_key}:${record.field_key}`, record);
  }

  return lines.map((line) => {
    const nameRecord = translationByLineField.get(`${line.documentLineKey}:name`);
    const descriptionRecord = translationByLineField.get(`${line.documentLineKey}:description`);

    return {
      ...line,
      nameTranslationRecordId: nameRecord?.id ?? null,
      nameTranslationText: nameRecord?.final_text ?? nameRecord?.translated_text ?? null,
      nameTranslationStatus: nameRecord?.status ?? null,
      nameTranslationSourceText: nameRecord?.source_text ?? null,
      nameTranslationSourceLanguageCode: nameRecord?.source_language_code ?? null,
      descriptionTranslationRecordId: descriptionRecord?.id ?? null,
      descriptionTranslationText: descriptionRecord?.final_text ?? descriptionRecord?.translated_text ?? null,
      descriptionTranslationStatus: descriptionRecord?.status ?? null,
      descriptionTranslationSourceText: descriptionRecord?.source_text ?? null,
      descriptionTranslationSourceLanguageCode: descriptionRecord?.source_language_code ?? null,
    };
  });
}

export function getFinalizedDocumentLineTranslationRecordId<T extends DocumentLineTranslationFields>(
  line: T,
  field: CustomerOutputTranslationFieldKey,
  currentText: string | null,
) {
  const translationState = getDocumentLineTranslationState(line, field);

  if (
    translationState.status !== "final"
    || !translationState.recordId
    || normalizeComparableText(translationState.sourceText) !== normalizeComparableText(currentText)
  ) {
    return undefined;
  }

  return translationState.recordId;
}

export async function hydrateDocumentTranslationsForSave<T extends DocumentLineTranslationFields>(
  documentKind: CustomerOutputTranslationDocumentKind,
  documentId: string,
  lines: T[],
): Promise<T[]> {
  const records = await listDocumentCustomerOutputTranslations(documentKind, documentId).catch(() => []);
  return hydrateDocumentLineTranslations(lines, records);
}

export async function loadDocumentSourceLanguageCode() {
  try {
    const preference = await getClientLanguagePreference();
    return preference.effective_language_code === "en" ? null : preference.effective_language_code;
  } catch {
    return null;
  }
}

function normalizeComparableText(value: string | null | undefined) {
  return (value ?? "").trim();
}
