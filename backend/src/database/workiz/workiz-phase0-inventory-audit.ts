import type { WorkizParsedInvoice } from "./workiz-invoice-parser";

const { createHash } = require("crypto") as typeof import("crypto");
const { mkdirSync, readFileSync, readdirSync, writeFileSync } = require("fs") as typeof import("fs");
const { basename, join, resolve } = require("path") as typeof import("path");
const parserModulePath = __filename.endsWith(".ts")
  ? "./workiz-invoice-parser.ts"
  : "./workiz-invoice-parser";
const {
  normalizeEmail,
  parseWorkizInvoiceText,
} = require(parserModulePath) as typeof import("./workiz-invoice-parser");

const pdf = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

const PARSER_VERSION = "workiz-phase0-inventory-v1";
const DEFAULT_SOURCE_DIRECTORY =
  "C:\\Users\\edenz\\OneDrive\\שולחן העבודה\\Business\\Workiz\\INVOICES PDF";
const MONEY_TOLERANCE_CENTS = 0;

type ReadStatus = "TEXT_EXTRACTED" | "REQUIRES_OCR" | "UNREADABLE";
type FinancialStatus = "PASS" | "MANUAL_REVIEW";

type ServiceSignals = {
  parts: boolean;
  labor: boolean;
  cleaning: boolean;
  inspection: boolean;
  repair: boolean;
  installation: boolean;
  maintenance: boolean;
  probableCategories: string[];
};

type WarrantyEvidence = {
  hasWrittenWarranty: boolean;
  explicitPartsWarranty: boolean;
  explicitLaborWarranty: boolean;
  genericWarranty: boolean;
  rawMatches: string[];
};

type CustomerEvidence = {
  name: string;
  normalizedName: string;
  email: string | null;
  normalizedPhone: string | null;
  street: string;
  normalizedStreet: string;
  city: string;
  normalizedCity: string;
  province: string | null;
  postalCode: string;
  normalizedPostalCode: string;
};

type FinancialEvidence = {
  subtotalCents: number | null;
  discountCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  paymentTotalCents: number;
  balanceCents: number | null;
  subtotalPlusTaxEqualsTotal: boolean | null;
  paymentsEqualAmountPaid: boolean | null;
  totalMinusPaymentsEqualsBalance: boolean | null;
  status: FinancialStatus;
  reasons: string[];
};

type FileEvidence = {
  filename: string;
  sourcePath: string;
  bytes: number;
  sha256: string | null;
  readStatus: ReadStatus;
  textLength: number | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  customer: CustomerEvidence | null;
  lineDescriptions: string[];
  paymentCount: number;
  payments: Array<{
    occurredAt: string | null;
    amountCents: number;
    method: string;
    sourceWording: string[];
  }>;
  financial: FinancialEvidence | null;
  warranty: WarrantyEvidence;
  serviceSignals: ServiceSignals;
  parseWarnings: string[];
  parseErrors: string[];
  reviewFlags: string[];
  parserVersion: string;
};

type CustomerCluster = {
  clusterId: string;
  classification:
    | "PROBABLE_UNIQUE_CUSTOMER"
    | "CONFIRMED_REPEAT_CUSTOMER"
    | "DUPLICATE_DOCUMENT_ONLY"
    | "MANUAL_REVIEW";
  filenames: string[];
  invoiceNumbers: string[];
  names: string[];
  emails: string[];
  phones: string[];
  addresses: string[];
  matchedBy: string[];
  reviewFlags: string[];
};

type Phase0Audit = {
  schemaVersion: 1;
  generatedAt: string;
  parserVersion: string;
  sourceDirectory: string;
  boundary: {
    databaseAccess: false;
    networkAccess: false;
    sourceMutation: false;
    productionAccess: false;
  };
  totals: {
    pdfFiles: number;
    readablePdfs: number;
    unreadablePdfs: number;
    requiresOcr: number;
    duplicateFiles: number;
    uniqueFileHashes: number;
    uniqueInvoiceNumbers: number;
    duplicateInvoiceNumbers: number;
    invoicesWithMissingNumber: number;
    earliestInvoiceDate: string | null;
    latestInvoiceDate: string | null;
    uniqueEmails: number;
    uniqueNormalizedPhones: number;
    probableUniqueCustomers: number;
    repeatCustomerClusters: number;
    repeatCustomerInvoices: number;
    duplicateCustomerCandidates: number;
    calgaryRecords: number;
    otherLocationRecords: number;
    unknownLocationRecords: number;
    invoicesWithPayments: number;
    invoicesWithBalance: number;
    explicitPartsWarranty: number;
    explicitLaborWarranty: number;
    genericWarranty: number;
    noWrittenWarranty: number;
    invoicesWithParts: number;
    invoicesWithLabor: number;
    invoicesWithCleaning: number;
    invoicesWithInspections: number;
    invoicesWithRepairs: number;
    financialPass: number;
    financialManualReview: number;
    manualReviewFiles: number;
  };
  duplicateHashGroups: Array<{ sha256: string; filenames: string[] }>;
  duplicateInvoiceGroups: Array<{ invoiceNumber: string; filenames: string[] }>;
  customerClusters: CustomerCluster[];
  duplicateCustomerCandidates: Array<{
    reason: string;
    filenames: string[];
    evidence: string[];
  }>;
  serviceCategoryCounts: Record<string, number>;
  manualReviewCandidates: Array<{ filename: string; invoiceNumber: string | null; flags: string[] }>;
  files: FileEvidence[];
};

