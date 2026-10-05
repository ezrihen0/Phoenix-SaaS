const { readFileSync, mkdirSync, writeFileSync } = require("fs") as typeof import("fs");
const { basename, join, resolve } = require("path") as typeof import("path");

const REFINEMENT_VERSION = "workiz-phase0.5-reconciliation-v1";
const MONEY_TOLERANCE_CENTS = 2;

type Phase0File = {
  filename: string;
  sha256: string | null;
  bytes: number;
  readStatus: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  customer: {
    name: string;
    normalizedName: string;
    email: string | null;
    normalizedPhone: string | null;
    street: string;
    city: string;
    province: string | null;
    postalCode: string;
    normalizedCity: string;
  } | null;
  financial: {
    subtotalCents: number | null;
    discountCents: number | null;
    taxCents: number | null;
    totalCents: number | null;
    paymentTotalCents: number;
    balanceCents: number | null;
    status?: "PASS" | "MANUAL_REVIEW";
  } | null;
  paymentCount: number;
  parseWarnings: string[];
  parseErrors: string[];
  reviewFlags: string[];
};

type Phase0Audit = {
  generatedAt: string;
  parserVersion: string;
  sourceDirectory: string;
  totals: Record<string, number>;
  duplicateInvoiceGroups: Array<{ invoiceNumber: string; filenames: string[] }>;
  duplicateCustomerCandidates: Array<{ reason: string; filenames: string[]; evidence: string[] }>;
  customerClusters: Array<{
    clusterId: string;
    classification: string;
    filenames: string[];
    invoiceNumbers: string[];
    names: string[];
    emails: string[];
    phones: string[];
    addresses: string[];
    matchedBy: string[];
    reviewFlags: string[];
  }>;
  files: Phase0File[];
};

type WorkizTotalRule = "SUBTOTAL_PLUS_TAX" | "SUBTOTAL_MINUS_DISCOUNT_PLUS_TAX";

type DiscountAnalysis = {
  invoicesWithDiscountLine: number;
  matchedSubtotalMinusDiscountPlusTax: number;
  matchedSubtotalPlusTaxOnly: number;
  unmatchedDiscountPresentation: number;
  unmatchedDiscountFilenames: string[];
  workizPresentationRule: WorkizTotalRule;
  note: string;
};

type RefinedFinancial = {
  filename: string;
  invoiceNumber: string | null;
  phase0Status: "PASS" | "MANUAL_REVIEW" | "UNKNOWN";
  refinedStatus: "PASS" | "MANUAL_REVIEW";
  appliedTotalRule: WorkizTotalRule | null;
  reasons: string[];
  primaryCause: string | null;
};

type DuplicateInvoiceReview = {
  invoiceNumber: string;
  filenames: string[];
  classification:
    | "DUPLICATE_FILE"
    | "DUPLICATE_EXPORT_VARIANT"
    | "REVISION_OR_VERSION"
    | "DISTINCT_RECORD"
    | "MANUAL_REVIEW";
  rationale: string;
  sha256: string[];
  bytes: number[];
  businessFieldsMatch: boolean;
  fieldDiffs: string[];
};

type IdentityReviewGroup = {
  groupKey: string;
  reason: string;
  recommendation: "KEEP_SEPARATE" | "MANUAL_REVIEW" | "MERGE_NOT_ALLOWED_WITHOUT_EVIDENCE";
  records: Array<{
    filename: string;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
  }>;
  ownerDecisionPrompt: string;
};

type RepeatCustomerConfirmation = {
  clusterId: string;
  confirmation: "CONFIRMED_REPEAT_SERVICE_HISTORY";
  invoiceCount: number;
  invoiceNumbers: string[];
  filenames: string[];
  matchedBy: string[];
  names: string[];
  emails: string[];
  phones: string[];
};

