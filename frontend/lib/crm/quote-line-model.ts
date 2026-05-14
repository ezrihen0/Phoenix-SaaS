import type { Database } from "@/lib/types/database";
import type {
  PricebookBundleDetail,
  PricebookBundleItem,
  PricebookItem,
} from "@/lib/crm/pricebook-model";
import type {
  CustomerOutputTranslationRecord,
  CustomerOutputTranslationStatus,
} from "@/lib/language-store/client-customer-output-translations";

export type QuoteStatus = Database["public"]["Enums"]["quote_status"];

export type PersistedQuoteLineItem = {
  id: string;
  quote_id: string;
  pricebook_item_id: string | null;
  document_line_key: string | null;
  sku_snapshot: string;
  name_snapshot: string;
  description_snapshot: string | null;
  item_type_snapshot: string;
  unit_of_measure_snapshot: string | null;
  unit_price_cents_snapshot: number;
  base_cost_cents_snapshot: number | null;
  material_cost_cents_snapshot: number | null;
  labor_cost_cents_snapshot: number | null;
  estimated_labor_minutes_snapshot: number | null;
  warranty_months_snapshot: number | null;
  quantity: string;
  line_subtotal_cents: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type QuoteBuilderLine = {
  clientId: string;
  documentLineKey: string;
  kind: "pricebook_item" | "manual";
  pricebookItemId: string | null;
  sourceLabel: string | null;
  sku: string | null;
  name: string;
  originalName: string | null;
  description: string;
  quantity: string;
  unitPriceInput: string;
  unitPriceCents: number;
  originalUnitPriceCents: number | null;
  originalDescription: string | null;
  itemType: string;
  unitOfMeasure: string | null;
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

export type QuotePreviewTotals = {
  subtotalCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
};

export type QuoteUpsertPayloadLineItem =
  | {
      kind: "pricebook_item";
      documentLineKey: string;
      pricebookItemId: string;
      quantity: string;
      sortOrder: number;
      unitPriceCentsOverride?: number;
      nameOverride?: string | null;
      descriptionOverride?: string | null;
      nameTranslationRecordId?: string | null;
      descriptionTranslationRecordId?: string | null;
    }
  | {
      kind: "manual";
      documentLineKey: string;
      name: string;
      quantity: string;
      unitPriceCents: number;
      sortOrder: number;
      description?: string | null;
      nameTranslationRecordId?: string | null;
      descriptionTranslationRecordId?: string | null;
    };

let clientIdCounter = 0;
let documentLineKeyCounter = 0;

function nextClientId(prefix: string) {
  clientIdCounter += 1;
  return `${prefix}-${clientIdCounter}`;
}

function nextDocumentLineKey(prefix: string) {
  documentLineKeyCounter += 1;
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${documentLineKeyCounter}-${randomSuffix}`;
}

function createEmptyTranslationState() {
  return {
    recordId: null,
    text: null,
    status: null as CustomerOutputTranslationStatus | null,
    sourceText: null,
    sourceLanguageCode: null,
  };
}

function tryParseCurrencyInputToCents(input: string) {
  const normalized = input.trim();

  if (!normalized || !/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return 0;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed * 100);
}

export function formatCurrencyFromCents(cents: number | null | undefined) {
  if (typeof cents !== "number") {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function formatCentsInput(cents: number | null | undefined) {
  if (typeof cents !== "number") {
    return "";
  }

  return (cents / 100).toFixed(2);
}

export function parseCurrencyInputToCents(input: string, fieldName: string) {
  const normalized = input.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a valid amount with up to two decimal places.`);
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be zero or greater.`);
  }

  return Math.round(parsed * 100);
}

export function normalizeQuantityInput(input: string, fieldName: string) {
  const normalized = input.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a positive quantity with up to three decimal places.`);
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }

  return parsed.toFixed(3).replace(/\.000$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

export function taxRateInputToBps(input: string) {
  const normalized = input.trim();

  if (!normalized) {
    return 0;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Tax rate must be a valid percentage with up to two decimal places.");
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Tax rate must be zero or greater.");
  }

  return Math.round(parsed * 100);
}

export function bpsToTaxRateInput(bps: number | null | undefined) {
  if (typeof bps !== "number" || bps <= 0) {
    return "0";
  }

  return (bps / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

export function getQuoteLineUnitPriceCents(line: QuoteBuilderLine) {
  return tryParseCurrencyInputToCents(line.unitPriceInput);
}

export function createManualQuoteLine(): QuoteBuilderLine {
  const nameTranslation = createEmptyTranslationState();
  const descriptionTranslation = createEmptyTranslationState();
  return {
    clientId: nextClientId("manual"),
    documentLineKey: nextDocumentLineKey("quote-manual"),
    kind: "manual",
    pricebookItemId: null,
    sourceLabel: null,
    sku: null,
    name: "",
    originalName: null,
    description: "",
    quantity: "1",
    unitPriceInput: "0.00",
    unitPriceCents: 0,
    originalUnitPriceCents: null,
    originalDescription: null,
    itemType: "manual",
    unitOfMeasure: null,
    nameTranslationRecordId: nameTranslation.recordId,
    nameTranslationText: nameTranslation.text,
    nameTranslationStatus: nameTranslation.status,
    nameTranslationSourceText: nameTranslation.sourceText,
    nameTranslationSourceLanguageCode: nameTranslation.sourceLanguageCode,
    descriptionTranslationRecordId: descriptionTranslation.recordId,
    descriptionTranslationText: descriptionTranslation.text,
    descriptionTranslationStatus: descriptionTranslation.status,
    descriptionTranslationSourceText: descriptionTranslation.sourceText,
    descriptionTranslationSourceLanguageCode: descriptionTranslation.sourceLanguageCode,
  };
}

export function quoteLineFromPricebookItem(item: PricebookItem): QuoteBuilderLine {
  const nameTranslation = createEmptyTranslationState();
  const descriptionTranslation = createEmptyTranslationState();
  return {
    clientId: nextClientId("item"),
    documentLineKey: nextDocumentLineKey("quote-item"),
    kind: "pricebook_item",
    pricebookItemId: item.id,
    sourceLabel: null,
    sku: item.internal_sku,
    name: item.name,
    originalName: item.name,
    description: item.customer_description ?? "",
    quantity: "1",
    unitPriceInput: formatCentsInput(item.customer_price_cents),
    unitPriceCents: item.customer_price_cents,
    originalUnitPriceCents: item.customer_price_cents,
    originalDescription: item.customer_description,
    itemType: item.item_type,
    unitOfMeasure: item.unit_of_measure,
    nameTranslationRecordId: nameTranslation.recordId,
    nameTranslationText: nameTranslation.text,
    nameTranslationStatus: nameTranslation.status,
    nameTranslationSourceText: nameTranslation.sourceText,
    nameTranslationSourceLanguageCode: nameTranslation.sourceLanguageCode,
    descriptionTranslationRecordId: descriptionTranslation.recordId,
    descriptionTranslationText: descriptionTranslation.text,
    descriptionTranslationStatus: descriptionTranslation.status,
    descriptionTranslationSourceText: descriptionTranslation.sourceText,
    descriptionTranslationSourceLanguageCode: descriptionTranslation.sourceLanguageCode,
  };
}

function quoteLineFromBundleItem(bundleName: string, bundleItem: PricebookBundleItem): QuoteBuilderLine {
  const item = bundleItem.pricebook_item;

  if (!item) {
    throw new Error("Bundle item is missing its pricebook item.");
  }

  const nameTranslation = createEmptyTranslationState();
  const descriptionTranslation = createEmptyTranslationState();
  return {
    clientId: nextClientId("bundle-item"),
    documentLineKey: nextDocumentLineKey("quote-bundle"),
    kind: "pricebook_item",
    pricebookItemId: item.id,
    sourceLabel: bundleName,
    sku: item.internal_sku,
    name: item.name,
    originalName: item.name,
    description: item.customer_description ?? "",
    quantity: normalizeQuantityInput(bundleItem.default_quantity, "Bundle quantity"),
    unitPriceInput: formatCentsInput(item.customer_price_cents),
    unitPriceCents: item.customer_price_cents,
    originalUnitPriceCents: item.customer_price_cents,
    originalDescription: item.customer_description,
    itemType: item.item_type,
    unitOfMeasure: item.unit_of_measure,
    nameTranslationRecordId: nameTranslation.recordId,
    nameTranslationText: nameTranslation.text,
    nameTranslationStatus: nameTranslation.status,
    nameTranslationSourceText: nameTranslation.sourceText,
    nameTranslationSourceLanguageCode: nameTranslation.sourceLanguageCode,
    descriptionTranslationRecordId: descriptionTranslation.recordId,
    descriptionTranslationText: descriptionTranslation.text,
    descriptionTranslationStatus: descriptionTranslation.status,
    descriptionTranslationSourceText: descriptionTranslation.sourceText,
    descriptionTranslationSourceLanguageCode: descriptionTranslation.sourceLanguageCode,
  };
}

export function quoteLinesFromBundle(bundle: PricebookBundleDetail) {
  return bundle.items
    .filter((bundleItem) => bundleItem.pricebook_item)
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((bundleItem) => quoteLineFromBundleItem(bundle.name, bundleItem));
}

export function quoteLinesFromPersistedSnapshot(
  lines: PersistedQuoteLineItem[],
  fallbackAmountCents?: number,
): QuoteBuilderLine[] {
  if (lines.length > 0) {
    return [...lines]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((line) => {
        const nameTranslation = createEmptyTranslationState();
        const descriptionTranslation = createEmptyTranslationState();

        return {
          clientId: nextClientId("persisted"),
          documentLineKey: line.document_line_key ?? nextDocumentLineKey("quote-persisted"),
          kind: line.pricebook_item_id ? "pricebook_item" : "manual",
          pricebookItemId: line.pricebook_item_id,
          sourceLabel: null,
          sku: line.sku_snapshot,
          name: line.name_snapshot,
          originalName: line.pricebook_item_id ? line.name_snapshot : null,
          description: line.description_snapshot ?? "",
          quantity: normalizeQuantityInput(line.quantity, "Quantity"),
          unitPriceInput: formatCentsInput(line.unit_price_cents_snapshot),
          unitPriceCents: line.unit_price_cents_snapshot,
          originalUnitPriceCents: line.pricebook_item_id ? line.unit_price_cents_snapshot : null,
          originalDescription: line.pricebook_item_id ? line.description_snapshot : null,
          itemType: line.item_type_snapshot,
          unitOfMeasure: line.unit_of_measure_snapshot,
          nameTranslationRecordId: nameTranslation.recordId,
          nameTranslationText: nameTranslation.text,
          nameTranslationStatus: nameTranslation.status,
          nameTranslationSourceText: nameTranslation.sourceText,
          nameTranslationSourceLanguageCode: nameTranslation.sourceLanguageCode,
          descriptionTranslationRecordId: descriptionTranslation.recordId,
          descriptionTranslationText: descriptionTranslation.text,
          descriptionTranslationStatus: descriptionTranslation.status,
          descriptionTranslationSourceText: descriptionTranslation.sourceText,
          descriptionTranslationSourceLanguageCode: descriptionTranslation.sourceLanguageCode,
        };
      });
  }

  if (typeof fallbackAmountCents === "number" && fallbackAmountCents > 0) {
    return [
      {
        ...createManualQuoteLine(),
        name: "Existing quote amount",
        unitPriceInput: formatCentsInput(fallbackAmountCents),
        unitPriceCents: fallbackAmountCents,
      },
    ];
  }

  return [];
}

export function calculateQuotePreviewTotals(lines: QuoteBuilderLine[], taxRateBps: number): QuotePreviewTotals {
  const subtotalCents = lines.reduce((runningTotal, line) => {
    const quantity = Number(line.quantity || "0");
    const lineSubtotalCents = Number.isFinite(quantity)
      ? Math.round(quantity * getQuoteLineUnitPriceCents(line))
      : 0;
    return runningTotal + lineSubtotalCents;
  }, 0);

  const taxCents = Math.round((subtotalCents * taxRateBps) / 10000);

  return {
    subtotalCents,
    taxRateBps,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

export function buildQuoteLineItemPayload(lines: QuoteBuilderLine[]): QuoteUpsertPayloadLineItem[] {
  return lines.map((line, index) => {
    const quantity = normalizeQuantityInput(line.quantity, `Line ${index + 1} quantity`);
    const unitPriceCents = parseCurrencyInputToCents(line.unitPriceInput, `Line ${index + 1} unit price`);
    const normalizedName = line.name.trim();
    const normalizedDescription = line.description.trim() ? line.description.trim() : null;
    const includeNameTranslation =
      line.nameTranslationStatus === "final"
      && line.nameTranslationRecordId
      && line.nameTranslationSourceText === normalizedName;
    const includeDescriptionTranslation =
      line.descriptionTranslationStatus === "final"
      && line.descriptionTranslationRecordId
      && line.descriptionTranslationSourceText === normalizedDescription;

    if (line.kind === "pricebook_item" && line.pricebookItemId) {
      return {
        kind: "pricebook_item",
        documentLineKey: line.documentLineKey,
        pricebookItemId: line.pricebookItemId,
        quantity,
        sortOrder: index,
        unitPriceCentsOverride:
          line.originalUnitPriceCents !== null && line.originalUnitPriceCents !== unitPriceCents
            ? unitPriceCents
            : undefined,
        nameOverride:
          line.originalName !== null && line.originalName !== normalizedName
            ? normalizedName
            : undefined,
        descriptionOverride:
          line.originalDescription !== null && line.originalDescription !== normalizedDescription
            ? normalizedDescription
            : undefined,
        nameTranslationRecordId: includeNameTranslation ? line.nameTranslationRecordId : undefined,
        descriptionTranslationRecordId:
          includeDescriptionTranslation ? line.descriptionTranslationRecordId : undefined,
      };
    }

    if (!normalizedName) {
      throw new Error(`Line ${index + 1} name is required.`);
    }

    return {
      kind: "manual",
      documentLineKey: line.documentLineKey,
      name: normalizedName,
      quantity,
      unitPriceCents,
      sortOrder: index,
      description: normalizedDescription,
      nameTranslationRecordId: includeNameTranslation ? line.nameTranslationRecordId : undefined,
      descriptionTranslationRecordId:
        includeDescriptionTranslation ? line.descriptionTranslationRecordId : undefined,
    };
  });
}

export function hydrateQuoteLineTranslations(
  lines: QuoteBuilderLine[],
  records: CustomerOutputTranslationRecord[],
): QuoteBuilderLine[] {
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
