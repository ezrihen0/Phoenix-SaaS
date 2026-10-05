export const WARRANTY_DOCUMENT_VERSION = 2;

export const DEFAULT_WARRANTY_COVERAGE_TEXT =
  "Workmanship and installed components are covered under normal residential use for the stated term.";

export const DEFAULT_WARRANTY_EXCLUSIONS_TEXT =
  "Excludes misuse, neglect, lack of maintenance, unauthorized modifications, force majeure, and damage caused by third parties or external events.";

export const FALLBACK_COMPANY_NAME = "Service Company";

export const EMPTY_WARRANTY_TERM_LABEL = "No recorded warranty term";

export const MISSING_PROPERTY_LABEL = "No service address on file";

export type WarrantyCoverageStatus = "in_force" | "expired" | "no_term";

export type WarrantyTermsMode = "uniform" | "mixed" | "none";

export type WarrantyDocumentLine = {
  name: string;
  description: string | null;
  quantity: string;
  warrantyMonths: number | null;
  termLabel: string | null;
  expiryLabel: string | null;
};

export type WarrantyDocumentViewModel = {
  documentVersion: number;
  frozen: boolean;
  certificateNumber: string;
  invoiceNumber: string | null;
  jobTitle: string | null;
  warrantyType: string;
  coverageStatus: WarrantyCoverageStatus;
  coverageStatusLabel: string;
  termsMode: WarrantyTermsMode;
  coverageTermLabel: string | null;
  termsSummaryLabel: string;
  effectiveDateCaption: string;
  effectiveDateLabel: string;
  expirationCaption: string | null;
  expirationDateLabel: string | null;
  expirationIsLatest: boolean;
  completionDateLabel: string;
  customerName: string;
  customerCompany: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddressLines: string[];
  propertyLabel: string;
  coveredAssetLabel: string | null;
  coverageText: string;
  exclusionsText: string;
  companyName: string;
  companyNameIsFallback: boolean;
  companyLogoUrl: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  companyLicense: string | null;
  companyTaxNumber: string | null;
  accentColor: string | null;
  emptyTermLabel: string;
  lineItems: WarrantyDocumentLine[];
};

export type WarrantyIssueLineInput = {
  name: string;
  description: string | null;
  quantity: string;
  warrantyMonths: number | null;
  sortOrder: number;
};

export type WarrantyIssueInput = {
  invoiceId: string;
  invoiceNumber: string | null;
  jobTitle: string | null;
  warrantyType: string | null;
  coverageText: string | null;
  exclusionsText: string | null;
  startDate: Date;
  completionDate: Date;
  customerName: string;
  customerCompany: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddressLines: string[];
  companyName: string | null;
  companyLogoUrl: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  companyLicense: string | null;
  companyTaxNumber: string | null;
  accentColor: string | null;
  warrantyMessage: string | null;
  lineItems: WarrantyIssueLineInput[];
  now?: Date;
  frozen?: boolean;
};

export type WarrantyStoredSnapshot = {
  documentVersion?: number;
  certificateNumber: string;
  companyName: string;
  companyLogoUrl: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  companyLicense: string | null;
  companyTaxNumber: string | null;
  accentColor: string | null;
  customerId?: string;
  customerName: string;
  customerCompany: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddressLines: string[];
  invoiceId?: string | null;
  invoiceNumber: string | null;
  jobId?: string | null;
  jobTitle?: string | null;
  completionDateLabel: string;
  warrantyStartDateLabel: string;
  warrantyEndDateLabel: string | null;
  warrantyStartIso?: string;
  warrantyEndIso?: string | null;
  hasRecordedWarrantyTerm?: boolean;
  termsMode?: WarrantyTermsMode;
  coverageTermLabel?: string | null;
  termsSummaryLabel?: string;
  effectiveDateCaption?: string;
  expirationCaption?: string | null;
  expirationDateLabel?: string | null;
  expirationIsLatest?: boolean;
  propertyLabel?: string;
  coveredAssetLabel?: string | null;
  companyNameIsFallback?: boolean;
  emptyTermLabel?: string;
  warrantyType: string;
  coverageText: string;
  exclusionsText: string;
  lineItems: Array<{
    name: string;
    description?: string | null;
    quantity: string;
    warrantyMonths: number | null;
    termLabel?: string | null;
    expiryLabel?: string | null;
  }>;
};

