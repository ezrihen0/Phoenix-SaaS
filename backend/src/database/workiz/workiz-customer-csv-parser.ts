import { createHash } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { normalizeEmail, normalizePhone } from "./workiz-invoice-parser";

export const WORKIZ_CUSTOMER_CSV_HEADER = [
  "Client #",
  "Name",
  "Email",
  "Company",
  "Address",
  "Phone",
  "Created",
] as const;

export type WorkizCustomerCsvRow = {
  rowNumber: number;
  sourceFile: string;
  clientNumber: string;
  name: string;
  email: string | null;
  companyName: string | null;
  addressRaw: string;
  phone: string | null;
  phoneDigits: string | null;
  legacyCreatedAt: Date | null;
  addressLine1: string;
  serviceCity: string;
  serviceStateOrRegion: string | null;
  servicePostalCode: string;
};

export type ParsedWorkizCustomerSource = {
  sourceDirectory: string;
  filesDiscovered: number;
  uniqueFiles: number;
  skippedDuplicateFiles: string[];
  sourceFile: string;
  rows: WorkizCustomerCsvRow[];
  schemaErrors: string[];
};

const PROVINCE_PATTERN = /\b(Alberta|British Columbia|BC|Ontario|ON|Quebec|QC|Manitoba|MB|Saskatchewan|SK|Nova Scotia|NS|New Brunswick|NB|Prince Edward Island|PE|PEI|Newfoundland|NL|Yukon|YT|Northwest Territories|NT|Nunavut|NU)\b/i;
const CANADIAN_POSTAL_PATTERN = /([A-Z]\d[A-Z]\s?\d[A-Z]\d)\s*$/i;
const US_ZIP_PATTERN = /\b(\d{5}(?:-\d{4})?)\s*$/;

export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizePhoneDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  if (digits.length !== 10 || digits === "0000000000") {
    return null;
  }
  return digits;
}

export function parseWorkizCreatedDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const parsed = Date.parse(cleaned);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

const STREET_DIRECTIONS = new Set(["SE", "SW", "NE", "NW", "N", "S", "E", "W"]);

function extractCityFromStreetLine(beforeProvince: string): { addressLine1: string; serviceCity: string } {
  const trimmed = beforeProvince.trim();
  if (!trimmed) {
    return { addressLine1: "", serviceCity: "" };
  }

  const commaSplit = trimmed.lastIndexOf(",");
  if (commaSplit >= 0) {
    return {
      addressLine1: trimmed.slice(0, commaSplit).trim(),
      serviceCity: trimmed.slice(commaSplit + 1).trim(),
    };
  }

  const words = trimmed.split(/\s+/);
  if (words.length <= 1) {
    return { addressLine1: trimmed, serviceCity: "" };
  }

  const lastWord = words[words.length - 1];
  if (
    lastWord.length >= 3
    && /^[A-Za-z][A-Za-z.'-]*$/.test(lastWord)
    && !STREET_DIRECTIONS.has(lastWord.toUpperCase())
  ) {
    return {
      addressLine1: words.slice(0, -1).join(" "),
      serviceCity: lastWord,
    };
  }

  return { addressLine1: trimmed, serviceCity: "" };
}

export function parseWorkizCsvAddress(raw: string): {
  addressLine1: string;
  serviceCity: string;
  serviceStateOrRegion: string | null;
  servicePostalCode: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      addressLine1: "",
      serviceCity: "",
      serviceStateOrRegion: null,
      servicePostalCode: "",
    };
  }

  let remainder = trimmed;
  let servicePostalCode = "";

  const canadianMatch = remainder.match(CANADIAN_POSTAL_PATTERN);
  if (canadianMatch) {
    servicePostalCode = canadianMatch[1].replace(/\s/g, "").toUpperCase();
    remainder = remainder.slice(0, canadianMatch.index).trim().replace(/,\s*$/, "");
  } else {
    const usMatch = remainder.match(US_ZIP_PATTERN);
    if (usMatch) {
      servicePostalCode = usMatch[1];
      remainder = remainder.slice(0, usMatch.index).trim().replace(/,\s*$/, "");
    }
  }

  const provinceMatch = remainder.match(PROVINCE_PATTERN);
  let serviceStateOrRegion: string | null = null;
  if (provinceMatch && provinceMatch.index != null) {
    serviceStateOrRegion = provinceMatch[1];
    const beforeProvince = remainder.slice(0, provinceMatch.index).trim().replace(/,\s*$/, "");
    const { addressLine1, serviceCity } = extractCityFromStreetLine(beforeProvince);
    return {
      addressLine1: addressLine1 || trimmed,
      serviceCity,
      serviceStateOrRegion,
      servicePostalCode,
    };
  }

  return {
    addressLine1: remainder || trimmed,
    serviceCity: "",
    serviceStateOrRegion: null,
    servicePostalCode,
  };
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