class DisjointSet {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    if (this.parent[index] !== index) {
      this.parent[index] = this.find(this.parent[index]);
    }
    return this.parent[index];
  }

  union(left: number, right: number): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) {
      this.parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
    }
  }
}

function normalizeWords(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizePhoneDigits(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return null;
}

function normalizePostalCode(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function withinMoneyTolerance(left: number, right: number): boolean {
  return Math.abs(left - right) <= MONEY_TOLERANCE_CENTS;
}

function buildCustomerEvidence(parsed: WorkizParsedInvoice): CustomerEvidence | null {
  if (!parsed.customer) return null;
  const street = [parsed.customer.addressLine1, parsed.customer.addressLine2].filter(Boolean).join(", ");
  return {
    name: parsed.customer.name,
    normalizedName: normalizeWords(parsed.customer.name),
    email: normalizeEmail(parsed.customer.email),
    normalizedPhone: normalizePhoneDigits(parsed.customer.phone),
    street,
    normalizedStreet: normalizeWords(street),
    city: parsed.customer.city,
    normalizedCity: normalizeWords(parsed.customer.city),
    province: parsed.customer.province,
    postalCode: parsed.customer.postalCode,
    normalizedPostalCode: normalizePostalCode(parsed.customer.postalCode),
  };
}

function buildFinancialEvidence(parsed: WorkizParsedInvoice): FinancialEvidence {
  const reasons: string[] = [];
  const paymentTotalCents = parsed.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const { subtotalCents, discountCents, taxCents, totalCents, balanceDueCents } = parsed;

  const subtotalPlusTaxEqualsTotal =
    subtotalCents != null && taxCents != null && totalCents != null
      ? withinMoneyTolerance(subtotalCents + taxCents, totalCents)
      : null;

  const paymentsEqualAmountPaid =
    totalCents != null && balanceDueCents != null
      ? withinMoneyTolerance(paymentTotalCents, totalCents - balanceDueCents)
      : null;

  const totalMinusPaymentsEqualsBalance =
    totalCents != null && balanceDueCents != null
      ? withinMoneyTolerance(totalCents - paymentTotalCents, balanceDueCents)
      : null;

  if (subtotalCents == null) reasons.push("missing_subtotal");
  if (taxCents == null) reasons.push("missing_tax");
  if (totalCents == null) reasons.push("missing_total");
  if (balanceDueCents == null) reasons.push("missing_balance");
  if (discountCents != null && discountCents !== 0) reasons.push("discount_requires_manual_review");
  if (subtotalPlusTaxEqualsTotal === false) reasons.push("subtotal_plus_tax_does_not_equal_total");
  if (paymentsEqualAmountPaid === false) reasons.push("payments_do_not_equal_amount_paid");
  if (totalMinusPaymentsEqualsBalance === false) reasons.push("total_minus_payments_does_not_equal_balance");
  if (totalCents != null && totalCents < 0) reasons.push("negative_total");
  if (balanceDueCents != null && balanceDueCents < 0) reasons.push("negative_balance");
  if (totalCents != null && paymentTotalCents > totalCents) reasons.push("payments_exceed_total");

  return {
    subtotalCents,
    discountCents,
    taxCents,
    totalCents,
    paymentTotalCents,
    balanceCents: balanceDueCents,
    subtotalPlusTaxEqualsTotal,
    paymentsEqualAmountPaid,
    totalMinusPaymentsEqualsBalance,
    status: reasons.length === 0 ? "PASS" : "MANUAL_REVIEW",
    reasons,
  };
}

function extractWarrantyEvidence(text: string): WarrantyEvidence {
  const compact = text.replace(/\s+/g, " ");
  const rawMatches = uniqueSorted(
    compact.match(/.{0,80}\bwarrant(?:y|ies|ied)\b.{0,120}/gi)?.map((value) => value.trim()) ?? [],
  );
  const hasWrittenWarranty = rawMatches.length > 0;
  const explicitPartsWarranty = rawMatches.some((value) =>
    /\b(part|parts|component|pilot|valve|thermopile|thermocouple|assembly)\b/i.test(value)
    && /\b(\d+|one|two|three|six|twelve|lifetime)\s*(day|week|month|year)/i.test(value),
  );
  const explicitLaborWarranty = rawMatches.some((value) =>
    /\b(labou?r|installation|workmanship|service)\b/i.test(value)
    && /\b(\d+|one|two|three|six|twelve|lifetime)\s*(day|week|month|year)/i.test(value),
  );

  return {
    hasWrittenWarranty,
    explicitPartsWarranty,
    explicitLaborWarranty,
    genericWarranty: hasWrittenWarranty && !explicitPartsWarranty && !explicitLaborWarranty,
    rawMatches,
  };
}

function extractServiceSignals(text: string): ServiceSignals {
  const lowered = text.toLowerCase();
  const parts = /\b(part|parts|pilot|valve|thermopile|thermocouple|gasket|motor|fan|remote|sensor|igniter|module|assembly|burner)\b/.test(lowered);
  const labor = /\b(labou?r|installation|install|workmanship)\b/.test(lowered);
  const cleaning = /\b(clean|cleaning|sweep|sweeping|maintenance)\b/.test(lowered);
  const inspection = /\b(inspect|inspection|wett|camera analysis)\b/.test(lowered);
  const repair = /\b(repair|replace|replacement|rebuild|fix|diagnos|troubleshoot)\b/.test(lowered);
  const installation = /\b(install|installation|replacement)\b/.test(lowered);
  const maintenance = /\b(maintenance|tune[ -]?up|service)\b/.test(lowered);
  const probableCategories: string[] = [];
  if (cleaning) probableCategories.push("CLEANING");
  if (inspection) probableCategories.push("INSPECTION");
  if (repair) probableCategories.push("REPAIR");
  if (installation) probableCategories.push("INSTALLATION");
  if (maintenance) probableCategories.push("MAINTENANCE");
  if (parts) probableCategories.push("PARTS");
  if (labor) probableCategories.push("LABOR");
  if (probableCategories.length === 0) probableCategories.push("UNKNOWN");

  return { parts, labor, cleaning, inspection, repair, installation, maintenance, probableCategories };
}

async function inspectPdf(sourceDirectory: string, filename: string): Promise<FileEvidence> {
  const sourcePath = join(sourceDirectory, filename);
  const base: FileEvidence = {
    filename,
    sourcePath,
    bytes: 0,
    sha256: null,
    readStatus: "UNREADABLE",
    textLength: null,
    invoiceNumber: null,
    invoiceDate: null,
    customer: null,
    lineDescriptions: [],
    paymentCount: 0,
    payments: [],
    financial: null,
    warranty: {
      hasWrittenWarranty: false,
      explicitPartsWarranty: false,
      explicitLaborWarranty: false,
      genericWarranty: false,
      rawMatches: [],
    },
    serviceSignals: {
      parts: false,
      labor: false,
      cleaning: false,
      inspection: false,
      repair: false,
      installation: false,
      maintenance: false,
      probableCategories: ["UNKNOWN"],
    },
    parseWarnings: [],
    parseErrors: [],
    reviewFlags: [],
    parserVersion: PARSER_VERSION,
  };

  let buffer: Buffer;
  try {
    buffer = readFileSync(sourcePath);
    base.bytes = buffer.length;
    base.sha256 = createHash("sha256").update(buffer).digest("hex");
  } catch (error) {
    base.parseErrors.push(error instanceof Error ? error.message : String(error));
    base.reviewFlags.push("UNREADABLE_PDF");
    return base;
  }

  let text: string;
  try {
    const extracted = await pdf(buffer);
    text = (extracted.text ?? "").replace(/\r/g, "").trim();
    base.textLength = text.length;
    if (text.length < 100) {
      base.readStatus = "REQUIRES_OCR";
      base.reviewFlags.push("REQUIRES_OCR");
      return base;
    }
    base.readStatus = "TEXT_EXTRACTED";
  } catch (error) {
    base.readStatus = "REQUIRES_OCR";
    base.parseErrors.push(error instanceof Error ? error.message : String(error));
    base.reviewFlags.push("REQUIRES_OCR");
    return base;
  }

  const parsed = parseWorkizInvoiceText({ text, sourceFile: filename, sourcePath });
  base.invoiceNumber = parsed.invoiceCode;
  base.invoiceDate = dateOnly(parsed.invoiceDate);
  base.customer = buildCustomerEvidence(parsed);
  base.lineDescriptions = parsed.lineItems.map((item) => item.description);
  base.paymentCount = parsed.payments.length;
  base.payments = parsed.payments.map((payment) => ({
    occurredAt: dateOnly(payment.occurredAt),
    amountCents: payment.amountCents,
    method: payment.methodLabel,
    sourceWording: payment.rawDateLines,
  }));
  base.financial = buildFinancialEvidence(parsed);
  base.warranty = extractWarrantyEvidence(text);
  base.serviceSignals = extractServiceSignals([
    ...base.lineDescriptions,
    parsed.notes ?? "",
    parsed.warrantySection ?? "",
  ].join(" "));
  base.parseWarnings = [...parsed.parseWarnings];
  base.parseErrors = [...parsed.parseErrors];

  if (!base.invoiceNumber) base.reviewFlags.push("MISSING_INVOICE_NUMBER");
  if (!base.invoiceDate) base.reviewFlags.push("MISSING_OR_INVALID_INVOICE_DATE");
  if (!base.customer) base.reviewFlags.push("MISSING_CUSTOMER");
  if (base.customer && !base.customer.email && !base.customer.normalizedPhone) {
    base.reviewFlags.push("NO_VALID_EMAIL_OR_PHONE");
  }
  if (base.financial.status === "MANUAL_REVIEW") {
    base.reviewFlags.push(...base.financial.reasons.map((reason) => `FINANCIAL:${reason}`));
  }
  base.reviewFlags.push(...base.parseErrors.map((error) => `PARSE:${error}`));
  base.reviewFlags.push(...base.parseWarnings.map((warning) => `PARSE_WARNING:${warning}`));
  base.reviewFlags = uniqueSorted(base.reviewFlags);
  return base;
}

function addIndexes(
  index: Map<string, number[]>,
  key: string | null | undefined,
  recordIndex: number,
): void {
  if (!key) return;
  const group = index.get(key) ?? [];
  group.push(recordIndex);
  index.set(key, group);
}

function unionIndexGroups(disjointSet: DisjointSet, index: Map<string, number[]>): void {
  for (const group of index.values()) {
    for (let position = 1; position < group.length; position += 1) {
      disjointSet.union(group[0], group[position]);
    }
  }
}

function buildCustomerAnalysis(files: FileEvidence[]): {
  clusters: CustomerCluster[];
  duplicateCandidates: Phase0Audit["duplicateCustomerCandidates"];
} {
  const customerFiles = files.filter((file) => file.customer);
  const disjointSet = new DisjointSet(customerFiles.length);
  const emailIndex = new Map<string, number[]>();
  const phoneIndex = new Map<string, number[]>();
  const nameAddressIndex = new Map<string, number[]>();
  const nameIndex = new Map<string, number[]>();
  const addressIndex = new Map<string, number[]>();

  customerFiles.forEach((file, index) => {
    const customer = file.customer!;
    addIndexes(emailIndex, customer.email, index);
    addIndexes(phoneIndex, customer.normalizedPhone, index);
    const strongAddress =
      customer.normalizedName && customer.normalizedStreet
        ? `${customer.normalizedName}|${customer.normalizedStreet}|${customer.normalizedPostalCode}`
        : null;
    addIndexes(nameAddressIndex, strongAddress, index);
    addIndexes(nameIndex, customer.normalizedName, index);
    addIndexes(addressIndex, customer.normalizedStreet, index);
  });

  unionIndexGroups(disjointSet, emailIndex);
  unionIndexGroups(disjointSet, phoneIndex);
  unionIndexGroups(disjointSet, nameAddressIndex);

  const byRoot = new Map<number, number[]>();
  customerFiles.forEach((_file, index) => {
    const root = disjointSet.find(index);
    const group = byRoot.get(root) ?? [];
    group.push(index);
    byRoot.set(root, group);
  });

  const sortedGroups = [...byRoot.values()].sort((left, right) =>
    customerFiles[left[0]].filename.localeCompare(customerFiles[right[0]].filename),
  );

  const clusters = sortedGroups.map((indexes, position): CustomerCluster => {
    const records = indexes.map((index) => customerFiles[index]);
    const emails = uniqueSorted(records.map((record) => record.customer?.email ?? ""));
    const phones = uniqueSorted(records.map((record) => record.customer?.normalizedPhone ?? ""));
    const names = uniqueSorted(records.map((record) => record.customer?.name ?? ""));
    const invoiceNumbers = uniqueSorted(records.map((record) => record.invoiceNumber ?? ""));
    const addresses = uniqueSorted(records.map((record) => {
      const customer = record.customer!;
      return [customer.street, customer.city, customer.province, customer.postalCode].filter(Boolean).join(", ");
    }));
    const matchedBy: string[] = [];
    if (emails.some((email) => (emailIndex.get(email)?.length ?? 0) > 1)) matchedBy.push("EXACT_NORMALIZED_EMAIL");
    if (phones.some((phone) => (phoneIndex.get(phone)?.length ?? 0) > 1)) matchedBy.push("EXACT_NORMALIZED_PHONE");
    if (records.some((record) => {
      const customer = record.customer!;
      const key = `${customer.normalizedName}|${customer.normalizedStreet}|${customer.normalizedPostalCode}`;
      return (nameAddressIndex.get(key)?.length ?? 0) > 1;
    })) matchedBy.push("STRONG_NAME_ADDRESS");

    const reviewFlags: string[] = [];
    if (emails.length > 1 && phones.length > 1 && names.length > 1) {
      reviewFlags.push("CONFLICTING_CONTACT_IDENTITIES_IN_CLUSTER");
    }
    if (addresses.length > 1 && names.length > 1) {
      reviewFlags.push("MULTIPLE_NAMES_AND_ADDRESSES_IN_CLUSTER");
    }

    return {
      clusterId: `customer-${String(position + 1).padStart(4, "0")}`,
      classification:
        reviewFlags.length > 0
          ? "MANUAL_REVIEW"
          : invoiceNumbers.length > 1
            ? "CONFIRMED_REPEAT_CUSTOMER"
            : records.length > 1
              ? "DUPLICATE_DOCUMENT_ONLY"
              : "PROBABLE_UNIQUE_CUSTOMER",
      filenames: records.map((record) => record.filename).sort(),
      invoiceNumbers,
      names,
      emails,
      phones,
      addresses,
      matchedBy: uniqueSorted(matchedBy),
      reviewFlags,
    };
  });

  const candidateMap = new Map<string, Phase0Audit["duplicateCustomerCandidates"][number]>();
  const addCandidate = (reason: string, indexes: number[], evidence: string[]) => {
    if (indexes.length < 2) return;
    const roots = uniqueSorted(indexes.map((index) => String(disjointSet.find(index))));
    if (roots.length < 2) return;
    const filenames = indexes.map((index) => customerFiles[index].filename).sort();
    const key = `${reason}|${filenames.join("|")}`;
    candidateMap.set(key, { reason, filenames, evidence: uniqueSorted(evidence) });
  };

  for (const [name, indexes] of nameIndex) {
    addCandidate("SAME_NAME_NOT_AUTO_MERGED", indexes, [name]);
  }
  for (const [address, indexes] of addressIndex) {
    const names = uniqueSorted(indexes.map((index) => customerFiles[index].customer!.normalizedName));
    if (names.length > 1) addCandidate("SAME_ADDRESS_DIFFERENT_CUSTOMER", indexes, [address, ...names]);
  }
  return {
    clusters,
    duplicateCandidates: [...candidateMap.values()].sort((left, right) =>
      `${left.reason}|${left.filenames[0]}`.localeCompare(`${right.reason}|${right.filenames[0]}`),
    ),
  };
}

function groupedDuplicates(
  files: FileEvidence[],
  value: (file: FileEvidence) => string | null,
): Array<{ value: string; filenames: string[] }> {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const key = value(file);
    if (!key) continue;
    const filenames = groups.get(key) ?? [];
    filenames.push(file.filename);
    groups.set(key, filenames);
  }
  return [...groups.entries()]
    .filter(([, filenames]) => filenames.length > 1)
    .map(([groupValue, filenames]) => ({ value: groupValue, filenames: filenames.sort() }))
    .sort((left, right) => left.value.localeCompare(right.value));
}

function buildAudit(sourceDirectory: string, files: FileEvidence[]): Phase0Audit {
  const hashDuplicates = groupedDuplicates(files, (file) => file.sha256);
  const invoiceDuplicates = groupedDuplicates(files, (file) => file.invoiceNumber);
  const customerAnalysis = buildCustomerAnalysis(files);
  const dates = files.map((file) => file.invoiceDate).filter((value): value is string => value != null).sort();
  const serviceCategoryCounts: Record<string, number> = {};
  for (const file of files) {
    for (const category of file.serviceSignals.probableCategories) {
      serviceCategoryCounts[category] = (serviceCategoryCounts[category] ?? 0) + 1;
    }
  }

  const duplicateCandidateFiles = new Set(
    customerAnalysis.duplicateCandidates.flatMap((candidate) => candidate.filenames),
  );
  const clusterReviewFiles = new Set(
    customerAnalysis.clusters
      .filter((cluster) => cluster.classification === "MANUAL_REVIEW")
      .flatMap((cluster) => cluster.filenames),
  );
  const duplicateInvoiceFiles = new Set(invoiceDuplicates.flatMap((group) => group.filenames));

  for (const file of files) {
    if (duplicateCandidateFiles.has(file.filename)) file.reviewFlags.push("POSSIBLE_DUPLICATE_CUSTOMER");
    if (clusterReviewFiles.has(file.filename)) file.reviewFlags.push("CUSTOMER_CLUSTER_CONFLICT");
    if (duplicateInvoiceFiles.has(file.filename)) file.reviewFlags.push("DUPLICATE_INVOICE_NUMBER");
    file.reviewFlags = uniqueSorted(file.reviewFlags);
  }

  const uniqueInvoices = new Set(files.map((file) => file.invoiceNumber).filter(Boolean));
  const uniqueHashes = new Set(files.map((file) => file.sha256).filter(Boolean));
  const uniqueEmails = new Set(files.map((file) => file.customer?.email).filter(Boolean));
  const uniquePhones = new Set(files.map((file) => file.customer?.normalizedPhone).filter(Boolean));
  const repeatClusters = customerAnalysis.clusters.filter(
    (cluster) => cluster.classification === "CONFIRMED_REPEAT_CUSTOMER",
  );
  const noCustomerRecords = files.filter((file) => !file.customer).length;

  const manualReviewCandidates = files
    .filter((file) => file.reviewFlags.length > 0)
    .map((file) => ({
      filename: file.filename,
      invoiceNumber: file.invoiceNumber,
      flags: file.reviewFlags,
    }));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    parserVersion: PARSER_VERSION,
    sourceDirectory,
    boundary: {
      databaseAccess: false,
      networkAccess: false,
      sourceMutation: false,
      productionAccess: false,
    },
    totals: {
      pdfFiles: files.length,
      readablePdfs: files.filter((file) => file.readStatus === "TEXT_EXTRACTED").length,
      unreadablePdfs: files.filter((file) => file.readStatus === "UNREADABLE").length,
      requiresOcr: files.filter((file) => file.readStatus === "REQUIRES_OCR").length,
      duplicateFiles: hashDuplicates.reduce((sum, group) => sum + group.filenames.length - 1, 0),
      uniqueFileHashes: uniqueHashes.size,
      uniqueInvoiceNumbers: uniqueInvoices.size,
      duplicateInvoiceNumbers: invoiceDuplicates.length,
      invoicesWithMissingNumber: files.filter((file) => !file.invoiceNumber).length,
      earliestInvoiceDate: dates[0] ?? null,
      latestInvoiceDate: dates.length > 0 ? dates[dates.length - 1] : null,
      uniqueEmails: uniqueEmails.size,
      uniqueNormalizedPhones: uniquePhones.size,
      probableUniqueCustomers: customerAnalysis.clusters.length + noCustomerRecords,
      repeatCustomerClusters: repeatClusters.length,
      repeatCustomerInvoices: repeatClusters.reduce((sum, cluster) => sum + cluster.invoiceNumbers.length, 0),
      duplicateCustomerCandidates: customerAnalysis.duplicateCandidates.length,
      calgaryRecords: files.filter((file) => file.customer?.normalizedCity === "calgary").length,
      otherLocationRecords: files.filter((file) =>
        Boolean(file.customer?.normalizedCity) && file.customer?.normalizedCity !== "calgary",
      ).length,
      unknownLocationRecords: files.filter((file) => !file.customer?.normalizedCity).length,
      invoicesWithPayments: files.filter((file) => file.paymentCount > 0).length,
      invoicesWithBalance: files.filter((file) => (file.financial?.balanceCents ?? 0) > 0).length,
      explicitPartsWarranty: files.filter((file) => file.warranty.explicitPartsWarranty).length,
      explicitLaborWarranty: files.filter((file) => file.warranty.explicitLaborWarranty).length,
      genericWarranty: files.filter((file) => file.warranty.genericWarranty).length,
      noWrittenWarranty: files.filter((file) => !file.warranty.hasWrittenWarranty).length,
      invoicesWithParts: files.filter((file) => file.serviceSignals.parts).length,
      invoicesWithLabor: files.filter((file) => file.serviceSignals.labor).length,
      invoicesWithCleaning: files.filter((file) => file.serviceSignals.cleaning).length,
      invoicesWithInspections: files.filter((file) => file.serviceSignals.inspection).length,
      invoicesWithRepairs: files.filter((file) => file.serviceSignals.repair).length,
      financialPass: files.filter((file) => file.financial?.status === "PASS").length,
      financialManualReview: files.filter((file) => file.financial?.status === "MANUAL_REVIEW").length,
      manualReviewFiles: manualReviewCandidates.length,
    },
    duplicateHashGroups: hashDuplicates.map((group) => ({ sha256: group.value, filenames: group.filenames })),
    duplicateInvoiceGroups: invoiceDuplicates.map((group) => ({
      invoiceNumber: group.value,
      filenames: group.filenames,
    })),
    customerClusters: customerAnalysis.clusters,
    duplicateCustomerCandidates: customerAnalysis.duplicateCandidates,
    serviceCategoryCounts: Object.fromEntries(
      Object.entries(serviceCategoryCounts).sort(([left], [right]) => left.localeCompare(right)),
    ),
    manualReviewCandidates,
    files,
  };
}

