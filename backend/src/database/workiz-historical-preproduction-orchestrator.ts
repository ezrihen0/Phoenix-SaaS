import "dotenv/config";
import "reflect-metadata";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { reconcileAuthoritativePdfPayments } from "./workiz/workiz-import-payment-reconciliation";
import { resolvePhoenixOperatingOrganization } from "./jobber/phoenix-org-resolver";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { JobEntity } from "./entities/job.entity";
import {
  assertWorkizProductionMutationAllowed,
  buildWorkizMutationGuardContext,
  isEphemeralWorkizMutationDatabase,
  PHOENIX_ORG_ID,
  PHOENIX_ORG_SLUG,
} from "./workiz/workiz-production-mutation-guard";
import { reconcileWorkizHistoricalFinancials } from "./workiz/workiz-historical-financial.v1";
import {
  loadExistingWorkizImportIndex,
  upsertHistoricalWorkizInvoice,
  WORKIZ_HISTORICAL_IMPORT_SOURCE,
  type WorkizHistoricalInvoiceInput,
} from "./workiz/workiz-invoice-upsert";
import { estimateCalgaryCustomerClusters, resolveWorkizHistoricalIdentity } from "./workiz/workiz-historical-identity.v1";
import { isWorkizWarrantyReconstructionValid } from "./workiz/workiz-historical-service-warranty.v1";
import { parseAllWorkizHistoricalPdfs } from "./workiz/workiz-historical-parser.v1";
import {
  WORKIZ_CALGARY_TAG,
  WORKIZ_HISTORICAL_PIPELINE_VERSION,
  WORKIZ_PROVENANCE_TAGS,
  type WorkizCustomerCluster,
  type WorkizHistoricalParseCandidate,
} from "./workiz/workiz-historical-types.v1";

type DryRunCounts = {
  customers: number;
  jobs: number;
  invoices: number;
  payments: number;
  sourceDocuments: number;
};

type ImportPassDelta = {
  customersCreated: number;
  jobsCreated: number;
  invoicesCreated: number;
  paymentsCreated: number;
  sourceDocumentsCreated: number;
};

type IdempotencyResult = {
  secondRunCustomersCreated: number;
  secondRunJobsCreated: number;
  secondRunInvoicesCreated: number;
  secondRunPaymentsCreated: number;
  secondRunSourceDocumentsCreated: number;
  pass: boolean;
};

type Phase5Verification = {
  crossOrgMismatches: number;
  duplicateCustomers: number;
  duplicateJobs: number;
  duplicateInvoices: number;
  duplicatePayments: number;
  duplicateSourceDocuments: number;
  financialReconciliationFailuresAmongPass: number;
  sourceDocumentLinkageFailures: number;
  warrantyCalculationFailures: number;
  pass: boolean;
  details: string[];
};

type Phase0WarrantyComparison = {
  phase0ExplicitPartsPdfs: number;
  phase0ExplicitLaborPdfs: number;
  phase0GenericWarrantyPdfs: number;
  partsOutcome: {
    documented: number;
    ambiguous: number;
    defaultPolicy: number;
    phase0SignalNoWarrantyEvidenceInCorpus: number;
  };
  laborOutcome: {
    documented: number;
    ambiguous: number;
    defaultPolicy: number;
    phase0SignalNoWarrantyEvidenceInCorpus: number;
  };
  genericPhase0Mapping: {
    ambiguousParts: number;
    ambiguousLabor: number;
    documentedBoth: number;
    defaultBoth: number;
  };
};

function parseArgs(argv: string[]) {
  return {
    executeDryRun: argv.includes("--execute-dry-run"),
    allowProductionMutation: argv.includes("--allow-production-mutation"),
  };
}

