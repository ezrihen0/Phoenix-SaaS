import type {
  WorkizCustomerCluster,
  WorkizHistoricalCustomerEvidence,
  WorkizHistoricalParseCandidate,
  WorkizIdentityClassification,
} from "./workiz-historical-types.v1";

/** Locked Phase 0.5 owner decisions — do not merge these filename pairs. */
export const LOCKED_KEEP_SEPARATE_FILENAME_GROUPS: string[][] = [
  ["Adam.no55516.pdf", "Adam.no55543.pdf"],
  ["Andy.no55560.pdf", "Andy.no55564.pdf"],
  ["Jason.no55664.pdf", "Jason.no55698.pdf"],
  ["Pat.no55496.pdf", "Pat.no55589.pdf"],
  ["Steve.no55526.pdf", "Steve.no55802.pdf"],
];

export const LOCKED_MANUAL_REVIEW_FILENAMES = ["Natalie.no55801.pdf", "NatalieDiego.no55512.pdf"];

/** Locked Phase 0.5 repeat-customer invoice groups (service history, not duplicates). */
export const LOCKED_CONFIRMED_REPEAT_INVOICE_GROUPS: string[][] = [
  ["15CR4Q", "2SLU9O"],
  ["GI9O33", "TFL54I"],
  ["R5TFIP", "ZUMPKD"],
  ["70QLL2", "I7RU4Z"],
  ["D613FB", "L166SD"],
  ["504ADE", "62QJZP"],
  ["JB128S", "N6BWLH"],
  ["ON6JSY", "TWKN8Z"],
  ["ESWWY6", "NP1EF3"],
  ["P9B398", "PTAG68"],
];

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
      this.parent[Math.min(leftRoot, rightRoot)] = Math.max(leftRoot, rightRoot);
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

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function pairsMustStaySeparate(leftFilename: string, rightFilename: string): boolean {
  for (const group of LOCKED_KEEP_SEPARATE_FILENAME_GROUPS) {
    if (group.includes(leftFilename) && group.includes(rightFilename)) return true;
  }
  return false;
}

function addIndexes(index: Map<string, number[]>, key: string | null | undefined, recordIndex: number): void {
  if (!key) return;
  const group = index.get(key) ?? [];
  group.push(recordIndex);
  index.set(key, group);
}

function unionIndexGroups(
  disjointSet: DisjointSet,
  index: Map<string, number[]>,
  candidates: WorkizHistoricalParseCandidate[],
): void {
  for (const group of index.values()) {
    for (let position = 1; position < group.length; position += 1) {
      const left = group[0];
      const right = group[position];
      if (pairsMustStaySeparate(candidates[left].source.filename, candidates[right].source.filename)) {
        continue;
      }
      disjointSet.union(left, right);
    }
  }
}