function formatCountList(values: Record<string, number>): string {
  return Object.entries(values)
    .map(([label, count]) => `- ${label}: ${count}`)
    .join("\n");
}

function formatExamples(
  values: Array<{ filename: string; invoiceNumber: string | null; flags: string[] }>,
  limit = 25,
): string {
  if (values.length === 0) return "- None";
  const lines = values.slice(0, limit).map((value) =>
    `- ${value.filename} (${value.invoiceNumber ?? "invoice unknown"}): ${value.flags.join(", ")}`,
  );
  if (values.length > limit) lines.push(`- …and ${values.length - limit} more in phase0-inventory.json`);
  return lines.join("\n");
}

function renderMarkdown(audit: Phase0Audit): string {
  const totals = audit.totals;
  const financialReasons: Record<string, number> = {};
  for (const file of audit.files) {
    for (const reason of file.financial?.reasons ?? []) {
      financialReasons[reason] = (financialReasons[reason] ?? 0) + 1;
    }
  }
  const reviewFlagCounts: Record<string, number> = {};
  for (const candidate of audit.manualReviewCandidates) {
    for (const flag of candidate.flags) {
      const reportLabel = flag.startsWith("PARSE_WARNING:")
        ? flag.split(":").slice(0, 2).join(":")
        : flag.startsWith("PARSE:")
          ? "PARSE:error"
          : flag;
      reviewFlagCounts[reportLabel] = (reviewFlagCounts[reportLabel] ?? 0) + 1;
    }
  }

  return `# Workiz Phase 0 Inventory Audit

Status: **PHASE 0 COMPLETE — OWNER CHECKPOINT REQUIRED**

This is a read-only inventory. No database, production environment, portal, network service, or source PDF was accessed for mutation. No import was performed.

## Executive checkpoint

- Source PDFs: ${totals.pdfFiles}
- Readable/text-extractable PDFs: ${totals.readablePdfs}
- Unreadable PDFs: ${totals.unreadablePdfs}
- PDFs requiring OCR/manual extraction: ${totals.requiresOcr}
- Duplicate files by SHA-256: ${totals.duplicateFiles}
- Unique invoice numbers: ${totals.uniqueInvoiceNumbers}
- Duplicate invoice-number groups: ${totals.duplicateInvoiceNumbers}
- Estimated unique customers: ${totals.probableUniqueCustomers}
- Repeat-customer clusters: ${totals.repeatCustomerClusters} (${totals.repeatCustomerInvoices} invoices)
- Duplicate/customer-identity candidate groups: ${totals.duplicateCustomerCandidates}
- Financial anomalies/manual reviews: ${totals.financialManualReview}
- Warranty distribution: ${totals.explicitPartsWarranty} explicit parts, ${totals.explicitLaborWarranty} explicit labor, ${totals.genericWarranty} generic/unclear, ${totals.noWrittenWarranty} no written warranty
- Files with any manual-review flag: ${totals.manualReviewFiles}

## Source inventory

- Source directory: \`${audit.sourceDirectory}\`
- Parser version: \`${audit.parserVersion}\`
- Date range: ${totals.earliestInvoiceDate ?? "unknown"} through ${totals.latestInvoiceDate ?? "unknown"}
- Unique file hashes: ${totals.uniqueFileHashes}
- Missing invoice numbers: ${totals.invoicesWithMissingNumber}
- Unique normalized emails: ${totals.uniqueEmails}
- Unique normalized phones: ${totals.uniqueNormalizedPhones}

## Customer identity inventory

- Estimated customer clusters: ${totals.probableUniqueCustomers}
- Confirmed repeat clusters from exact normalized email, exact normalized phone, or strong name+address: ${totals.repeatCustomerClusters}
- Candidate duplicate groups retained for manual review: ${totals.duplicateCustomerCandidates}
- No merge was made on name alone.

Location evidence:
- Calgary records: ${totals.calgaryRecords}
- Other identified locations: ${totals.otherLocationRecords}
- Unknown location: ${totals.unknownLocationRecords}

## Invoice and payment inventory

- Invoices with one or more parsed payment events: ${totals.invoicesWithPayments}
- Invoices with an outstanding balance: ${totals.invoicesWithBalance}
- Financial PASS: ${totals.financialPass}
- Financial MANUAL_REVIEW: ${totals.financialManualReview}

Financial manual-review reasons:
${formatCountList(financialReasons)}

The audit did not repair or infer money. Discounts are retained as evidence and routed to manual review because the locked Phase 0 formula is subtotal + tax = total.

## Warranty evidence

- Explicit parts warranty: ${totals.explicitPartsWarranty}
- Explicit labor warranty: ${totals.explicitLaborWarranty}
- Generic or scope-unclear written warranty: ${totals.genericWarranty}
- No written warranty: ${totals.noWrittenWarranty}

Default warranty policy has not been applied in Phase 0. This section reports source evidence only.
Parts and labor counts can overlap on the same invoice; generic/unclear means written warranty wording without a safely classified scope.

## Service evidence

- Invoices with parts signals: ${totals.invoicesWithParts}
- Invoices with labor signals: ${totals.invoicesWithLabor}
- Invoices with cleaning signals: ${totals.invoicesWithCleaning}
- Invoices with inspection signals: ${totals.invoicesWithInspections}
- Invoices with repair signals: ${totals.invoicesWithRepairs}

Probable category counts (categories can overlap):
${formatCountList(audit.serviceCategoryCounts)}

## Duplicate evidence

- Duplicate file-hash groups: ${audit.duplicateHashGroups.length}
- Duplicate invoice-number groups: ${audit.duplicateInvoiceGroups.length}
- Possible duplicate/customer-identity groups: ${audit.duplicateCustomerCandidates.length}

Full group membership and matching evidence are in \`backend/_runtime_harness/workiz-migration/phase0-inventory.json\`.

## Manual review

Review flag counts:
${formatCountList(reviewFlagCounts)}

Representative candidates:
${formatExamples(audit.manualReviewCandidates)}

## Proposed technical implementation boundary after owner approval

1. Build a versioned deterministic parser that emits source, customer, job, invoice, raw and structured invoice lines, individual payments, warranty evidence, service intelligence, confidence, and review flags.
2. Keep parser output outside production and build customer clusters with the locked identity priority. Existing-Phoenix matching requires a separately approved, tenant-scoped read phase.
3. Gate every invoice through strict money reconciliation. Only PASS records may enter an automated dry run; ambiguity remains MANUAL_REVIEW.
4. Add service intelligence and warranty reconstruction only after identity and money are stable. Preserve raw evidence and documented/default provenance.
5. Import first into an isolated database, verify counts and source hashes, manually trace the required sample, and run the same import twice with zero duplicates.
6. Production remains out of scope until every pre-production gate is accepted, backup/rollback and Phoenix organization context are confirmed, and the owner explicitly authorizes the production-import phase.

## Stop gate

Phase 0 stops here. No parser/import/schema/database phase is authorized by this audit.
`;
}

