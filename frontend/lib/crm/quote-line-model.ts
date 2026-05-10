import type { Database } from "@/lib/types/database";
import type {
  PricebookBundleDetail,
  PricebookBundleItem,
  PricebookItem,
} from "@/lib/crm/pricebook-model";

export type QuoteStatus = Database["public"]["Enums"]["quote_status"];

export type PersistedQuoteLineItem = {
  id: string;
  quote_id: string;
  pricebook_item_id: string | null;
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
  kind: "pricebook_item" | "manual";
  pricebookItemId: string | null;
  sourceLabel: string | null;
  sku: string | null;
  name: string;
  description: string;
  quantity: string;
  unitPriceInput: string;
  unitPriceCents: number;
  originalUnitPriceCents: number | null;
  originalDescription: string | null;
  itemType: string;
  unitOfMeasure: string | null;
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
      pricebookItemId: string;
      quantity: string;
      sortOrder: number;
      unitPriceCentsOverride?: number;
      descriptionOverride?: string | null;
    }
  | {
      kind: "manual";
      name: string;
      quantity: string;
      unitPriceCents: number;
      sortOrder: number;
      description?: string | null;
    };

let clientIdCounter = 0;

function nextClientId(prefix: string) {
  clientIdCounter += 1;
  return `${prefix}-${clientIdCounter}`;
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
  return {
    clientId: nextClientId("manual"),
    kind: "manual",
    pricebookItemId: null,
    sourceLabel: null,
    sku: null,
    name: "",
    description: "",
    quantity: "1",
    unitPriceInput: "0.00",
    unitPriceCents: 0,
    originalUnitPriceCents: null,
    originalDescription: null,
    itemType: "manual",
    unitOfMeasure: null,
  };
}

export function quoteLineFromPricebookItem(item: PricebookItem): QuoteBuilderLine {
  return {
    clientId: nextClientId("item"),
    kind: "pricebook_item",
    pricebookItemId: item.id,
    sourceLabel: null,
    sku: item.internal_sku,
    name: item.name,
    description: item.customer_description ?? "",
    quantity: "1",
    unitPriceInput: formatCentsInput(item.customer_price_cents),
    unitPriceCents: item.customer_price_cents,
    originalUnitPriceCents: item.customer_price_cents,
    originalDescription: item.customer_description,
    itemType: item.item_type,
    unitOfMeasure: item.unit_of_measure,
  };
}

function quoteLineFromBundleItem(bundleName: string, bundleItem: PricebookBundleItem): QuoteBuilderLine {
  const item = bundleItem.pricebook_item;

  if (!item) {
    throw new Error("Bundle item is missing its pricebook item.");
  }

  return {
    clientId: nextClientId("bundle-item"),
    kind: "pricebook_item",
    pricebookItemId: item.id,
    sourceLabel: bundleName,
    sku: item.internal_sku,
    name: item.name,
    description: item.customer_description ?? "",
    quantity: normalizeQuantityInput(bundleItem.default_quantity, "Bundle quantity"),
    unitPriceInput: formatCentsInput(item.customer_price_cents),
    unitPriceCents: item.customer_price_cents,
    originalUnitPriceCents: item.customer_price_cents,
    originalDescription: item.customer_description,
    itemType: item.item_type,
    unitOfMeasure: item.unit_of_measure,
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
      .map((line) => ({
        clientId: nextClientId("persisted"),
        kind: line.pricebook_item_id ? "pricebook_item" : "manual",
        pricebookItemId: line.pricebook_item_id,
        sourceLabel: null,
        sku: line.sku_snapshot,
        name: line.name_snapshot,
        description: line.description_snapshot ?? "",
        quantity: normalizeQuantityInput(line.quantity, "Quantity"),
        unitPriceInput: formatCentsInput(line.unit_price_cents_snapshot),
        unitPriceCents: line.unit_price_cents_snapshot,
        originalUnitPriceCents: line.pricebook_item_id ? line.unit_price_cents_snapshot : null,
        originalDescription: line.pricebook_item_id ? line.description_snapshot : null,
        itemType: line.item_type_snapshot,
        unitOfMeasure: line.unit_of_measure_snapshot,
      }));
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

    if (line.kind === "pricebook_item" && line.pricebookItemId) {
      return {
        kind: "pricebook_item",
        pricebookItemId: line.pricebookItemId,
        quantity,
        sortOrder: index,
        unitPriceCentsOverride:
          line.originalUnitPriceCents !== null && line.originalUnitPriceCents !== unitPriceCents
            ? unitPriceCents
            : undefined,
        descriptionOverride:
          line.originalDescription !== null && line.originalDescription !== line.description
            ? line.description || null
            : undefined,
      };
    }

    const name = line.name.trim();

    if (!name) {
      throw new Error(`Line ${index + 1} name is required.`);
    }

    return {
      kind: "manual",
      name,
      quantity,
      unitPriceCents,
      sortOrder: index,
      description: line.description.trim() ? line.description.trim() : null,
    };
  });
}