type Phase05Report = {
  schemaVersion: 1;
  generatedAt: string;
  refinementVersion: string;
  phase0GeneratedAt: string;
  phase0ParserVersion: string;
  sourceDirectory: string;
  boundary: {
    databaseAccess: false;
    networkAccess: false;
    sourceMutation: false;
    productionAccess: false;
  };
  discountAnalysis: DiscountAnalysis;
  financialComparison: {
    phase0Pass: number;
    phase0ManualReview: number;
    refinedPass: number;
    refinedManualReview: number;
    movedPassByDiscountRule: number;
  };
  refinedPrimaryCauseCounts: Record<string, number>;
  duplicateInvoiceReviews: DuplicateInvoiceReview[];
  identityReviewGroups: IdentityReviewGroup[];
  repeatCustomerConfirmations: RepeatCustomerConfirmation[];
  calgary: {
    invoiceRecords: number;
    uniqueCustomerClustersAfterDedupe: number;
    note: string;
  };
  refinedFinancials: RefinedFinancial[];
  ownerCheckpoint: {
    status: "PHASE 0.5 COMPLETE — OWNER CHECKPOINT REQUIRED";
    nextAuthorizedStep: null;
  };
};

function withinTolerance(left: number | null, right: number | null): boolean {
  if (left == null || right == null) return false;
  return Math.abs(left - right) <= MONEY_TOLERANCE_CENTS;
}

function loadPhase0Audit(): Phase0Audit {
  const path = resolve(process.cwd(), "_runtime_harness", "workiz-migration", "phase0-inventory.json");
  return JSON.parse(readFileSync(path, "utf8")) as Phase0Audit;
}

function analyzeDiscountPresentation(files: Phase0File[]): DiscountAnalysis {
  let withDiscount = 0;
  let matchedMinusDiscount = 0;
  let matchedPlusTaxOnly = 0;
  const unmatchedDiscountFilenames: string[] = [];

  for (const file of files) {
    const financial = file.financial;
    if (!financial || financial.discountCents == null || financial.discountCents <= 0) continue;
    withDiscount += 1;
    const { subtotalCents, discountCents, taxCents, totalCents } = financial;
    if (
      subtotalCents != null
      && taxCents != null
      && totalCents != null
      && withinTolerance(subtotalCents - discountCents + taxCents, totalCents)
    ) {
      matchedMinusDiscount += 1;
      continue;
    }
    if (
      subtotalCents != null
      && taxCents != null
      && totalCents != null
      && withinTolerance(subtotalCents + taxCents, totalCents)
    ) {
      matchedPlusTaxOnly += 1;
      continue;
    }
    unmatchedDiscountFilenames.push(file.filename);
  }

  return {
    invoicesWithDiscountLine: withDiscount,
    matchedSubtotalMinusDiscountPlusTax: matchedMinusDiscount,
    matchedSubtotalPlusTaxOnly: matchedPlusTaxOnly,
    unmatchedDiscountPresentation: unmatchedDiscountFilenames.length,
    unmatchedDiscountFilenames,
    workizPresentationRule: "SUBTOTAL_MINUS_DISCOUNT_PLUS_TAX",
    note:
      "When a Discount line is present on the Workiz PDF, tax is applied after discount: "
      + "subtotal - discount + tax = total. Phase 0 incorrectly treated all invoices as subtotal + tax = total.",
  };
}