function comparePhase0WarrantyEvidence(candidates: WorkizHistoricalParseCandidate[]): Phase0WarrantyComparison | null {
  const phase0Path = resolve(process.cwd(), "_runtime_harness", "workiz-migration", "phase0-inventory.json");
  if (!existsSync(phase0Path)) return null;

  const phase0 = JSON.parse(readFileSync(phase0Path, "utf8")) as {
    files: Array<{
      sha256: string;
      warranty: {
        explicitPartsWarranty: boolean;
        explicitLaborWarranty: boolean;
        genericWarranty: boolean;
      };
    }>;
  };

  const bySha = new Map(candidates.map((candidate) => [candidate.source.sha256, candidate]));
  const comparison: Phase0WarrantyComparison = {
    phase0ExplicitPartsPdfs: phase0.files.filter((file) => file.warranty.explicitPartsWarranty).length,
    phase0ExplicitLaborPdfs: phase0.files.filter((file) => file.warranty.explicitLaborWarranty).length,
    phase0GenericWarrantyPdfs: phase0.files.filter((file) => file.warranty.genericWarranty).length,
    partsOutcome: {
      documented: 0,
      ambiguous: 0,
      defaultPolicy: 0,
      phase0SignalNoWarrantyEvidenceInCorpus: 0,
    },
    laborOutcome: {
      documented: 0,
      ambiguous: 0,
      defaultPolicy: 0,
      phase0SignalNoWarrantyEvidenceInCorpus: 0,
    },
    genericPhase0Mapping: {
      ambiguousParts: 0,
      ambiguousLabor: 0,
      documentedBoth: 0,
      defaultBoth: 0,
    },
  };

  const mapPartsOutcome = (candidate: WorkizHistoricalParseCandidate) => {
    const provenance = candidate.warranty_reconstruction?.parts.provenance;
    if (provenance === "DOCUMENTED") comparison.partsOutcome.documented += 1;
    else if (provenance === "AMBIGUOUS_WARRANTY") comparison.partsOutcome.ambiguous += 1;
    else if (provenance === "PHOENIX_DEFAULT_POLICY") comparison.partsOutcome.defaultPolicy += 1;
  };

  const mapLaborOutcome = (candidate: WorkizHistoricalParseCandidate) => {
    const provenance = candidate.warranty_reconstruction?.labor.provenance;
    if (provenance === "DOCUMENTED") comparison.laborOutcome.documented += 1;
    else if (provenance === "AMBIGUOUS_WARRANTY") comparison.laborOutcome.ambiguous += 1;
    else if (provenance === "PHOENIX_DEFAULT_POLICY") comparison.laborOutcome.defaultPolicy += 1;
  };

  for (const file of phase0.files) {
    const candidate = bySha.get(file.sha256);
    if (!candidate) continue;
    const hasCorpusEvidence = candidate.warranty_evidence.length > 0;

    if (file.warranty.explicitPartsWarranty) {
      if (!hasCorpusEvidence) {
        comparison.partsOutcome.phase0SignalNoWarrantyEvidenceInCorpus += 1;
      }
      mapPartsOutcome(candidate);
    }
    if (file.warranty.explicitLaborWarranty) {
      if (!hasCorpusEvidence) {
        comparison.laborOutcome.phase0SignalNoWarrantyEvidenceInCorpus += 1;
      }
      mapLaborOutcome(candidate);
    }
    if (file.warranty.genericWarranty) {
      const parts = candidate.warranty_reconstruction?.parts.provenance;
      const labor = candidate.warranty_reconstruction?.labor.provenance;
      if (parts === "AMBIGUOUS_WARRANTY") comparison.genericPhase0Mapping.ambiguousParts += 1;
      if (labor === "AMBIGUOUS_WARRANTY") comparison.genericPhase0Mapping.ambiguousLabor += 1;
      if (parts === "DOCUMENTED" && labor === "DOCUMENTED") comparison.genericPhase0Mapping.documentedBoth += 1;
      if (parts === "PHOENIX_DEFAULT_POLICY" && labor === "PHOENIX_DEFAULT_POLICY") {
        comparison.genericPhase0Mapping.defaultBoth += 1;
      }
    }
  }

  return comparison;
}

function buildPdfProvenance(candidate: WorkizHistoricalParseCandidate, importedAt: string): Record<string, unknown> {
  return {
    import_source: WORKIZ_HISTORICAL_IMPORT_SOURCE,
    source_kind: "pdf",
    source_system: "WORKIZ",
    workiz_invoice_code: candidate.invoice?.workiz_invoice_number,
    workiz_file_number: candidate.source.workiz_file_number,
    source_filename: candidate.source.filename,
    source_sha256: candidate.source.sha256,
    source_path: candidate.source.source_path,
    parser_version: candidate.source.parser_version,
    import_batch_id: candidate.source.import_batch_id,
    imported_at: importedAt,
    duplicate_export_siblings: candidate.source.duplicate_export_siblings,
    financial_gate: candidate.financial_gate,
    identity_cluster_id: candidate.identity.cluster_id,
    service_intelligence: candidate.service_intelligence,
    warranty_reconstruction: candidate.warranty_reconstruction,
    review_flags: candidate.review_flags,
    enrichment_status: "pdf_preproduction_v1",
  };
}

function isEligibleForAutomaticImport(candidate: WorkizHistoricalParseCandidate): boolean {
  if (!candidate.source.is_canonical_for_invoice) return false;
  if (!candidate.invoice || !candidate.customer) return false;
  if (candidate.financial_gate !== "PASS") return false;
  if (candidate.identity.classification === "MANUAL_REVIEW") return false;
  return true;
}