function parseCsvContent(content: string, sourceFile: string): {
  rows: WorkizCustomerCsvRow[];
  schemaErrors: string[];
} {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const schemaErrors: string[] = [];

  if (lines.length === 0) {
    schemaErrors.push(`${sourceFile}: empty file`);
    return { rows: [], schemaErrors };
  }

  const headerFields = parseCsvLine(lines[0]).map((field) => field.trim());
  const expectedHeader = [...WORKIZ_CUSTOMER_CSV_HEADER];
  const headerMatches = expectedHeader.every((column, index) => headerFields[index] === column);

  if (!headerMatches) {
    schemaErrors.push(
      `${sourceFile}: unexpected header ${JSON.stringify(headerFields)}; expected ${JSON.stringify(expectedHeader)}`,
    );
    return { rows: [], schemaErrors };
  }

  const rows: WorkizCustomerCsvRow[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const fields = parseCsvLine(lines[lineIndex]);
    if (fields.length < expectedHeader.length) {
      schemaErrors.push(`${sourceFile}: row ${lineIndex + 1} has ${fields.length} columns`);
      continue;
    }

    const [
      clientNumber,
      name,
      emailRaw,
      companyRaw,
      addressRaw,
      phoneRaw,
      createdRaw,
    ] = fields;

    const addressParts = parseWorkizCsvAddress(addressRaw ?? "");
    const phoneDigits = normalizePhoneDigits(phoneRaw);
    const formattedPhone = phoneDigits ? normalizePhone(phoneDigits) : null;

    rows.push({
      rowNumber: lineIndex + 1,
      sourceFile,
      clientNumber: (clientNumber ?? "").trim(),
      name: (name ?? "").trim(),
      email: normalizeEmail(emailRaw),
      companyName: (companyRaw ?? "").trim() || null,
      addressRaw: (addressRaw ?? "").trim(),
      phone: formattedPhone,
      phoneDigits,
      legacyCreatedAt: parseWorkizCreatedDate(createdRaw),
      addressLine1: addressParts.addressLine1,
      serviceCity: addressParts.serviceCity,
      serviceStateOrRegion: addressParts.serviceStateOrRegion,
      servicePostalCode: addressParts.servicePostalCode,
    });
  }

  return { rows, schemaErrors };
}

export function loadUniqueWorkizCustomerCsv(sourceDirectory: string): ParsedWorkizCustomerSource {
  const csvFiles = readdirSync(sourceDirectory)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .sort();

  const hashToFile = new Map<string, string>();
  const skippedDuplicateFiles: string[] = [];

  for (const file of csvFiles) {
    const fullPath = join(sourceDirectory, file);
    const hash = createHash("sha256").update(readFileSync(fullPath)).digest("hex");
    if (hashToFile.has(hash)) {
      skippedDuplicateFiles.push(file);
      continue;
    }
    hashToFile.set(hash, file);
  }

  const uniqueFiles = Array.from(hashToFile.values());
  if (uniqueFiles.length === 0) {
    return {
      sourceDirectory,
      filesDiscovered: csvFiles.length,
      uniqueFiles: 0,
      skippedDuplicateFiles,
      sourceFile: "",
      rows: [],
      schemaErrors: ["No CSV files found in source directory."],
    };
  }

  const sourceFile = uniqueFiles[0];
  const parsed = parseCsvContent(readFileSync(join(sourceDirectory, sourceFile), "utf8"), sourceFile);

  return {
    sourceDirectory,
    filesDiscovered: csvFiles.length,
    uniqueFiles: uniqueFiles.length,
    skippedDuplicateFiles,
    sourceFile,
    rows: parsed.rows,
    schemaErrors: parsed.schemaErrors,
  };
}

export function mergeWorkizCustomerRows(
  primary: WorkizCustomerCsvRow,
  secondary: WorkizCustomerCsvRow,
): WorkizCustomerCsvRow {
  return {
    ...primary,
    name: primary.name || secondary.name,
    email: primary.email ?? secondary.email,
    companyName: primary.companyName ?? secondary.companyName,
    addressRaw: primary.addressRaw || secondary.addressRaw,
    phone: primary.phone ?? secondary.phone,
    phoneDigits: primary.phoneDigits ?? secondary.phoneDigits,
    legacyCreatedAt: primary.legacyCreatedAt ?? secondary.legacyCreatedAt,
    addressLine1: primary.addressLine1 || secondary.addressLine1,
    serviceCity: primary.serviceCity || secondary.serviceCity,
    serviceStateOrRegion: primary.serviceStateOrRegion ?? secondary.serviceStateOrRegion,
    servicePostalCode: primary.servicePostalCode || secondary.servicePostalCode,
  };
}

export function hasValidPostalCode(postalCode: string): boolean {
  const normalized = postalCode.trim().toUpperCase();
  if (!normalized) return false;
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(normalized.replace(/\s/g, "")) || /^\d{5}(-\d{4})?$/.test(normalized);
}