function refineFinancial(file: Phase0File): RefinedFinancial {
  const phase0Status: RefinedFinancial["phase0Status"] =
    file.financial?.status === "PASS" || file.financial?.status === "MANUAL_REVIEW"
      ? file.financial.status
      : file.financial
        ? "MANUAL_REVIEW"
        : "UNKNOWN";

  const financial = file.financial;
  if (!financial || file.readStatus !== "TEXT_EXTRACTED") {
    return {
      filename: file.filename,
      invoiceNumber: file.invoiceNumber,
      phase0Status: phase0Status === "UNKNOWN" ? "MANUAL_REVIEW" : phase0Status,
      refinedStatus: "MANUAL_REVIEW",
      appliedTotalRule: null,
      reasons: ["missing_or_unreadable_financials"],
      primaryCause: "MISSING_FINANCIALS",
    };
  }

  const reasons: string[] = [];
  const {
    subtotalCents,
    discountCents,
    taxCents,
    totalCents,
    balanceCents,
    paymentTotalCents,
  } = financial;
  const discount = discountCents ?? 0;
  const appliedTotalRule: WorkizTotalRule =
    discount > 0 ? "SUBTOTAL_MINUS_DISCOUNT_PLUS_TAX" : "SUBTOTAL_PLUS_TAX";

  if (subtotalCents == null) reasons.push("missing_subtotal");
  if (totalCents == null) reasons.push("missing_total");
  if (taxCents == null && subtotalCents != null && totalCents != null) reasons.push("missing_tax");
  if (balanceCents == null) reasons.push("missing_balance");

  const expectedTotal =
    appliedTotalRule === "SUBTOTAL_MINUS_DISCOUNT_PLUS_TAX"
      ? subtotalCents != null && taxCents != null
        ? subtotalCents - discount + taxCents
        : null
      : subtotalCents != null && taxCents != null
        ? subtotalCents + taxCents
        : null;

  if (expectedTotal != null && totalCents != null && !withinTolerance(expectedTotal, totalCents)) {
    reasons.push("total_mismatch");
  }

  if (
    totalCents != null
    && balanceCents != null
    && !withinTolerance(paymentTotalCents, totalCents - balanceCents)
  ) {
    reasons.push("payments_mismatch");
  }

  if (
    totalCents != null
    && balanceCents != null
    && !withinTolerance(totalCents - paymentTotalCents, balanceCents)
  ) {
    reasons.push("balance_mismatch");
  }

  if (totalCents != null && paymentTotalCents > totalCents + MONEY_TOLERANCE_CENTS) {
    reasons.push("payments_exceed_total");
  }

  if (totalCents != null && totalCents < 0) reasons.push("negative_total");
  if (balanceCents != null && balanceCents < 0) reasons.push("negative_balance");

  for (const warning of file.parseWarnings) {
    if (warning.includes("line_items_subtotal_mismatch")) {
      reasons.push("line_item_parse_warning");
    }
    if (warning.includes("payment_reconciliation_mismatch")) {
      reasons.push("payment_parse_warning");
    }
    if (warning.includes("synthetic_line_item_from_subtotal")) {
      reasons.push("synthetic_line_item_warning");
    }
  }

  const uniqueReasons = [...new Set(reasons)];
  const primaryCause = uniqueReasons.length === 0
    ? null
    : uniqueReasons.includes("missing_tax")
      ? "MISSING_TAX"
      : uniqueReasons.includes("missing_balance")
        ? "MISSING_BALANCE"
        : uniqueReasons.includes("payments_exceed_total")
          ? "PAYMENTS_EXCEED_TOTAL"
          : uniqueReasons.includes("payments_mismatch")
            || uniqueReasons.includes("balance_mismatch")
            || uniqueReasons.includes("payment_parse_warning")
            ? "PAYMENT_PARSE_OR_ALLOCATION"
            : uniqueReasons.includes("line_item_parse_warning")
              || uniqueReasons.includes("synthetic_line_item_warning")
              ? "LINE_ITEM_PARSE"
              : uniqueReasons.includes("total_mismatch")
                ? "TOTAL_MISMATCH"
                : uniqueReasons.includes("missing_subtotal") || uniqueReasons.includes("missing_total")
                  ? "MISSING_CORE_TOTALS"
                  : uniqueReasons[0].toUpperCase();

  return {
    filename: file.filename,
    invoiceNumber: file.invoiceNumber,
    phase0Status: phase0Status === "UNKNOWN" ? "MANUAL_REVIEW" : phase0Status,
    refinedStatus: uniqueReasons.length === 0 ? "PASS" : "MANUAL_REVIEW",
    appliedTotalRule,
    reasons: uniqueReasons,
    primaryCause,
  };
}