async function ensureCustomerForCluster(input: {
  dataSource: DataSource;
  organizationId: string;
  cluster: WorkizCustomerCluster;
  customerKeyToId: Map<string, string>;
}): Promise<string> {
  const snapshot = input.cluster.customer_snapshot;
  if (!snapshot) throw new Error(`Cluster ${input.cluster.cluster_id} missing customer snapshot`);

  const externalKey = snapshot.normalized_email
    ? `workiz:email:${snapshot.normalized_email}`
    : snapshot.normalized_phone
      ? `workiz:phone:${snapshot.normalized_phone}`
      : `workiz:cluster:${input.cluster.cluster_id}`;

  const existingId = input.customerKeyToId.get(externalKey);
  if (existingId) return existingId;

  const repo = input.dataSource.getRepository(CustomerEntity);
  const byExternal = await repo.findOne({
    where: { organization_id: input.organizationId, external_client_number: externalKey },
  });
  if (byExternal) {
    input.customerKeyToId.set(externalKey, byExternal.id);
    return byExternal.id;
  }

  if (snapshot.normalized_email) {
    const byEmail = await repo.findOne({
      where: { organization_id: input.organizationId, email: snapshot.normalized_email },
    });
    if (byEmail) {
      input.customerKeyToId.set(externalKey, byEmail.id);
      return byEmail.id;
    }
  }

  if (snapshot.normalized_phone) {
    const phoneCandidates = await repo.find({ where: { organization_id: input.organizationId } });
    const phoneMatch = phoneCandidates.find((customer) =>
      customer.phone.replace(/\D/g, "") === snapshot.normalized_phone,
    );
    if (phoneMatch) {
      input.customerKeyToId.set(externalKey, phoneMatch.id);
      return phoneMatch.id;
    }
  }

  const created = await repo.save(repo.create({
    organization_id: input.organizationId,
    external_client_number: externalKey,
    full_name: snapshot.name,
    email: snapshot.normalized_email,
    company_name: snapshot.company,
    phone: snapshot.phone || "(000) 000-0000",
    service_address_line_1: snapshot.address_line_1,
    service_address_line_2: snapshot.address_line_2,
    service_city: snapshot.city,
    service_state_or_region: snapshot.province,
    service_postal_code: snapshot.postal_code,
    tags: [
      ...WORKIZ_PROVENANCE_TAGS,
      ...(snapshot.normalized_city === "calgary" ? [WORKIZ_CALGARY_TAG] : []),
    ],
    notes: `Workiz historical import cluster ${input.cluster.cluster_id}`,
  }));
  input.customerKeyToId.set(externalKey, created.id);
  return created.id;
}

function toHistoricalInvoiceInput(
  candidate: WorkizHistoricalParseCandidate,
  importedAt: string,
): WorkizHistoricalInvoiceInput {
  const invoice = candidate.invoice!;
  const invoiceDate = invoice.invoice_date ? new Date(`${invoice.invoice_date}T12:00:00.000Z`) : new Date();
  const dueDate = invoice.due_date ? new Date(`${invoice.due_date}T12:00:00.000Z`) : invoiceDate;
  const paid = (invoice.balance_due_cents ?? 0) === 0 && candidate.payments.length > 0;
  const paidAt = paid
    ? candidate.payments
      .map((payment) => payment.occurred_at)
      .filter(Boolean)
      .sort()
      .at(-1)
    : null;

  return {
    invoiceCode: invoice.workiz_invoice_number,
    jobCode: candidate.source.workiz_file_number,
    invoiceDate,
    dueDate,
    subtotalCents: invoice.subtotal_cents ?? 0,
    taxCents: invoice.tax_cents ?? 0,
    taxRateBps: invoice.tax_rate_bps ?? 0,
    totalCents: invoice.total_cents ?? 0,
    paid,
    paidAt: paidAt ? new Date(`${paidAt}T12:00:00.000Z`) : null,
    lineItems: candidate.invoice_lines.map((line) => ({
      description: line.raw_description,
      quantity: line.quantity,
      unitPriceCents: line.unit_price_cents,
      amountCents: line.amount_cents,
    })),
    payments: candidate.payments.map((payment) => ({
      amountCents: payment.amount_cents,
      occurredAt: payment.occurred_at ? new Date(`${payment.occurred_at}T12:00:00.000Z`) : null,
      methodLabel: payment.method_label,
    })),
    notes: candidate.job.historical_notes,
    provenance: buildPdfProvenance(candidate, importedAt),
  };
}

async function countTenantRows(dataSource: DataSource, organizationId: string): Promise<DryRunCounts> {
  const customers = await dataSource.getRepository(CustomerEntity).count({ where: { organization_id: organizationId } });
  const jobs = await dataSource.getRepository(JobEntity).count({ where: { organization_id: organizationId } });
  const invoices = await dataSource.getRepository(InvoiceEntity).count({ where: { organization_id: organizationId } });
  const payments = await dataSource.getRepository(InvoicePaymentEntity)
    .createQueryBuilder("payment")
    .innerJoin(InvoiceEntity, "invoice", "invoice.id = payment.invoice_id")
    .where("invoice.organization_id = :organizationId", { organizationId })
    .getCount();

  const sourceDocuments = await dataSource.getRepository(InvoiceEntity)
    .createQueryBuilder("invoice")
    .where("invoice.organization_id = :organizationId", { organizationId })
    .andWhere("invoice.branding_snapshot_json LIKE :source", { source: `%${WORKIZ_HISTORICAL_IMPORT_SOURCE}%` })
    .getCount();

  return { customers, jobs, invoices, payments, sourceDocuments };
}

async function seedPhoenixOperatingOrganization(dataSource: DataSource): Promise<void> {
  const existing = await dataSource.query(
    "SELECT id FROM organizations WHERE id = ? LIMIT 1",
    [PHOENIX_ORG_ID],
  ) as Array<{ id: string }>;
  if (existing.length > 0) return;
  await dataSource.query(
    "INSERT INTO organizations (id, name, slug, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(6), NOW(6))",
    [PHOENIX_ORG_ID, "Phoenix Fireplace Dry Run", PHOENIX_ORG_SLUG],
  );
}