export function resolveWorkizHistoricalIdentity(
  candidates: WorkizHistoricalParseCandidate[],
): { clusters: WorkizCustomerCluster[]; filenameToClusterId: Map<string, string> } {
  const eligible = candidates.filter((candidate) => candidate.customer && candidate.invoice);
  const disjointSet = new DisjointSet(eligible.length);
  const emailIndex = new Map<string, number[]>();
  const phoneIndex = new Map<string, number[]>();
  const nameAddressIndex = new Map<string, number[]>();

  eligible.forEach((candidate, index) => {
    const customer = candidate.customer!;
    addIndexes(emailIndex, customer.normalized_email, index);
    addIndexes(phoneIndex, customer.normalized_phone, index);
    const strongAddress =
      customer.name && customer.address_line_1
        ? `${normalizeWords(customer.name)}|${normalizeWords(customer.address_line_1)}|${customer.postal_code.replace(/[^a-z0-9]/gi, "").toUpperCase()}`
        : null;
    addIndexes(nameAddressIndex, strongAddress, index);
  });

  unionIndexGroups(disjointSet, emailIndex, eligible);
  unionIndexGroups(disjointSet, phoneIndex, eligible);
  unionIndexGroups(disjointSet, nameAddressIndex, eligible);

  const byRoot = new Map<number, number[]>();
  eligible.forEach((_candidate, index) => {
    const root = disjointSet.find(index);
    const group = byRoot.get(root) ?? [];
    group.push(index);
    byRoot.set(root, group);
  });

  const sortedGroups = [...byRoot.entries()].sort((left, right) =>
    eligible[left[1][0]].source.filename.localeCompare(eligible[right[1][0]].source.filename),
  );

  const clusters: WorkizCustomerCluster[] = sortedGroups.map(([_, indexes], position) => {
    const records = indexes.map((index) => eligible[index]);
    const emails = uniqueSorted(records.map((record) => record.customer!.normalized_email ?? ""));
    const phones = uniqueSorted(records.map((record) => record.customer!.normalized_phone ?? ""));
    const invoiceNumbers = uniqueSorted(records.map((record) => record.invoice!.workiz_invoice_number));
    const filenames = records.map((record) => record.source.filename).sort();
    const matchedBy: string[] = [];
    if (emails.some((email) => (emailIndex.get(email)?.length ?? 0) > 1)) matchedBy.push("EXACT_NORMALIZED_EMAIL");
    if (phones.some((phone) => (phoneIndex.get(phone)?.length ?? 0) > 1)) matchedBy.push("EXACT_NORMALIZED_PHONE");
    if (records.some((record) => {
      const customer = record.customer!;
      const key = `${normalizeWords(customer.name)}|${normalizeWords(customer.address_line_1)}|${customer.postal_code.replace(/[^a-z0-9]/gi, "").toUpperCase()}`;
      return (nameAddressIndex.get(key)?.length ?? 0) > 1;
    })) matchedBy.push("STRONG_NAME_ADDRESS");

    const reviewFlags: string[] = [];
    const names = uniqueSorted(records.map((record) => record.customer!.name));
    const addresses = uniqueSorted(records.map((record) => {
      const customer = record.customer!;
      return [customer.address_line_1, customer.city, customer.province, customer.postal_code].filter(Boolean).join(", ");
    }));

    if (emails.length > 1 && phones.length > 1 && names.length > 1) {
      reviewFlags.push("CONFLICTING_CONTACT_IDENTITIES_IN_CLUSTER");
    }
    if (addresses.length > 1 && names.length > 1) {
      reviewFlags.push("MULTIPLE_NAMES_AND_ADDRESSES_IN_CLUSTER");
    }

    let classification: WorkizIdentityClassification = "CONFIRMED_NEW_CUSTOMER";
    if (reviewFlags.length > 0) {
      classification = "MANUAL_REVIEW";
    } else if (invoiceNumbers.length > 1) {
      classification = "CONFIRMED_REPEAT_CUSTOMER";
    }

    const clusterId = `customer-${String(position + 1).padStart(4, "0")}`;

    return {
      cluster_id: clusterId,
      classification,
      invoice_numbers: invoiceNumbers,
      filenames,
      matched_by: uniqueSorted(matchedBy),
      review_flags: reviewFlags,
      customer_snapshot: records[0].customer,
    };
  });

  for (const cluster of clusters) {
    const hasLockedManualReview = LOCKED_MANUAL_REVIEW_FILENAMES.every((filename) =>
      cluster.filenames.includes(filename),
    );
    if (hasLockedManualReview) {
      cluster.classification = "MANUAL_REVIEW";
      cluster.review_flags = uniqueSorted([...cluster.review_flags, "OWNER_LOCKED_MANUAL_REVIEW"]);
    }

    const matchesLockedRepeat = LOCKED_CONFIRMED_REPEAT_INVOICE_GROUPS.some((group) =>
      group.every((invoiceNumber) => cluster.invoice_numbers.includes(invoiceNumber)),
    );
    if (matchesLockedRepeat && cluster.classification !== "MANUAL_REVIEW") {
      cluster.classification = "CONFIRMED_REPEAT_CUSTOMER";
    }
  }

  const filenameToClusterId = new Map<string, string>();
  for (const cluster of clusters) {
    for (const filename of cluster.filenames) {
      filenameToClusterId.set(filename, cluster.cluster_id);
    }
  }

  for (const candidate of candidates) {
    const clusterId = filenameToClusterId.get(candidate.source.filename) ?? null;
    const cluster = clusters.find((entry) => entry.cluster_id === clusterId) ?? null;
    candidate.identity = {
      cluster_id: clusterId,
      classification: cluster?.classification ?? (candidate.customer ? "CONFIRMED_NEW_CUSTOMER" : "MANUAL_REVIEW"),
    };
    if (cluster?.classification === "MANUAL_REVIEW") {
      candidate.review_flags = uniqueSorted([...candidate.review_flags, "IDENTITY_MANUAL_REVIEW"]);
    }
  }

  return { clusters, filenameToClusterId };
}

export function pickCanonicalDuplicateExportFilename(filenames: string[]): string {
  const withoutNumericCopy = filenames.filter((filename) => !/\(\d+\)\.pdf$/i.test(filename));
  if (withoutNumericCopy.length === 1) return withoutNumericCopy[0];
  return [...filenames].sort((left, right) => left.localeCompare(right))[0];
}

export function estimateCalgaryCustomerClusters(clusters: WorkizCustomerCluster[]): number {
  return clusters.filter((cluster) =>
    cluster.customer_snapshot?.normalized_city === "calgary",
  ).length;
}