function verifyAudit(audit: Phase0Audit): void {
  const totals = audit.totals;
  const classifiedReads = totals.readablePdfs + totals.unreadablePdfs + totals.requiresOcr;
  if (classifiedReads !== totals.pdfFiles) {
    throw new Error(`Read classification invariant failed: ${classifiedReads} != ${totals.pdfFiles}`);
  }
  if (audit.files.length !== totals.pdfFiles) {
    throw new Error(`File count invariant failed: ${audit.files.length} != ${totals.pdfFiles}`);
  }
  if (totals.financialPass + totals.financialManualReview > totals.readablePdfs) {
    throw new Error("Financial classification exceeds readable file count");
  }
  if (audit.manualReviewCandidates.length !== totals.manualReviewFiles) {
    throw new Error("Manual review count invariant failed");
  }
}

async function main(): Promise<void> {
  const sourceDirectory = resolve(process.env.WORKIZ_INVOICE_PDF_SOURCE_DIR ?? DEFAULT_SOURCE_DIRECTORY);
  const outputRoot = resolve(process.cwd(), "_runtime_harness", "workiz-migration");
  const repositoryRoot = resolve(process.cwd(), "..");
  const auditDocumentDirectory = join(repositoryRoot, "docs", "migration");
  const entries = readdirSync(sourceDirectory)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort((left, right) => left.localeCompare(right));

  const files: FileEvidence[] = [];
  for (const [index, filename] of entries.entries()) {
    files.push(await inspectPdf(sourceDirectory, filename));
    if ((index + 1) % 50 === 0 || index + 1 === entries.length) {
      console.log(`Scanned ${index + 1}/${entries.length} PDFs`);
    }
  }

  const audit = buildAudit(sourceDirectory, files);
  verifyAudit(audit);

  mkdirSync(outputRoot, { recursive: true });
  mkdirSync(auditDocumentDirectory, { recursive: true });
  const jsonPath = join(outputRoot, "phase0-inventory.json");
  const markdownPath = join(auditDocumentDirectory, "WORKIZ_PHASE0_INVENTORY_AUDIT.md");
  writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(audit), "utf8");

  console.log(`Phase 0 JSON: ${jsonPath}`);
  console.log(`Phase 0 audit: ${markdownPath}`);
  console.log(JSON.stringify(audit.totals, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${basename(__filename)} failed`, error);
    process.exitCode = 1;
  });
}