async function runImportPass(input: {
  dataSource: DataSource;
  organizationId: string;
  eligible: WorkizHistoricalParseCandidate[];
  clusters: WorkizCustomerCluster[];
  importedAt: string;
}): Promise<ImportPassDelta> {
  const clusterById = new Map(input.clusters.map((cluster) => [cluster.cluster_id, cluster]));
  const customerKeyToId = new Map<string, string>();
  const existingIndex = await loadExistingWorkizImportIndex(input.dataSource, input.organizationId);
  let createdInvoices = 0;
  const before = await countTenantRows(input.dataSource, input.organizationId);

  for (const candidate of input.eligible) {
    const cluster = clusterById.get(candidate.identity.cluster_id ?? "");
    if (!cluster) continue;
    const customerId = await ensureCustomerForCluster({
      dataSource: input.dataSource,
      organizationId: input.organizationId,
      cluster,
      customerKeyToId,
    });

    const invoiceCode = candidate.invoice!.workiz_invoice_number;
    const existing = existingIndex.get(invoiceCode);
    const historical = toHistoricalInvoiceInput(candidate, input.importedAt);
    const result = await upsertHistoricalWorkizInvoice({
      dataSource: input.dataSource,
      organizationId: input.organizationId,
      customerId,
      historical,
      existing: existing ? { invoiceId: existing.invoiceId, jobId: existing.jobId } : undefined,
    });

    if (result.created) {
      createdInvoices += 1;
      existingIndex.set(invoiceCode, {
        invoiceId: result.invoiceId,
        jobId: result.jobId,
        invoiceCode,
      });
    }

    const invoiceRecord = await input.dataSource.getRepository(InvoiceEntity).findOneOrFail({
      where: { id: result.invoiceId, organization_id: input.organizationId },
    });
    if (candidate.payments.length > 0) {
      await reconcileAuthoritativePdfPayments({
        manager: input.dataSource.manager,
        organizationId: input.organizationId,
        invoice: invoiceRecord,
        invoiceCode,
        pdfPayments: candidate.payments.map((payment) => ({
          amountCents: payment.amount_cents,
          methodLabel: payment.method_label,
          statusLabel: payment.status_label,
          occurredAt: payment.occurred_at ? new Date(`${payment.occurred_at}T12:00:00.000Z`) : null,
        })),
        defaultOccurredAt: historical.invoiceDate,
      });
    }
  }

  const after = await countTenantRows(input.dataSource, input.organizationId);

  return {
    customersCreated: Math.max(0, after.customers - before.customers),
    jobsCreated: Math.max(0, after.jobs - before.jobs),
    invoicesCreated: Math.max(0, after.invoices - before.invoices),
    paymentsCreated: Math.max(0, after.payments - before.payments),
    sourceDocumentsCreated: Math.max(0, after.sourceDocuments - before.sourceDocuments),
  };
}