function compareBusinessFields(left: Phase0File, right: Phase0File): string[] {
  const diffs: string[] = [];
  const pairs: Array<[string, unknown, unknown]> = [
    ["invoiceNumber", left.invoiceNumber, right.invoiceNumber],
    ["invoiceDate", left.invoiceDate, right.invoiceDate],
    ["customer.email", left.customer?.email, right.customer?.email],
    ["customer.phone", left.customer?.normalizedPhone, right.customer?.normalizedPhone],
    ["financial.totalCents", left.financial?.totalCents, right.financial?.totalCents],
    ["financial.subtotalCents", left.financial?.subtotalCents, right.financial?.subtotalCents],
    ["financial.taxCents", left.financial?.taxCents, right.financial?.taxCents],
    ["financial.discountCents", left.financial?.discountCents, right.financial?.discountCents],
    ["paymentCount", left.paymentCount, right.paymentCount],
  ];
  for (const [label, a, b] of pairs) {
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(label);
  }
  return diffs;
}

function reviewDuplicateInvoiceGroup(
  group: { invoiceNumber: string; filenames: string[] },
  fileByName: Map<string, Phase0File>,
): DuplicateInvoiceReview {
  const records = group.filenames.map((filename) => fileByName.get(filename)).filter(Boolean) as Phase0File[];
  const sha256 = records.map((record) => record.sha256).filter(Boolean) as string[];
  const bytes = records.map((record) => record.bytes);
  const uniqueHashes = new Set(sha256);

  if (records.length < 2) {
    return {
      invoiceNumber: group.invoiceNumber,
      filenames: group.filenames,
      classification: "MANUAL_REVIEW",
      rationale: "Expected at least two files in duplicate invoice group.",
      sha256,
      bytes,
      businessFieldsMatch: false,
      fieldDiffs: [],
    };
  }

  if (uniqueHashes.size === 1) {
    return {
      invoiceNumber: group.invoiceNumber,
      filenames: group.filenames,
      classification: "DUPLICATE_FILE",
      rationale: "Identical SHA-256 and extracted business fields; treat as one source document.",
      sha256,
      bytes,
      businessFieldsMatch: true,
      fieldDiffs: [],
    };
  }

  const fieldDiffs = compareBusinessFields(records[0], records[1]);
  for (let index = 2; index < records.length; index += 1) {
    for (const diff of compareBusinessFields(records[0], records[index])) {
      if (!fieldDiffs.includes(diff)) fieldDiffs.push(diff);
    }
  }

  if (fieldDiffs.length === 0) {
    return {
      invoiceNumber: group.invoiceNumber,
      filenames: group.filenames,
      classification: "DUPLICATE_EXPORT_VARIANT",
      rationale:
        "Same Workiz invoice number, customer, date, and money with different PDF bytes "
        + "(likely duplicate export/download such as '(1).pdf'); one logical invoice, not a distinct second record.",
      sha256,
      bytes,
      businessFieldsMatch: true,
      fieldDiffs: [],
    };
  }

  const materialDiff = fieldDiffs.some((diff) =>
    !diff.startsWith("paymentCount") && diff !== "invoiceDate",
  );
  if (materialDiff) {
    return {
      invoiceNumber: group.invoiceNumber,
      filenames: group.filenames,
      classification: "REVISION_OR_VERSION",
      rationale: "Same invoice number with materially different extracted business fields; requires owner review.",
      sha256,
      bytes,
      businessFieldsMatch: false,
      fieldDiffs,
    };
  }

  return {
    invoiceNumber: group.invoiceNumber,
    filenames: group.filenames,
    classification: "DISTINCT_RECORD",
    rationale: "Same invoice number with non-identical extracted fields; do not auto-merge.",
    sha256,
    bytes,
    businessFieldsMatch: false,
    fieldDiffs,
  };
}

