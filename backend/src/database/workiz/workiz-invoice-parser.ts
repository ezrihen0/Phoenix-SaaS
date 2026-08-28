export type WorkizParsedPayment = {
  occurredAt: Date | null;
  methodLabel: string;
  amountCents: number;
  statusLabel: string;
  rawDateLines: string[];
};

export type WorkizParsedLineItem = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type WorkizParsedCustomer = {
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string | null;
  postalCode: string;
  phone: string;
  email: string | null;
};

export type WorkizParsedInvoice = {
  sourceFile: string;
  sourcePath: string;
  workizFileNumber: string | null;
  invoiceCode: string | null;
  invoiceDate: Date | null;
  dueDate: Date | null;
  balanceDueCents: number | null;
  headerBalanceCents: number | null;
  customer: WorkizParsedCustomer | null;
  lineItems: WorkizParsedLineItem[];
  subtotalCents: number | null;
  discountCents: number | null;
  taxCents: number | null;
  taxRateBps: number | null;
  totalCents: number | null;
  payments: WorkizParsedPayment[];
  notes: string | null;
  parseWarnings: string[];
  parseErrors: string[];
};

const MONEY = /\$([\d,]+(?:\.\d{2})?)/;

export function parseMoneyToCents(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw.trim();
}

export function normalizeEmail(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function parseWorkizDate(raw: string): Date | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const parsed = Date.parse(cleaned);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

function extractSection(text: string, startMarker: string, endMarkers: string[]): string | null {
  const startIndex = text.indexOf(startMarker);
  if (startIndex < 0) return null;
  const from = startIndex + startMarker.length;
  let end = text.length;
  for (const marker of endMarkers) {
    const idx = text.indexOf(marker, from);
    if (idx >= 0) end = Math.min(end, idx);
  }
  return text.slice(from, end).trim();
}

function looksLikePhoneLine(line: string): boolean {
  if (/\b(Road|Street|Avenue|Ave|Place|Drive|Dr|St|Range|Boulevard|Blvd|Court|Ct|Lane|Ln|Way|Trail|Crescent|Cres)\b/i.test(line)) {
    return false;
  }
  if (/,/.test(line) && /[A-Z]\d[A-Z]/i.test(line)) return false;
  const digits = line.replace(/\D/g, "");
  if (digits.length < 10) return false;
  const withoutDigits = line.replace(/[\d\s().+-]/g, "");
  return withoutDigits.length <= 2;
}

function parseLineItems(section: string): WorkizParsedLineItem[] {
  const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
  const items: WorkizParsedLineItem[] = [];
  let descBuffer: string[] = [];

  const flushItem = (descriptionParts: string[], quantity: string, unitPrice: string, amount: string) => {
    const description = descriptionParts
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    descBuffer = [];
    items.push({
      description: description || "Imported service line",
      quantity: Number(quantity),
      unitPriceCents: parseMoneyToCents(unitPrice) ?? 0,
      amountCents: parseMoneyToCents(amount) ?? 0,
    });
  };

  for (const line of lines) {
    const inlineMatch = line.match(/^(.+?)(\d+(?:\.\d+)?)\$(\d+\.\d{2})\$(\d+\.\d{2})$/);
    if (inlineMatch && inlineMatch[1].trim().length > 0) {
      flushItem([...descBuffer, inlineMatch[1].trim()], inlineMatch[2], inlineMatch[3], inlineMatch[4]);
      continue;
    }

    const orphanMatch = line.match(/^(\d+(?:\.\d+)?)\$(\d+\.\d{2})\$(\d+\.\d{2})$/);
    if (orphanMatch) {
      flushItem(descBuffer, orphanMatch[1], orphanMatch[2], orphanMatch[3]);
      continue;
    }

    descBuffer.push(line);
  }

  return items;
}

function parseBillTo(section: string): WorkizParsedCustomer | null {
  const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const name = lines[0] ?? "Unknown Customer";
  let email: string | null = null;
  let phone = "";
  let cityLineIndex = -1;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (normalizeEmail(line)) {
      email = normalizeEmail(line);
      continue;
    }
    const digits = line.replace(/\D/g, "");
    if (looksLikePhoneLine(line)) {
      phone = normalizePhone(line);
      continue;
    }
    if (/,/.test(line) && /[A-Z]\d[A-Z]/i.test(line)) {
      cityLineIndex = index;
      break;
    }
  }

  if (cityLineIndex < 0) {
    return {
      name,
      addressLine1: lines[1] ?? "Address unknown",
      addressLine2: null,
      city: "",
      province: null,
      postalCode: "",
      phone: phone || "",
      email,
    };
  }

  const cityLine = lines[cityLineIndex];
  const cityMatch = cityLine.match(/^(.+?),\s*(.+?)\s+([A-Z0-9 ]+)$/i);
  const addressLine1 = lines[1] ?? "Address unknown";
  const addressLine2 = cityLineIndex > 2 ? lines.slice(2, cityLineIndex).join(", ") || null : null;

  return {
    name,
    addressLine1,
    addressLine2,
    city: cityMatch?.[1]?.trim() ?? "",
    province: cityMatch?.[2]?.trim() ?? null,
    postalCode: cityMatch?.[3]?.trim() ?? "",
    phone: phone || "",
    email,
  };
}