export type PlannedWarrantyIssue = {
  viewModel: WarrantyDocumentViewModel;
  snapshot: WarrantyStoredSnapshot;
  startDate: Date;
  columnEndDate: Date;
};

export function buildCertificateNumber(sourceId: string) {
  return `WAR-${sourceId.slice(0, 8).toUpperCase()}`;
}

export function warrantyPdfFilename(certificateNumber: string) {
  const safe = certificateNumber.replace(/[^A-Za-z0-9._-]+/g, "");
  return `warranty-${safe || "certificate"}.pdf`;
}

export function warrantyPdfRendererForSnapshot(snapshot: { documentVersion?: number } | null | undefined) {
  return snapshot?.documentVersion === WARRANTY_DOCUMENT_VERSION ? "document-v2" : "legacy";
}

export function normalizeWarrantyMonths(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
}

export function formatWarrantyTermLabel(months: number | null) {
  if (months === null) {
    return null;
  }
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} year${years === 1 ? "" : "s"}`;
  }
  return `${months} month${months === 1 ? "" : "s"}`;
}

export function formatWarrantyDateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function addWarrantyMonths(start: Date, months: number) {
  return new Date(Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth() + months,
    start.getUTCDate(),
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  ));
}

export function resolveWarrantyCoverageStart(input: {
  paidAt: Date | null;
  balanceCents: number;
  now: Date;
}) {
  if (input.paidAt) {
    return input.paidAt;
  }
  if (input.balanceCents <= 0) {
    return input.now;
  }
  return input.now;
}

export function coverageStatusLabel(status: WarrantyCoverageStatus) {
  if (status === "in_force") {
    return "In force";
  }
  if (status === "expired") {
    return "Expired";
  }
  return EMPTY_WARRANTY_TERM_LABEL;
}

export function resolveCoverageStatus(input: {
  hasRecordedWarrantyTerm: boolean;
  warrantyEnd: Date | null;
  now: Date;
}): WarrantyCoverageStatus {
  if (!input.hasRecordedWarrantyTerm || !input.warrantyEnd) {
    return "no_term";
  }
  const endDay = Date.UTC(
    input.warrantyEnd.getUTCFullYear(),
    input.warrantyEnd.getUTCMonth(),
    input.warrantyEnd.getUTCDate(),
  );
  const nowDay = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate());
  return nowDay > endDay ? "expired" : "in_force";
}

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function propertyLabelFromLines(lines: string[]) {
  return lines.length > 0 ? lines.join(", ") : MISSING_PROPERTY_LABEL;
}

function coveredAssetFromLines(jobTitle: string | null, lineItems: Array<{ name: string }>) {
  const names = lineItems.map((line) => line.name.trim()).filter(Boolean);
  if (names.length === 1) {
    return names[0]!;
  }
  if (names.length > 1) {
    return names.join(", ");
  }
  return normalizeText(jobTitle);
}

function classifyTerms(lineItems: WarrantyDocumentLine[]): WarrantyTermsMode {
  const recorded = lineItems
    .map((line) => line.warrantyMonths)
    .filter((months): months is number => months !== null);
  if (!recorded.length) {
    return "none";
  }
  const missing = lineItems.some((line) => line.warrantyMonths === null);
  const unique = new Set(recorded);
  if (missing || unique.size > 1) {
    return "mixed";
  }
  return "uniform";
}

function describeTerms(termsMode: WarrantyTermsMode, coverageTermLabel: string | null) {
  if (termsMode === "uniform" && coverageTermLabel) {
    return {
      termsSummaryLabel: `${coverageTermLabel} workmanship protection window`,
      expirationCaption: "Expiration date",
      effectiveDateCaption: "Effective date",
      expirationIsLatest: false,
    };
  }
  if (termsMode === "mixed") {
    return {
      termsSummaryLabel: "Warranty terms vary by covered line item",
      expirationCaption: "Latest coverage end",
      effectiveDateCaption: "Effective date",
      expirationIsLatest: true,
    };
  }
  return {
    termsSummaryLabel: EMPTY_WARRANTY_TERM_LABEL,
    expirationCaption: null,
    effectiveDateCaption: "Effective date",
    expirationIsLatest: false,
  };
}

export function planWarrantyIssue(input: WarrantyIssueInput): PlannedWarrantyIssue {
  const now = input.now ?? new Date();
  const startDate = input.startDate;
  const sorted = [...input.lineItems].sort((left, right) => left.sortOrder - right.sortOrder);
  const lineItems: WarrantyDocumentLine[] = sorted.map((line) => {
    const warrantyMonths = normalizeWarrantyMonths(line.warrantyMonths);
    const expiry = warrantyMonths === null ? null : addWarrantyMonths(startDate, warrantyMonths);
    return {
      name: line.name.trim() || "Covered item",
      description: normalizeText(line.description),
      quantity: String(line.quantity),
      warrantyMonths,
      termLabel: formatWarrantyTermLabel(warrantyMonths),
      expiryLabel: expiry ? formatWarrantyDateLabel(expiry) : null,
    };
  });

  const recordedMonths = lineItems
    .map((line) => line.warrantyMonths)
    .filter((months): months is number => months !== null);
  const hasRecordedWarrantyTerm = recordedMonths.length > 0;
  const maxMonths = hasRecordedWarrantyTerm ? Math.max(...recordedMonths) : 0;
  const warrantyEnd = hasRecordedWarrantyTerm ? addWarrantyMonths(startDate, maxMonths) : null;
  const columnEndDate = warrantyEnd ? new Date(warrantyEnd.getTime()) : new Date(startDate.getTime());
  const termsMode = classifyTerms(lineItems);
  const coverageTermLabel = termsMode === "uniform" ? formatWarrantyTermLabel(recordedMonths[0] ?? null) : null;
  const described = describeTerms(termsMode, coverageTermLabel);
  const coverageStatus = resolveCoverageStatus({ hasRecordedWarrantyTerm, warrantyEnd, now });
  const companyNameIsFallback = !normalizeText(input.companyName);
  const companyName = normalizeText(input.companyName) ?? FALLBACK_COMPANY_NAME;
  const coverageText = normalizeText(input.coverageText)
    ?? normalizeText(input.warrantyMessage)
    ?? DEFAULT_WARRANTY_COVERAGE_TEXT;
  const exclusionsText = normalizeText(input.exclusionsText) ?? DEFAULT_WARRANTY_EXCLUSIONS_TEXT;
  const customerAddressLines = input.customerAddressLines.map((line) => line.trim()).filter(Boolean);
  const effectiveDateLabel = formatWarrantyDateLabel(startDate);
  const expirationDateLabel = warrantyEnd ? formatWarrantyDateLabel(warrantyEnd) : null;
  const completionDateLabel = formatWarrantyDateLabel(input.completionDate);

  const viewModel: WarrantyDocumentViewModel = {
    documentVersion: WARRANTY_DOCUMENT_VERSION,
    frozen: input.frozen === true,
    certificateNumber: buildCertificateNumber(input.invoiceId),
    invoiceNumber: normalizeText(input.invoiceNumber),
    jobTitle: normalizeText(input.jobTitle),
    warrantyType: normalizeText(input.warrantyType) ?? "installation",
    coverageStatus,
    coverageStatusLabel: coverageStatusLabel(coverageStatus),
    termsMode,
    coverageTermLabel,
    termsSummaryLabel: described.termsSummaryLabel,
    effectiveDateCaption: described.effectiveDateCaption,
    effectiveDateLabel,
    expirationCaption: hasRecordedWarrantyTerm ? described.expirationCaption : null,
    expirationDateLabel: hasRecordedWarrantyTerm ? expirationDateLabel : null,
    expirationIsLatest: hasRecordedWarrantyTerm && described.expirationIsLatest,
    completionDateLabel,
    customerName: input.customerName.trim() || "Customer",
    customerCompany: normalizeText(input.customerCompany),
    customerEmail: normalizeText(input.customerEmail),
    customerPhone: normalizeText(input.customerPhone),
    customerAddressLines,
    propertyLabel: propertyLabelFromLines(customerAddressLines),
    coveredAssetLabel: coveredAssetFromLines(input.jobTitle, lineItems),
    coverageText,
    exclusionsText,
    companyName,
    companyNameIsFallback,
    companyLogoUrl: normalizeText(input.companyLogoUrl),
    companyPhone: normalizeText(input.companyPhone),
    companyEmail: normalizeText(input.companyEmail),
    companyWebsite: normalizeText(input.companyWebsite),
    companyAddress: normalizeText(input.companyAddress),
    companyLicense: normalizeText(input.companyLicense),
    companyTaxNumber: normalizeText(input.companyTaxNumber),
    accentColor: normalizeText(input.accentColor),
    emptyTermLabel: EMPTY_WARRANTY_TERM_LABEL,
    lineItems,
  };

  const snapshot: WarrantyStoredSnapshot = {
    documentVersion: WARRANTY_DOCUMENT_VERSION,
    certificateNumber: viewModel.certificateNumber,
    companyName: viewModel.companyName,
    companyLogoUrl: viewModel.companyLogoUrl,
    companyPhone: viewModel.companyPhone,
    companyEmail: viewModel.companyEmail,
    companyWebsite: viewModel.companyWebsite,
    companyAddress: viewModel.companyAddress,
    companyLicense: viewModel.companyLicense,
    companyTaxNumber: viewModel.companyTaxNumber,
    accentColor: viewModel.accentColor,
    companyNameIsFallback: viewModel.companyNameIsFallback,
    customerName: viewModel.customerName,
    customerCompany: viewModel.customerCompany,
    customerEmail: viewModel.customerEmail,
    customerPhone: viewModel.customerPhone,
    customerAddressLines: viewModel.customerAddressLines,
    propertyLabel: viewModel.propertyLabel,
    invoiceNumber: viewModel.invoiceNumber,
    jobTitle: viewModel.jobTitle,
    coveredAssetLabel: viewModel.coveredAssetLabel,
    completionDateLabel: viewModel.completionDateLabel,
    warrantyStartDateLabel: viewModel.effectiveDateLabel,
    warrantyEndDateLabel: viewModel.expirationDateLabel,
    warrantyStartIso: startDate.toISOString(),
    warrantyEndIso: warrantyEnd ? warrantyEnd.toISOString() : null,
    hasRecordedWarrantyTerm,
    termsMode: viewModel.termsMode,
    coverageTermLabel: viewModel.coverageTermLabel,
    termsSummaryLabel: viewModel.termsSummaryLabel,
    effectiveDateCaption: viewModel.effectiveDateCaption,
    expirationCaption: viewModel.expirationCaption,
    expirationDateLabel: viewModel.expirationDateLabel,
    expirationIsLatest: viewModel.expirationIsLatest,
    emptyTermLabel: viewModel.emptyTermLabel,
    warrantyType: viewModel.warrantyType,
    coverageText: viewModel.coverageText,
    exclusionsText: viewModel.exclusionsText,
    lineItems: viewModel.lineItems.map((line) => ({
      name: line.name,
      description: line.description,
      quantity: line.quantity,
      warrantyMonths: line.warrantyMonths,
      termLabel: line.termLabel,
      expiryLabel: line.expiryLabel,
    })),
  };

  return { viewModel, snapshot, startDate, columnEndDate };
}

export function buildViewModelFromSnapshot(
  snapshot: WarrantyStoredSnapshot,
  options?: { now?: Date; warrantyEnd?: Date | null },
): WarrantyDocumentViewModel | null {
  if (!snapshot || typeof snapshot.certificateNumber !== "string" || typeof snapshot.customerName !== "string") {
    return null;
  }
  if (snapshot.documentVersion === WARRANTY_DOCUMENT_VERSION) {
    return viewModelFromVersion2(snapshot, options?.now ?? new Date());
  }
  return viewModelFromLegacy(snapshot, options?.now ?? new Date(), options?.warrantyEnd ?? null);
}

function viewModelFromVersion2(snapshot: WarrantyStoredSnapshot, now: Date): WarrantyDocumentViewModel {
  const hasRecordedWarrantyTerm = snapshot.hasRecordedWarrantyTerm === true;
  const warrantyEnd = hasRecordedWarrantyTerm && snapshot.warrantyEndIso ? new Date(snapshot.warrantyEndIso) : null;
  const coverageStatus = resolveCoverageStatus({
    hasRecordedWarrantyTerm,
    warrantyEnd: warrantyEnd && !Number.isNaN(warrantyEnd.getTime()) ? warrantyEnd : null,
    now,
  });
  const lineItems = (snapshot.lineItems ?? []).map((line) => ({
    name: line.name,
    description: normalizeText(line.description),
    quantity: String(line.quantity),
    warrantyMonths: normalizeWarrantyMonths(line.warrantyMonths),
    termLabel: line.termLabel === undefined ? formatWarrantyTermLabel(normalizeWarrantyMonths(line.warrantyMonths)) : line.termLabel,
    expiryLabel: line.expiryLabel === undefined ? null : line.expiryLabel,
  }));

  return {
    documentVersion: WARRANTY_DOCUMENT_VERSION,
    frozen: true,
    certificateNumber: snapshot.certificateNumber,
    invoiceNumber: normalizeText(snapshot.invoiceNumber),
    jobTitle: normalizeText(snapshot.jobTitle),
    warrantyType: snapshot.warrantyType,
    coverageStatus,
    coverageStatusLabel: coverageStatusLabel(coverageStatus),
    termsMode: snapshot.termsMode ?? classifyTerms(lineItems),
    coverageTermLabel: snapshot.coverageTermLabel ?? null,
    termsSummaryLabel: snapshot.termsSummaryLabel ?? EMPTY_WARRANTY_TERM_LABEL,
    effectiveDateCaption: snapshot.effectiveDateCaption ?? "Effective date",
    effectiveDateLabel: snapshot.warrantyStartDateLabel,
    expirationCaption: hasRecordedWarrantyTerm ? snapshot.expirationCaption ?? "Expiration date" : null,
    expirationDateLabel: hasRecordedWarrantyTerm ? snapshot.expirationDateLabel ?? snapshot.warrantyEndDateLabel : null,
    expirationIsLatest: hasRecordedWarrantyTerm && snapshot.expirationIsLatest === true,
    completionDateLabel: snapshot.completionDateLabel,
    customerName: snapshot.customerName,
    customerCompany: normalizeText(snapshot.customerCompany),
    customerEmail: normalizeText(snapshot.customerEmail),
    customerPhone: normalizeText(snapshot.customerPhone),
    customerAddressLines: snapshot.customerAddressLines ?? [],
    propertyLabel: snapshot.propertyLabel ?? propertyLabelFromLines(snapshot.customerAddressLines ?? []),
    coveredAssetLabel: snapshot.coveredAssetLabel ?? coveredAssetFromLines(snapshot.jobTitle ?? null, lineItems),
    coverageText: snapshot.coverageText,
    exclusionsText: snapshot.exclusionsText,
    companyName: snapshot.companyName,
    companyNameIsFallback: snapshot.companyNameIsFallback === true,
    companyLogoUrl: normalizeText(snapshot.companyLogoUrl),
    companyPhone: normalizeText(snapshot.companyPhone),
    companyEmail: normalizeText(snapshot.companyEmail),
    companyWebsite: normalizeText(snapshot.companyWebsite),
    companyAddress: normalizeText(snapshot.companyAddress),
    companyLicense: normalizeText(snapshot.companyLicense),
    companyTaxNumber: normalizeText(snapshot.companyTaxNumber),
    accentColor: normalizeText(snapshot.accentColor),
    emptyTermLabel: snapshot.emptyTermLabel ?? EMPTY_WARRANTY_TERM_LABEL,
    lineItems,
  };
}

function viewModelFromLegacy(
  snapshot: WarrantyStoredSnapshot,
  now: Date,
  warrantyEnd: Date | null,
): WarrantyDocumentViewModel {
  const lineItems: WarrantyDocumentLine[] = (snapshot.lineItems ?? []).map((line) => {
    const warrantyMonths = normalizeWarrantyMonths(line.warrantyMonths);
    return {
      name: line.name,
      description: normalizeText(line.description),
      quantity: String(line.quantity),
      warrantyMonths,
      termLabel: formatWarrantyTermLabel(warrantyMonths),
      expiryLabel: null,
    };
  });
  const termsMode = classifyTerms(lineItems);
  const recorded = lineItems
    .map((line) => line.warrantyMonths)
    .filter((months): months is number => months !== null);
  const coverageTermLabel = termsMode === "uniform" ? formatWarrantyTermLabel(recorded[0] ?? null) : null;
  const described = describeTerms(termsMode, coverageTermLabel);
  const hasRecordedWarrantyTerm = recorded.length > 0;
  const endLabel = normalizeText(snapshot.warrantyEndDateLabel);
  const coverageStatus = resolveCoverageStatus({
    hasRecordedWarrantyTerm,
    warrantyEnd: hasRecordedWarrantyTerm ? warrantyEnd : null,
    now,
  });

  return {
    documentVersion: 1,
    frozen: true,
    certificateNumber: snapshot.certificateNumber,
    invoiceNumber: normalizeText(snapshot.invoiceNumber),
    jobTitle: normalizeText(snapshot.jobTitle),
    warrantyType: snapshot.warrantyType,
    coverageStatus,
    coverageStatusLabel: coverageStatusLabel(coverageStatus),
    termsMode,
    coverageTermLabel,
    termsSummaryLabel: described.termsSummaryLabel,
    effectiveDateCaption: described.effectiveDateCaption,
    effectiveDateLabel: snapshot.warrantyStartDateLabel,
    expirationCaption: hasRecordedWarrantyTerm ? described.expirationCaption : null,
    expirationDateLabel: hasRecordedWarrantyTerm ? endLabel : null,
    expirationIsLatest: hasRecordedWarrantyTerm && described.expirationIsLatest,
    completionDateLabel: snapshot.completionDateLabel,
    customerName: snapshot.customerName,
    customerCompany: normalizeText(snapshot.customerCompany),
    customerEmail: normalizeText(snapshot.customerEmail),
    customerPhone: normalizeText(snapshot.customerPhone),
    customerAddressLines: snapshot.customerAddressLines ?? [],
    propertyLabel: propertyLabelFromLines(snapshot.customerAddressLines ?? []),
    coveredAssetLabel: coveredAssetFromLines(snapshot.jobTitle ?? null, lineItems),
    coverageText: snapshot.coverageText,
    exclusionsText: snapshot.exclusionsText,
    companyName: snapshot.companyName || FALLBACK_COMPANY_NAME,
    companyNameIsFallback: !normalizeText(snapshot.companyName),
    companyLogoUrl: normalizeText(snapshot.companyLogoUrl),
    companyPhone: normalizeText(snapshot.companyPhone),
    companyEmail: normalizeText(snapshot.companyEmail),
    companyWebsite: normalizeText(snapshot.companyWebsite),
    companyAddress: normalizeText(snapshot.companyAddress),
    companyLicense: normalizeText(snapshot.companyLicense),
    companyTaxNumber: normalizeText(snapshot.companyTaxNumber),
    accentColor: normalizeText(snapshot.accentColor),
    emptyTermLabel: EMPTY_WARRANTY_TERM_LABEL,
    lineItems,
  };
}