async function verifyPhase5Integrity(input: {
  dataSource: DataSource;
  organizationId: string;
  eligible: WorkizHistoricalParseCandidate[];
}): Promise<Phase5Verification> {
  const details: string[] = [];
  const invoices = await input.dataSource.getRepository(InvoiceEntity).find({
    where: { organization_id: input.organizationId },
  });
  const payments = await input.dataSource.getRepository(InvoicePaymentEntity)
    .createQueryBuilder("payment")
    .innerJoin(InvoiceEntity, "invoice", "invoice.id = payment.invoice_id")
    .where("invoice.organization_id = :organizationId", { organizationId: input.organizationId })
    .getMany();

  const crossOrgMismatches = await input.dataSource.getRepository(InvoiceEntity)
    .createQueryBuilder("invoice")
    .where("invoice.organization_id <> :organizationId", { organizationId: input.organizationId })
    .andWhere("invoice.branding_snapshot_json LIKE :source", { source: `%${WORKIZ_HISTORICAL_IMPORT_SOURCE}%` })
    .getCount();

  const invoiceCodes = new Map<string, number>();
  let sourceDocumentLinkageFailures = 0;
  let financialReconciliationFailuresAmongPass = 0;

  for (const invoice of invoices) {
    if (!invoice.branding_snapshot_json?.includes(WORKIZ_HISTORICAL_IMPORT_SOURCE)) continue;
    try {
      const snapshot = JSON.parse(invoice.branding_snapshot_json) as {
        workiz_invoice_code?: string;
        source_sha256?: string;
        financial_gate?: string;
      };
      if (!snapshot.workiz_invoice_code || !snapshot.source_sha256) {
        sourceDocumentLinkageFailures += 1;
      }
      const code = snapshot.workiz_invoice_code ?? "unknown";
      invoiceCodes.set(code, (invoiceCodes.get(code) ?? 0) + 1);
    } catch {
      sourceDocumentLinkageFailures += 1;
    }
  }

  const duplicateInvoices = [...invoiceCodes.values()].filter((count) => count > 1).length;

  const sourceShaCounts = new Map<string, number>();
  for (const invoice of invoices) {
    if (!invoice.branding_snapshot_json?.includes(WORKIZ_HISTORICAL_IMPORT_SOURCE)) continue;
    try {
      const snapshot = JSON.parse(invoice.branding_snapshot_json) as { source_sha256?: string };
      if (snapshot.source_sha256) {
        sourceShaCounts.set(snapshot.source_sha256, (sourceShaCounts.get(snapshot.source_sha256) ?? 0) + 1);
      }
    } catch {
      // counted via linkage failures
    }
  }
  const duplicateSourceDocuments = [...sourceShaCounts.values()].filter((count) => count > 1).length;

  const jobIdCounts = new Map<string, number>();
  for (const invoice of invoices) {
    if (!invoice.branding_snapshot_json?.includes(WORKIZ_HISTORICAL_IMPORT_SOURCE)) continue;
    jobIdCounts.set(invoice.job_id, (jobIdCounts.get(invoice.job_id) ?? 0) + 1);
  }
  const duplicateJobs = [...jobIdCounts.values()].filter((count) => count > 1).length;

  const customers = await input.dataSource.getRepository(CustomerEntity).find({
    where: { organization_id: input.organizationId },
  });
  const externalClientCounts = new Map<string, number>();
  for (const customer of customers) {
    if (!customer.external_client_number) continue;
    externalClientCounts.set(
      customer.external_client_number,
      (externalClientCounts.get(customer.external_client_number) ?? 0) + 1,
    );
  }
  const duplicateCustomers = [...externalClientCounts.values()].filter((count) => count > 1).length;

  const paymentReferences = new Map<string, number>();
  for (const payment of payments) {
    const key = payment.reference ?? payment.id;
    paymentReferences.set(key, (paymentReferences.get(key) ?? 0) + 1);
  }
  const duplicatePayments = [...paymentReferences.values()].filter((count) => count > 1).length;

  for (const candidate of input.eligible) {
    const financial = reconcileWorkizHistoricalFinancials({
      subtotalCents: candidate.invoice?.subtotal_cents ?? null,
      discountCents: candidate.invoice?.discount_cents ?? null,
      taxCents: candidate.invoice?.tax_cents ?? null,
      totalCents: candidate.invoice?.total_cents ?? null,
      balanceCents: candidate.invoice?.balance_due_cents ?? null,
      paymentTotalCents: candidate.payments.reduce((sum, payment) => sum + payment.amount_cents, 0),
      parseWarnings: candidate.review_flags.filter((flag) => flag.startsWith("PARSE_WARNING:")),
    });
    if (financial.status !== "PASS") {
      financialReconciliationFailuresAmongPass += 1;
      details.push(`financial_fail:${candidate.invoice?.workiz_invoice_number}`);
    }
    if (!isWorkizWarrantyReconstructionValid(candidate.warranty_reconstruction)) {
      details.push(`warranty_invalid:${candidate.invoice?.workiz_invoice_number}`);
    }
  }

  const warrantyCalculationFailures = input.eligible.filter(
    (candidate) => !isWorkizWarrantyReconstructionValid(candidate.warranty_reconstruction),
  ).length;

  const pass =
    crossOrgMismatches === 0
    && duplicateCustomers === 0
    && duplicateJobs === 0
    && duplicateInvoices === 0
    && duplicatePayments === 0
    && duplicateSourceDocuments === 0
    && financialReconciliationFailuresAmongPass === 0
    && sourceDocumentLinkageFailures === 0
    && warrantyCalculationFailures === 0;

  return {
    crossOrgMismatches,
    duplicateCustomers,
    duplicateJobs,
    duplicateInvoices,
    duplicatePayments,
    duplicateSourceDocuments,
    financialReconciliationFailuresAmongPass,
    sourceDocumentLinkageFailures,
    warrantyCalculationFailures,
    pass,
    details,
  };
}

function renderCloseoutMarkdown(report: {
  summary: Record<string, unknown>;
  dryRun: Record<string, unknown> | null;
  idempotency: IdempotencyResult | null;
  unresolvedBlockers: string[];
}): string {
  const summary = report.summary as {
    parserCoverage: { pdfFiles: number; parsedWithInvoice: number; canonicalInvoices: number };
    uniqueCustomers: number;
    repeatCustomers: number;
    manualIdentityReviews: number;
    financialPass: number;
    financialManualReview: number;
    eligibleForAutomaticDryRunImport: number;
    paymentsParsed: number;
    serviceClassifications: number;
    documentedPartsWarranties: number;
    ambiguousPartsWarranties: number;
    defaultPartsWarranties: number;
    documentedLaborWarranties: number;
    ambiguousLaborWarranties: number;
    defaultLaborWarranties: number;
    calgaryUniqueCustomers: number;
    phase0WarrantyComparison: Phase0WarrantyComparison | null;
  };

  return `# Workiz Pre-Production Closeout

Status: **PRE-PRODUCTION PHASES 1–4 COMPLETE — PRODUCTION IMPORT NOT AUTHORIZED**

Pipeline: \`${WORKIZ_HISTORICAL_PIPELINE_VERSION}\`

## Parser coverage

- Source PDFs scanned: ${summary.parserCoverage.pdfFiles}
- Parsed with invoice number: ${summary.parserCoverage.parsedWithInvoice}
- Canonical logical invoices (duplicate exports collapsed): ${summary.parserCoverage.canonicalInvoices}

## Identity

- Unique customer clusters: ${summary.uniqueCustomers}
- Confirmed repeat-customer clusters: ${summary.repeatCustomers}
- Manual identity review clusters: ${summary.manualIdentityReviews} (includes locked Natalie cluster)

## Financial gate

- PASS (canonical): ${summary.financialPass}
- MANUAL_REVIEW (canonical): ${summary.financialManualReview}
- Eligible for automatic dry-run import: ${summary.eligibleForAutomaticDryRunImport}

## Service + warranty

- Invoices with primary service classification: ${summary.serviceClassifications}
- Documented parts warranties: ${summary.documentedPartsWarranties}
- Ambiguous parts warranties (MANUAL_REVIEW): ${summary.ambiguousPartsWarranties}
- Default parts warranties (12-month policy): ${summary.defaultPartsWarranties}
- Documented labor warranties: ${summary.documentedLaborWarranties}
- Ambiguous labor warranties (MANUAL_REVIEW): ${summary.ambiguousLaborWarranties}
- Default labor warranties (6-month policy): ${summary.defaultLaborWarranties}

## Payments

- Parsed payment events (source PDFs): ${summary.paymentsParsed}

## Calgary

- Estimated unique Calgary customers after conservative dedupe: ${summary.calgaryUniqueCustomers}

## Dry run (Phase 5)

${report.dryRun ? `\`\`\`json\n${JSON.stringify(report.dryRun, null, 2)}\n\`\`\`` : "_Not executed — run `npm run workiz:preproduction:dry-run` against an ephemeral MySQL database._"}