function parsePayments(section: string): WorkizParsedPayment[] {
  const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
  const payments: WorkizParsedPayment[] = [];
  let dateBuffer: string[] = [];

  for (const line of lines) {
    const paymentMatch = line.match(/^(.+?)\$([\d,]+(?:\.\d{2})?)(Paid|Partial|Unpaid)?$/i);
    if (paymentMatch && /credit|cash|check|card|offline|e-transfer|etransfer|debit|visa|master/i.test(paymentMatch[1])) {
      payments.push({
        occurredAt: dateBuffer.length > 0 ? parseWorkizDate(dateBuffer.join(" ")) : null,
        methodLabel: paymentMatch[1].trim(),
        amountCents: parseMoneyToCents(paymentMatch[2]) ?? 0,
        statusLabel: paymentMatch[3]?.trim() ?? "Paid",
        rawDateLines: [...dateBuffer],
      });
      dateBuffer = [];
      continue;
    }

    if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(line) || /^\d{1,2}:\d{2}(AM|PM)$/i.test(line) || /^\d{4}$/.test(line)) {
      dateBuffer.push(line);
    }
  }

  return payments;
}

export function parseWorkizInvoiceText(input: {
  text: string;
  sourceFile: string;
  sourcePath: string;
}): WorkizParsedInvoice {
  const warnings: string[] = [];
  const errors: string[] = [];
  const text = input.text.replace(/\r/g, "").trim();
  const fileNumberMatch = input.sourceFile.match(/\.no(\d+)\.pdf$/i);

  const invoiceCode = text.match(/Invoice #([A-Z0-9]+)/i)?.[1] ?? null;
  if (!invoiceCode) errors.push("missing_invoice_code");

  const invoiceDateRaw = text.match(/Date((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Za-z]{3}\s+\d{1,2},\s+\d{4})/)?.[1] ?? null;
  const dueDateRaw = text.match(/Due On((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Za-z]{3}\s+\d{1,2},\s+\d{4})/)?.[1] ?? null;
  const headerBalanceCents = parseMoneyToCents(text.match(/Balance(\$[\d,]+(?:\.\d{2})?)/)?.[1]?.slice(1));
  const balanceDueCents = parseMoneyToCents(text.match(/Balance Due(\$[\d,]+(?:\.\d{2})?)/)?.[1]?.slice(1));

  const billToSection = extractSection(text, "Bill To:", ["Payment history", "DescriptionQTYPriceAmount", "Description"]);
  const customer = billToSection ? parseBillTo(billToSection) : null;
  if (!customer) errors.push("missing_customer");

  const subtotalCents = parseMoneyToCents(text.match(/Sub total(\$[\d,]+(?:\.\d{2})?)/)?.[1]?.slice(1));
  const discountCents = parseMoneyToCents(text.match(/Discount(\$[\d,]+(?:\.\d{2})?)/)?.[1]?.slice(1));
  const taxMatch = text.match(/Tax(\$[\d,]+(?:\.\d{2})?)\s*(?:\((\d+(?:\.\d+)?)%\))?/);
  const taxCents = parseMoneyToCents(taxMatch?.[1]?.slice(1));
  const taxRatePercent = taxMatch?.[2] ? Number(taxMatch[2]) : null;
  const taxRateBps = taxRatePercent != null && Number.isFinite(taxRatePercent)
    ? Math.round(taxRatePercent * 100)
    : null;
  const totalCents = parseMoneyToCents(text.match(/Total(\$[\d,]+(?:\.\d{2})?)/)?.[1]?.slice(1));

  const lineItemSection = extractSection(text, "DescriptionQTYPriceAmount", ["Sub total", "Subtotal"]);
  let lineItems = lineItemSection ? parseLineItems(lineItemSection) : [];
  if (lineItems.length === 0 && subtotalCents != null) {
    lineItems = [{
      description: "Imported Workiz invoice service total",
      quantity: 1,
      unitPriceCents: subtotalCents,
      amountCents: subtotalCents,
    }];
    warnings.push("synthetic_line_item_from_subtotal");
  } else if (lineItems.length === 0) {
    warnings.push("no_line_items");
  }

  const paymentSection = extractSection(text, "Payment history", [
    "DescriptionQTYPriceAmount",
    "Description",
    "Warranty",
    "Terms:",
    "Notes:",
    "INVOICE",
  ]);
  const payments = paymentSection ? parsePayments(paymentSection) : [];

  const notes = extractSection(text, "Notes:", ["Terms:", "INVOICE"]) ?? null;

  if (subtotalCents != null && lineItems.length > 0) {
    const lineSum = lineItems.reduce((sum, item) => sum + item.amountCents, 0);
    const expectedSubtotal = subtotalCents;
    if (Math.abs(lineSum - expectedSubtotal) > 1 && discountCents == null) {
      warnings.push(`line_items_subtotal_mismatch:${lineSum}_vs_${expectedSubtotal}`);
    }
  }

  if (totalCents != null && subtotalCents != null) {
    const expected = subtotalCents - (discountCents ?? 0) + (taxCents ?? 0);
    if (Math.abs(expected - totalCents) > 2) {
      warnings.push(`total_reconciliation_mismatch:expected_${expected}_actual_${totalCents}`);
    }
  }

  if (payments.length > 0 && totalCents != null) {
    const paid = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    const due = balanceDueCents ?? 0;
    if (Math.abs(paid - (totalCents - due)) > 2) {
      warnings.push(`payment_reconciliation_mismatch:paid_${paid}_total_${totalCents}_due_${due}`);
    }
  }

  return {
    sourceFile: input.sourceFile,
    sourcePath: input.sourcePath,
    workizFileNumber: fileNumberMatch?.[1] ?? null,
    invoiceCode,
    invoiceDate: invoiceDateRaw ? parseWorkizDate(invoiceDateRaw) : null,
    dueDate: dueDateRaw ? parseWorkizDate(dueDateRaw) : null,
    balanceDueCents,
    headerBalanceCents,
    customer,
    lineItems,
    subtotalCents,
    discountCents,
    taxCents,
    taxRateBps,
    totalCents,
    payments,
    notes,
    parseWarnings: warnings,
    parseErrors: errors,
  };
}

export function inferServiceType(description: string): "inspection" | "cleaning" | "repair" | "rebuild" {
  const haystack = description.toLowerCase();
  if (haystack.includes("inspect")) return "inspection";
  if (haystack.includes("clean") || haystack.includes("sweep")) return "cleaning";
  if (haystack.includes("rebuild") || haystack.includes("reface")) return "rebuild";
  return "repair";
}

export function mapPaymentMethod(label: string): "cash" | "check" | "card_manual" | "bank_transfer" | "other" {
  const normalized = label.toLowerCase();
  if (normalized.includes("cash")) return "cash";
  if (normalized.includes("check") || normalized.includes("cheque")) return "check";
  if (normalized.includes("e-transfer") || normalized.includes("etransfer") || normalized.includes("bank")) {
    return "bank_transfer";
  }
  if (normalized.includes("credit") || normalized.includes("card") || normalized.includes("offline")) {
    return "card_manual";
  }
  return "other";
}
