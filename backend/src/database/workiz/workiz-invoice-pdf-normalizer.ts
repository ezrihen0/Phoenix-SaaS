import type { WorkizParsedInvoice, WorkizParsedLineItem } from "./workiz-invoice-parser";

export type WorkizPdfNormalizedPart = {
  label: string;
  part_number: string | null;
};

export type WorkizPdfNormalizedLineItem = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  content_lines: string[];
  parts: WorkizPdfNormalizedPart[];
};

export type WorkizPdfServiceSummaryBlock = {
  kind: "diagnostic" | "work_performed" | "findings" | "recommendations" | "assurance" | "other";
  title: string;
  body_lines: string[];
};

export type WorkizPdfNormalizedWarranty = {
  text_blocks: string[];
  duration_mentions: string[];
  assurance_blocks: string[];
};

export type WorkizPdfNormalizedInvoice = {
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  customer: {
    name: string;
    company: string | null;
    phone: string;
    email: string | null;
    street: string;
    city: string;
    province: string | null;
    postal_code: string;
  } | null;
  line_items: WorkizPdfNormalizedLineItem[];
  service_summary: WorkizPdfServiceSummaryBlock[];
  warranty: WorkizPdfNormalizedWarranty | null;
  financials: {
    subtotal_cents: number | null;
    discount_cents: number | null;
    tax_amount_cents: number | null;
    tax_rate_bps: number | null;
    total_cents: number | null;
    balance_due_cents: number | null;
  };
  payments: Array<{
    occurred_at: string | null;
    method: string;
    amount_cents: number;
    status: string;
    raw_date_lines: string[];
  }>;
  notes: string | null;
  terms: string | null;
  extraction_meta: {
    source_filename: string;
    source_path: string;
    file_hash: string;
    workiz_file_number: string | null;
    warnings: string[];
    errors: string[];
  };
};

const SERVICE_SUMMARY_MARKERS = [
  { pattern: /diagnostic\s*&?\s*service\s*summary/i, kind: "diagnostic" as const, title: "Diagnostic & Service Summary" },
  { pattern: /customer\s*assurance/i, kind: "assurance" as const, title: "Customer Assurance" },
  { pattern: /work\s*performed/i, kind: "work_performed" as const, title: "Work Performed" },
  { pattern: /findings/i, kind: "findings" as const, title: "Findings" },
  { pattern: /recommendations?/i, kind: "recommendations" as const, title: "Recommendations" },
];