## Second-run idempotency

${report.idempotency ? `\`\`\`json\n${JSON.stringify(report.idempotency, null, 2)}\n\`\`\`` : "_Pending successful Phase 5 dry run._"}

## Unresolved blockers

${report.unresolvedBlockers.length > 0
  ? report.unresolvedBlockers.map((blocker) => `- ${blocker}`).join("\n")
  : "- None recorded"}

## Production boundary

Production import on \`app.phoenixfireplace.ca\` remains **NOT AUTHORIZED** until separate owner approval after dry-run verification.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const importBatchId = `workiz-preprod-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const harnessRoot = resolve(process.cwd(), "_runtime_harness", "workiz-migration");
  const extractionsDir = join(harnessRoot, "preproduction", "candidates");
  mkdirSync(extractionsDir, { recursive: true });

  const candidates = await parseAllWorkizHistoricalPdfs({ importBatchId });
  const { clusters } = resolveWorkizHistoricalIdentity(candidates);

  for (const candidate of candidates) {
    const code = candidate.invoice?.workiz_invoice_number ?? candidate.source.filename.replace(/\.pdf$/i, "");
    writeFileSync(join(extractionsDir, `${code}.json`), `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  }

  const canonical = candidates.filter((candidate) => candidate.source.is_canonical_for_invoice);
  const eligible = candidates.filter(isEligibleForAutomaticImport);
  const financialPass = canonical.filter((candidate) => candidate.financial_gate === "PASS").length;
  const financialManualReview = canonical.filter((candidate) => candidate.financial_gate === "MANUAL_REVIEW").length;
  const manualIdentity = clusters.filter((cluster) => cluster.classification === "MANUAL_REVIEW").length;
  const repeatCustomers = clusters.filter((cluster) => cluster.classification === "CONFIRMED_REPEAT_CUSTOMER").length;
  const documentedParts = candidates.filter((c) => c.warranty_reconstruction?.parts.provenance === "DOCUMENTED").length;
  const ambiguousParts = candidates.filter((c) => c.warranty_reconstruction?.parts.provenance === "AMBIGUOUS_WARRANTY").length;
  const defaultParts = candidates.filter((c) => c.warranty_reconstruction?.parts.provenance === "PHOENIX_DEFAULT_POLICY").length;
  const documentedLabor = candidates.filter((c) => c.warranty_reconstruction?.labor.provenance === "DOCUMENTED").length;
  const ambiguousLabor = candidates.filter((c) => c.warranty_reconstruction?.labor.provenance === "AMBIGUOUS_WARRANTY").length;
  const defaultLabor = candidates.filter((c) => c.warranty_reconstruction?.labor.provenance === "PHOENIX_DEFAULT_POLICY").length;
  const classifiedServices = candidates.filter((c) => c.service_intelligence.primary_service != null).length;
  const phase0WarrantyComparison = comparePhase0WarrantyEvidence(candidates);

  const summary = {
    parserVersion: candidates[0]?.source.parser_version ?? null,
    parserCoverage: {
      pdfFiles: candidates.length,
      parsedWithInvoice: candidates.filter((c) => c.invoice).length,
      canonicalInvoices: canonical.length,
    },
    uniqueCustomers: clusters.length,
    repeatCustomers,
    manualIdentityReviews: manualIdentity,
    financialPass,
    financialManualReview,
    eligibleForAutomaticDryRunImport: eligible.length,
    invoicesCanonical: canonical.filter((c) => c.invoice).length,
    paymentsParsed: candidates.reduce((sum, c) => sum + c.payments.length, 0),
    serviceClassifications: classifiedServices,
    documentedPartsWarranties: documentedParts,
    ambiguousPartsWarranties: ambiguousParts,
    defaultPartsWarranties: defaultParts,
    documentedLaborWarranties: documentedLabor,
    ambiguousLaborWarranties: ambiguousLabor,
    defaultLaborWarranties: defaultLabor,
    calgaryUniqueCustomers: estimateCalgaryCustomerClusters(clusters),
    phase0WarrantyComparison,
  };

  const pipelineReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    pipelineVersion: WORKIZ_HISTORICAL_PIPELINE_VERSION,
    importBatchId,
    summary,
    clusters,
    candidates: candidates.map((candidate) => ({
      filename: candidate.source.filename,
      invoiceNumber: candidate.invoice?.workiz_invoice_number ?? null,
      canonical: candidate.source.is_canonical_for_invoice,
      financial_gate: candidate.financial_gate,
      identity: candidate.identity,
      review_flags: candidate.review_flags,
    })),
    dryRun: null as Record<string, unknown> | null,
    idempotency: null as IdempotencyResult | null,
    unresolvedBlockers: [] as string[],
  };

  const closeoutPath = resolve(process.cwd(), "..", "docs", "migration", "WORKIZ_PREPRODUCTION_CLOSEOUT.md");

  const writeCloseout = () => {
    writeFileSync(join(harnessRoot, "preproduction-pipeline.json"), `${JSON.stringify(pipelineReport, null, 2)}\n`, "utf8");
    writeFileSync(closeoutPath, renderCloseoutMarkdown({
      summary: pipelineReport.summary,
      dryRun: pipelineReport.dryRun,
      idempotency: pipelineReport.idempotency,
      unresolvedBlockers: pipelineReport.unresolvedBlockers,
    }), "utf8");
  };

  writeCloseout();

  if (!args.executeDryRun) {
    console.log(JSON.stringify({ phase: "1-4-complete", summary }, null, 2));
    console.log("Dry run not executed. Re-run with --execute-dry-run for Phase 5.");
    return;
  }

  const baseOptions = buildDataSourceOptions() as MysqlConnectionOptions;
  const smokeDbName = process.env.WORKIZ_PREPRODUCTION_DRY_RUN_DB
    ?? `wizfield_workiz_preprod_${Date.now()}`;

  if (!isEphemeralWorkizMutationDatabase(smokeDbName)) {
    throw new Error(`Refusing dry run: database name '${smokeDbName}' is not ephemeral.`);
  }

  let admin: mysql.Connection;
  try {
    admin = await mysql.createConnection({
      host: baseOptions.host,
      port: baseOptions.port,
      user: process.env.WORKIZ_PREPRODUCTION_MYSQL_ADMIN_USER ?? "root",
      password: process.env.WORKIZ_PREPRODUCTION_MYSQL_ADMIN_PASSWORD ?? "",
    });
  } catch (error) {
    pipelineReport.unresolvedBlockers.push(
      `Phase 5 dry run blocked: cannot connect to configured MySQL (${error instanceof Error ? error.message : String(error)}).`,
    );
    writeCloseout();
    console.log(JSON.stringify({ summary, dryRun: null, unresolvedBlockers: pipelineReport.unresolvedBlockers }, null, 2));
    return;
  }

  let dataSource: DataSource | null = null;
  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${smokeDbName}\``);
    const dbUser = baseOptions.username ?? "wizfield";
    await admin.query(`GRANT ALL PRIVILEGES ON \`${smokeDbName}\`.* TO '${dbUser}'@'localhost'`);
    await admin.query(`GRANT ALL PRIVILEGES ON \`${smokeDbName}\`.* TO '${dbUser}'@'127.0.0.1'`);
    await admin.query("FLUSH PRIVILEGES");
    dataSource = new DataSource({
      ...baseOptions,
      database: smokeDbName,
      migrations: [
        ...((baseOptions.migrations as string[] | undefined) ?? []),
        join(__dirname, "migrations", "deferred", "1790000000000-multi-branch-phase1-foundation.ts"),
      ],
      migrationsRun: true,
    });
    await dataSource.initialize();
    await verifyDatabaseSchema(dataSource);
    await seedPhoenixOperatingOrganization(dataSource);

    const org = await resolvePhoenixOperatingOrganization(dataSource);
    assertWorkizProductionMutationAllowed(buildWorkizMutationGuardContext({
      dataSourceOptions: { ...baseOptions, database: smokeDbName },
      organizationId: org.id,
      organizationSlug: org.slug,
      allowProductionMutation: args.allowProductionMutation,
      commandLabel: "workiz-historical-preproduction-orchestrator",
    }));

    const importedAt = new Date().toISOString();
    const firstPass = await runImportPass({
      dataSource,
      organizationId: org.id,
      eligible,
      clusters,
      importedAt,
    });
    const countsAfterFirst = await countTenantRows(dataSource, org.id);
    const verificationAfterFirst = await verifyPhase5Integrity({
      dataSource,
      organizationId: org.id,
      eligible,
    });

    const secondPass = await runImportPass({
      dataSource,
      organizationId: org.id,
      eligible,
      clusters,
      importedAt,
    });
    const countsAfterSecond = await countTenantRows(dataSource, org.id);

    const idempotency: IdempotencyResult = {
      secondRunCustomersCreated: secondPass.customersCreated,
      secondRunJobsCreated: secondPass.jobsCreated,
      secondRunInvoicesCreated: secondPass.invoicesCreated,
      secondRunPaymentsCreated: secondPass.paymentsCreated,
      secondRunSourceDocumentsCreated: secondPass.sourceDocumentsCreated,
      pass:
        secondPass.customersCreated === 0
        && secondPass.jobsCreated === 0
        && secondPass.invoicesCreated === 0
        && secondPass.paymentsCreated === 0
        && secondPass.sourceDocumentsCreated === 0,
    };

    const phase5Pass = idempotency.pass && verificationAfterFirst.pass && firstPass.invoicesCreated === eligible.length;

    pipelineReport.dryRun = {
      database: smokeDbName,
      organizationId: org.id,
      eligibleInvoices: eligible.length,
      firstPass,
      countsAfterFirst,
      verificationAfterFirst,
      countsAfterSecond,
      moneyTotals: {
        invoiceValueCents: eligible.reduce((sum, c) => sum + (c.invoice?.total_cents ?? 0), 0),
        paymentsCents: eligible.reduce((sum, c) => sum + c.payments.reduce((p, pay) => p + pay.amount_cents, 0), 0),
      },
      phase5Status: phase5Pass ? "PASS" : "FAIL",
    };
    pipelineReport.idempotency = idempotency;

    if (!idempotency.pass) {
      pipelineReport.unresolvedBlockers.push("Second-run idempotency did not produce zero new rows.");
    }
    if (!verificationAfterFirst.pass) {
      pipelineReport.unresolvedBlockers.push("Phase 5 integrity verification failed after first pass.");
    }
    if (firstPass.invoicesCreated !== eligible.length) {
      pipelineReport.unresolvedBlockers.push(
        `First pass imported ${firstPass.invoicesCreated}/${eligible.length} eligible invoices.`,
      );
    }

    const phase5CloseoutPath = resolve(process.cwd(), "..", "docs", "migration", "WORKIZ_PHASE5_DRY_RUN_CLOSEOUT.md");
    const phase55CloseoutPath = resolve(process.cwd(), "..", "docs", "migration", "WORKIZ_PHASE5_5_WARRANTY_CLOSEOUT.md");
    const phase55Pass = phase5Pass;
    writeFileSync(phase55CloseoutPath, `# Workiz Phase 5.5 — Warranty Source Completeness Closeout

Status: **PHASE 5.5 — ${phase55Pass ? "PASS" : "FAIL"}**

Production import remains **NOT AUTHORIZED**.

## Warranty classification (full corpus — ${summary.parserCoverage?.pdfFiles ?? 413} PDFs)

- Documented parts warranties: ${summary.documentedPartsWarranties}
- Ambiguous parts warranties (MANUAL_REVIEW): ${summary.ambiguousPartsWarranties}
- Default parts warranties (12-month policy): ${summary.defaultPartsWarranties}
- Documented labor warranties: ${summary.documentedLaborWarranties}
- Ambiguous labor warranties (MANUAL_REVIEW): ${summary.ambiguousLaborWarranties}
- Default labor warranties (6-month policy): ${summary.defaultLaborWarranties}

## Phase 0 audit comparison

${summary.phase0WarrantyComparison
  ? JSON.stringify(summary.phase0WarrantyComparison, null, 2)
  : "Phase 0 inventory JSON not found — comparison skipped."}

Reductions from Phase 0 loose signals must be explainable by classification (DOCUMENTED / AMBIGUOUS / DEFAULT), not excluded source locations.

## Phase 5 dry run (re-run)

${JSON.stringify(pipelineReport.dryRun, null, 2)}

## Idempotency (second pass)

${JSON.stringify(idempotency, null, 2)}

## Verification

${JSON.stringify(verificationAfterFirst, null, 2)}
`, "utf8");

    writeFileSync(phase5CloseoutPath, `# Workiz Phase 5 Dry Run Closeout

Status: **PHASE 5 — ${phase5Pass ? "PASS" : "FAIL"}**

Production import remains **NOT AUTHORIZED**.

## First pass imported counts

- Customers: ${countsAfterFirst.customers}
- Jobs: ${countsAfterFirst.jobs}
- Invoices: ${countsAfterFirst.invoices}
- Payments: ${countsAfterFirst.payments}
- Source documents (Workiz provenance invoices): ${countsAfterFirst.sourceDocuments}
- First-pass create delta: ${JSON.stringify(firstPass)}

## Second pass new rows

- Customers: ${secondPass.customersCreated}
- Jobs: ${secondPass.jobsCreated}
- Invoices: ${secondPass.invoicesCreated}
- Payments: ${secondPass.paymentsCreated}
- Source documents: ${secondPass.sourceDocumentsCreated}

## Verification

${JSON.stringify(verificationAfterFirst, null, 2)}

## Idempotency

${JSON.stringify(idempotency, null, 2)}

## Unresolved anomalies

${pipelineReport.unresolvedBlockers.length > 0
  ? pipelineReport.unresolvedBlockers.map((item) => `- ${item}`).join("\n")
  : "- None"}
`, "utf8");

    writeCloseout();

    console.log(JSON.stringify({ summary, dryRun: pipelineReport.dryRun, idempotency }, null, 2));
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    try {
      await admin.query(`DROP DATABASE IF EXISTS \`${smokeDbName}\``);
    } catch {
      // best effort cleanup
    }
    await admin.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