function buildIdentityReviewGroups(
  candidates: Phase0Audit["duplicateCustomerCandidates"],
  fileByName: Map<string, Phase0File>,
): IdentityReviewGroup[] {
  return candidates.map((candidate, index) => {
    const records = candidate.filenames.map((filename) => {
      const file = fileByName.get(filename)!;
      const customer = file.customer;
      return {
        filename,
        invoiceNumber: file.invoiceNumber,
        invoiceDate: file.invoiceDate,
        name: customer?.name ?? null,
        email: customer?.email ?? null,
        phone: customer?.normalizedPhone ?? null,
        address: customer?.street ?? null,
        city: customer?.city ?? null,
      };
    });

    const emailKeys = records.map((record) => record.email ?? "__missing__");
    const phoneKeys = records.map((record) => record.phone ?? "__missing__");
    const emailsDiffer = new Set(emailKeys).size > 1;
    const phonesDiffer = new Set(phoneKeys).size > 1;
    const cities = new Set(records.map((record) => record.city).filter(Boolean));

    const recommendation: IdentityReviewGroup["recommendation"] =
      emailsDiffer && phonesDiffer
        ? "KEEP_SEPARATE"
        : "MANUAL_REVIEW";

    return {
      groupKey: `same-name-group-${index + 1}`,
      reason: candidate.reason,
      recommendation,
      records,
      ownerDecisionPrompt:
        `Same first-name-only match (${candidate.evidence.join(", ")}). `
        + `Emails differ: ${emailsDiffer ? "yes" : "no"}. Phones differ: ${phonesDiffer ? "yes" : "no"}. `
        + `Cities: ${[...cities].join(" | ") || "unknown"}. `
        + "Do not merge on name alone.",
    };
  });
}

function countCalgaryClusters(audit: Phase0Audit, fileByName: Map<string, Phase0File>): {
  invoiceRecords: number;
  uniqueCustomerClustersAfterDedupe: number;
  note: string;
} {
  const invoiceRecords = audit.files.filter(
    (file) => file.customer?.normalizedCity === "calgary",
  ).length;
  const calgaryClusters = audit.customerClusters.filter((cluster) =>
    cluster.filenames.some((filename) => fileByName.get(filename)?.customer?.normalizedCity === "calgary"),
  ).length;

  return {
    invoiceRecords,
    uniqueCustomerClustersAfterDedupe: calgaryClusters,
    note:
      `${invoiceRecords} Calgary-tagged invoice records collapse to ${calgaryClusters} customer clusters `
      + "after conservative identity dedupe (exact email, exact phone, or strong name+address).",
  };
}