const PART_NUMBER_PATTERN = /\b(?:mod|model|part|pilot|control|valve|remote|sensor|igniter|thermocouple|switch|gasket|fan|motor|board|module|kit|assembly|burner|log set|logset|glass|door|insert|liner|cap|flue|chimney|regulator|propane|natural gas|ng|lp)\s*[#:]?\s*([A-Z0-9][A-Z0-9\-./]{2,})/i;
const STANDALONE_PART_PATTERN = /\b([A-Z]{1,4}\s*\d{3,4}[-./]\d{2,6}[A-Z0-9./-]*)\b/i;

function toIsoDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function extractParts(description: string): WorkizPdfNormalizedPart[] {
  const parts: WorkizPdfNormalizedPart[] = [];
  const labeled = description.match(PART_NUMBER_PATTERN);
  if (labeled) {
    parts.push({ label: description.trim(), part_number: labeled[1]?.trim() ?? null });
    return parts;
  }
  const standalone = description.match(STANDALONE_PART_PATTERN);
  if (standalone) {
    parts.push({ label: description.trim(), part_number: standalone[1]?.trim() ?? null });
  }
  return parts;
}

function classifyServiceBlock(description: string): WorkizPdfServiceSummaryBlock | null {
  for (const marker of SERVICE_SUMMARY_MARKERS) {
    if (marker.pattern.test(description)) {
      const titleIndex = description.search(marker.pattern);
      const titleMatch = description.slice(titleIndex).match(marker.pattern);
      const titleEnd = titleIndex + (titleMatch?.[0]?.length ?? marker.title.length);
      const body = description.slice(titleEnd).trim();
      const bodyLines = body
        ? body.split(/(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean)
        : [];
      return {
        kind: marker.kind,
        title: marker.title,
        body_lines: bodyLines.length > 0 ? bodyLines : [body].filter(Boolean),
      };
    }
  }
  return null;
}

function isServiceSummaryLineItem(item: WorkizParsedLineItem): boolean {
  if (item.amountCents !== 0) return false;
  const haystack = item.description.toLowerCase();
  return SERVICE_SUMMARY_MARKERS.some((marker) => marker.pattern.test(haystack))
    || haystack.includes("assurance")
    || haystack.includes("during the inspection")
    || haystack.includes("at the customer");
}

function extractWarrantyFromDescription(description: string): string[] {
  const mentions: string[] = [];
  const warrantyMatch = description.match(/\b(\d+\s*(?:day|days|week|weeks|month|months|year|years)\s*warranty)\b/gi);
  if (warrantyMatch) mentions.push(...warrantyMatch);
  return mentions;
}

function splitLineItemContent(description: string): string[] {
  return description
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeLineItem(item: WorkizParsedLineItem): WorkizPdfNormalizedLineItem {
  return {
    description: item.description,
    quantity: item.quantity,
    unit_price_cents: item.unitPriceCents,
    amount_cents: item.amountCents,
    content_lines: splitLineItemContent(item.description),
    parts: extractParts(item.description),
  };
}

export function normalizeWorkizPdfInvoice(
  parsed: WorkizParsedInvoice,
  fileHash: string,
): WorkizPdfNormalizedInvoice {
  const lineItems: WorkizPdfNormalizedLineItem[] = [];
  const serviceSummary: WorkizPdfServiceSummaryBlock[] = [];
  const warrantyDurationMentions: string[] = [];
  const warrantyTextBlocks: string[] = [];
  const assuranceBlocks: string[] = [];

  for (const item of parsed.lineItems) {
    if (isServiceSummaryLineItem(item)) {
      const block = classifyServiceBlock(item.description);
      if (block) {
        serviceSummary.push(block);
        if (block.kind === "assurance") assuranceBlocks.push(block.body_lines.join(" "));
      } else {
        serviceSummary.push({
          kind: "other",
          title: item.description.slice(0, 80),
          body_lines: splitLineItemContent(item.description),
        });
      }
      continue;
    }

    const warrantyMentions = extractWarrantyFromDescription(item.description);
    if (warrantyMentions.length > 0) {
      warrantyDurationMentions.push(...warrantyMentions);
    }

    lineItems.push(normalizeLineItem(item));
  }

  if (parsed.warrantySection) {
    warrantyTextBlocks.push(parsed.warrantySection);
  }

  const warranty: WorkizPdfNormalizedWarranty | null =
    warrantyTextBlocks.length > 0 || warrantyDurationMentions.length > 0 || assuranceBlocks.length > 0
      ? {
          text_blocks: warrantyTextBlocks,
          duration_mentions: [...new Set(warrantyDurationMentions)],
          assurance_blocks: assuranceBlocks,
        }
      : null;

  return {
    invoice_number: parsed.invoiceCode,
    invoice_date: toIsoDate(parsed.invoiceDate),
    due_date: toIsoDate(parsed.dueDate),
    customer: parsed.customer
      ? {
          name: parsed.customer.name,
          company: parsed.customer.company,
          phone: parsed.customer.phone,
          email: parsed.customer.email,
          street: [parsed.customer.addressLine1, parsed.customer.addressLine2].filter(Boolean).join(", "),
          city: parsed.customer.city,
          province: parsed.customer.province,
          postal_code: parsed.customer.postalCode,
        }
      : null,
    line_items: lineItems,
    service_summary: serviceSummary,
    warranty,
    financials: {
      subtotal_cents: parsed.subtotalCents,
      discount_cents: parsed.discountCents,
      tax_amount_cents: parsed.taxCents,
      tax_rate_bps: parsed.taxRateBps,
      total_cents: parsed.totalCents,
      balance_due_cents: parsed.balanceDueCents,
    },
    payments: parsed.payments.map((payment) => ({
      occurred_at: toIsoDate(payment.occurredAt),
      method: payment.methodLabel,
      amount_cents: payment.amountCents,
      status: payment.statusLabel,
      raw_date_lines: payment.rawDateLines,
    })),
    notes: parsed.notes,
    terms: parsed.terms,
    extraction_meta: {
      source_filename: parsed.sourceFile,
      source_path: parsed.sourcePath,
      file_hash: fileHash,
      workiz_file_number: parsed.workizFileNumber,
      warnings: parsed.parseWarnings,
      errors: parsed.parseErrors,
    },
  };
}