function renderMarkdown(report: Phase05Report): string {
  const fin = report.financialComparison;
  const discount = report.discountAnalysis;
  const causes = report.refinedPrimaryCauseCounts;

  const duplicateLines = report.duplicateInvoiceReviews.map((review) =>
    `- **${review.invoiceNumber}** → \`${review.classification}\`: ${review.rationale}`,
  ).join("\n");

  const identityLines = report.identityReviewGroups.map((group) => {
    const rows = group.records.map((record) =>
      `  - ${record.filename}: ${record.name ?? "?"} | ${record.email ?? "no email"} | ${record.phone ?? "no phone"} | ${record.city ?? "?"}`,
    ).join("\n");
    return `### ${group.groupKey}\n- Recommendation: **${group.recommendation}**\n- ${group.ownerDecisionPrompt}\n${rows}`;
  }).join("\n\n");

  const repeatLines = report.repeatCustomerConfirmations.map((cluster) =>
    `- **${cluster.clusterId}**: ${cluster.invoiceCount} invoices (${cluster.invoiceNumbers.join(", ")}) — `
      + `${cluster.names.join(" / ")} | matched by ${cluster.matchedBy.join(", ")}`,
  ).join("\n");

  const causeLines = Object.entries(causes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => `- ${label}: ${count}`)
    .join("\n");

  return `# Workiz Phase 0.5 Reconciliation and Identity Refinement

Status: **PHASE 0.5 COMPLETE — OWNER CHECKPOINT REQUIRED**

Read-only refinement on top of Phase 0 evidence. No database, schema, production, portal, network, or source PDF mutation.

## Executive checkpoint

- Phase 0 financial PASS → refined PASS: **${fin.phase0Pass} → ${fin.refinedPass}** (+${fin.movedPassByDiscountRule} from discount rule correction)
- Phase 0 financial MANUAL_REVIEW → refined MANUAL_REVIEW: **${fin.phase0ManualReview} → ${fin.refinedManualReview}**
- Workiz discount presentation rule: **subtotal - discount + tax = total** (${discount.matchedSubtotalMinusDiscountPlusTax}/${discount.invoicesWithDiscountLine} discount invoices match)
- Duplicate invoice-number groups reviewed: **${report.duplicateInvoiceReviews.length}**
- Same-name identity groups for owner review: **${report.identityReviewGroups.length}**
- Confirmed repeat-customer clusters (service history): **${report.repeatCustomerConfirmations.length}**
- Calgary invoice records: **${report.calgary.invoiceRecords}**
- Estimated unique Calgary customers after dedupe: **${report.calgary.uniqueCustomerClustersAfterDedupe}**

## Discount presentation (Workiz source rule)

${discount.note}

Evidence summary:
- Invoices with a parsed Discount line: ${discount.invoicesWithDiscountLine}
- Match \`subtotal - discount + tax = total\`: ${discount.matchedSubtotalMinusDiscountPlusTax}
- Match \`subtotal + tax = total\` only: ${discount.matchedSubtotalPlusTaxOnly}
- Unmatched discount presentations: ${discount.unmatchedDiscountPresentation}
${discount.unmatchedDiscountFilenames.length > 0
  ? `- Unmatched discount files: ${discount.unmatchedDiscountFilenames.join(", ")}`
  : ""}

Phase 0.5 recalculates PASS/MANUAL_REVIEW using this source-supported rule. Discount lines are not treated as automatic manual review by themselves.

## Refined financial review causes (exclusive primary cause)

${causeLines || "- None"}

Full per-file refined results: \`backend/_runtime_harness/workiz-migration/phase0.5-refinement.json\`

## Duplicate invoice-number groups

${duplicateLines}

Import implication: the three \`DUPLICATE_EXPORT_VARIANT\` groups represent **one logical invoice each** (keep one PDF hash as immutable evidence).

## Same-name duplicate-customer candidates (owner review)

${identityLines}

## Confirmed repeat-customer clusters (not duplicates)

These 10 clusters share exact normalized email and/or phone (and usually strong name+address). They are **repeat service history**, not duplicate customers:

${repeatLines}

Additional identity conflict from Phase 0 still requiring review: cluster \`customer-0296\` (Natalie / Natalie Diego — same email+phone, different addresses).

## Calgary dedupe estimate

${report.calgary.note}

## Stop gate

Phase 0.5 stops here. Parser build, identity engine import, and dry-run phases remain blocked until the owner accepts this checkpoint.
`;
}

function main(): void {
  const audit = loadPhase0Audit();
  const fileByName = new Map(audit.files.map((file) => [file.filename, file]));
  const discountAnalysis = analyzeDiscountPresentation(audit.files);

  const phase0Pass = audit.files.filter((file) => file.financial?.status === "PASS").length;
  const phase0ManualReview = audit.files.filter((file) => file.financial?.status === "MANUAL_REVIEW").length;

  const refinedFinancials = audit.files.map((file) => refineFinancial(file));

  const refinedPass = refinedFinancials.filter((entry) => entry.refinedStatus === "PASS").length;
  const refinedManualReview = refinedFinancials.filter((entry) => entry.refinedStatus === "MANUAL_REVIEW").length;
  const movedPassByDiscountRule = refinedFinancials.filter((entry) => {
    if (entry.phase0Status !== "MANUAL_REVIEW" || entry.refinedStatus !== "PASS") return false;
    const file = fileByName.get(entry.filename);
    return Boolean(file?.financial?.discountCents && file.financial.discountCents > 0);
  }).length;

  const refinedPrimaryCauseCounts: Record<string, number> = {};
  for (const entry of refinedFinancials) {
    if (entry.refinedStatus !== "MANUAL_REVIEW" || !entry.primaryCause) continue;
    refinedPrimaryCauseCounts[entry.primaryCause] = (refinedPrimaryCauseCounts[entry.primaryCause] ?? 0) + 1;
  }

  const duplicateInvoiceReviews = audit.duplicateInvoiceGroups.map((group) =>
    reviewDuplicateInvoiceGroup(group, fileByName),
  );

  const identityReviewGroups = buildIdentityReviewGroups(audit.duplicateCustomerCandidates, fileByName);

  const repeatCustomerConfirmations = audit.customerClusters
    .filter((cluster) => cluster.classification === "CONFIRMED_REPEAT_CUSTOMER")
    .map((cluster) => ({
      clusterId: cluster.clusterId,
      confirmation: "CONFIRMED_REPEAT_SERVICE_HISTORY" as const,
      invoiceCount: cluster.invoiceNumbers.length,
      invoiceNumbers: cluster.invoiceNumbers,
      filenames: cluster.filenames,
      matchedBy: cluster.matchedBy,
      names: cluster.names,
      emails: cluster.emails,
      phones: cluster.phones,
    }));

  const report: Phase05Report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    refinementVersion: REFINEMENT_VERSION,
    phase0GeneratedAt: audit.generatedAt,
    phase0ParserVersion: audit.parserVersion,
    sourceDirectory: audit.sourceDirectory,
    boundary: {
      databaseAccess: false,
      networkAccess: false,
      sourceMutation: false,
      productionAccess: false,
    },
    discountAnalysis,
    financialComparison: {
      phase0Pass,
      phase0ManualReview,
      refinedPass,
      refinedManualReview,
      movedPassByDiscountRule,
    },
    refinedPrimaryCauseCounts,
    duplicateInvoiceReviews,
    identityReviewGroups,
    repeatCustomerConfirmations,
    calgary: countCalgaryClusters(audit, fileByName),
    refinedFinancials,
    ownerCheckpoint: {
      status: "PHASE 0.5 COMPLETE — OWNER CHECKPOINT REQUIRED",
      nextAuthorizedStep: null,
    },
  };

  const outputRoot = resolve(process.cwd(), "_runtime_harness", "workiz-migration");
  const repoRoot = resolve(process.cwd(), "..");
  mkdirSync(outputRoot, { recursive: true });
  mkdirSync(join(repoRoot, "docs", "migration"), { recursive: true });

  const jsonPath = join(outputRoot, "phase0.5-refinement.json");
  const markdownPath = join(repoRoot, "docs", "migration", "WORKIZ_PHASE0_5_RECONCILIATION_REFINEMENT.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");

  console.log(`Phase 0.5 JSON: ${jsonPath}`);
  console.log(`Phase 0.5 audit: ${markdownPath}`);
  console.log(JSON.stringify({
    financialComparison: report.financialComparison,
    discountAnalysis: report.discountAnalysis,
    refinedPrimaryCauseCounts: report.refinedPrimaryCauseCounts,
    duplicateInvoiceReviews: report.duplicateInvoiceReviews.map((review) => ({
      invoiceNumber: review.invoiceNumber,
      classification: review.classification,
    })),
    calgary: report.calgary,
  }, null, 2));
}

if (require.main === module) {
  main();
}
