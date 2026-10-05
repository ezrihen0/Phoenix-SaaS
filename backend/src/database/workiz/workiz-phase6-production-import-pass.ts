import type { DataSource, EntityManager } from "typeorm";

import { ensurePortalIdentityForCustomerDataSource } from "../../customer-portal/portal-identity-backfill";
import { CustomerEntity } from "../entities/customer.entity";
import { InvoiceEntity } from "../entities/invoice.entity";
import { InvoicePaymentEntity } from "../entities/invoice-payment.entity";
import { reconcileAuthoritativePdfPayments } from "./workiz-import-payment-reconciliation";
import { reconcileWorkizHistoricalFinancials } from "./workiz-historical-financial.v1";
import {
  WORKIZ_PROVENANCE_TAGS,
  type WorkizCustomerCluster,
  type WorkizHistoricalParseCandidate,
} from "./workiz-historical-types.v1";
import {
  buildWorkizCustomerExternalKey,
  matchProductionPhoenixCustomer,
  mergeHistoricalProvenanceTags,
} from "./workiz-historical-production-customer-match";
import { persistHistoricalServiceIntelligence } from "./workiz-historical-persist-intelligence.v1";
import {
  loadExistingWorkizImportIndex,
  upsertHistoricalWorkizInvoice,
  WORKIZ_HISTORICAL_IMPORT_SOURCE,
  type WorkizHistoricalInvoiceInput,
} from "./workiz-invoice-upsert";

export type ImportPassMetrics = {
  customersCreated: number;
  customersMatched: number;
  jobsCreated: number;
  invoicesCreated: number;
  invoiceLinesCreated: number;
  paymentsCreated: number;
  sourceDocumentsLinked: number;
  serviceIntelligenceRecords: number;
  warrantyRecords: number;
  skippedRecords: number;
  failedRecords: number;
  skipReasons: string[];
  failureReasons: string[];
};

async function ensureProductionCustomer(input: {
  dataSource: DataSource;
  manager: EntityManager;
  organizationId: string;
  cluster: WorkizCustomerCluster;
  cache: Map<string, string>;
}): Promise<
  | { ok: true; customerId: string; created: boolean; matched: boolean; strategy?: string }
  | { ok: false; reason: string }
> {
  const snapshot = input.cluster.customer_snapshot;
  if (!snapshot) return { ok: false, reason: `missing_customer_snapshot:${input.cluster.cluster_id}` };

  const cacheKey = buildWorkizCustomerExternalKey(snapshot, input.cluster.cluster_id);
  const cached = input.cache.get(cacheKey);
  if (cached) return { ok: true, customerId: cached, created: false, matched: true, strategy: "cache" };

  const match = await matchProductionPhoenixCustomer({
    dataSource: input.dataSource,
    manager: input.manager,
    organizationId: input.organizationId,
    snapshot,
    clusterId: input.cluster.cluster_id,
  });

  if (match.kind === "ambiguous") {
    return { ok: false, reason: `ambiguous_customer:${match.reason}` };
  }

  const repo = input.manager.getRepository(CustomerEntity);
  const isCalgary = snapshot.normalized_city === "calgary";

  if (match.kind === "matched") {
    const customer = await repo.findOneOrFail({
      where: { id: match.customerId, organization_id: input.organizationId },
    });
    const mergedTags = mergeHistoricalProvenanceTags(customer.tags, isCalgary);
    const updates: Partial<CustomerEntity> = {};
    if (JSON.stringify([...(mergedTags)].sort()) !== JSON.stringify([...(customer.tags ?? [])].sort())) {
      updates.tags = mergedTags;
    }
    if (!customer.external_client_number) {
      updates.external_client_number = cacheKey;
    } else if (
      match.strategy === "owner_pinned"
      && customer.external_client_number !== cacheKey
      && customer.external_client_number.startsWith("workiz:")
    ) {
      // Owner-approved existing row already keyed during interrupted import — keep stable key.
    } else if (
      match.strategy === "owner_pinned"
      && !customer.external_client_number.startsWith("workiz:")
      && customer.external_client_number !== cacheKey
    ) {
      updates.external_client_number = cacheKey;
    }
    if (Object.keys(updates).length > 0) {
      await repo.update({ id: customer.id }, updates);
    }
    input.cache.set(cacheKey, customer.id);
    return {
      ok: true,
      customerId: customer.id,
      created: false,
      matched: true,
      strategy: match.strategy,
    };
  }

  const created = await repo.save(repo.create({
    organization_id: input.organizationId,
    external_client_number: match.externalKey,
    full_name: snapshot.name,
    email: snapshot.normalized_email,
    company_name: snapshot.company,
    phone: snapshot.phone || "(000) 000-0000",
    service_address_line_1: snapshot.address_line_1,
    service_address_line_2: snapshot.address_line_2,
    service_city: snapshot.city,
    service_state_or_region: snapshot.province,
    service_postal_code: snapshot.postal_code,
    tags: mergeHistoricalProvenanceTags([...WORKIZ_PROVENANCE_TAGS], isCalgary),
    notes: `Workiz historical import cluster ${input.cluster.cluster_id}`,
  }));
  input.cache.set(cacheKey, created.id);
  return { ok: true, customerId: created.id, created: true, matched: false };
}

export async function runProductionImportPass(input: {
  dataSource: DataSource;
  organizationId: string;
  eligible: WorkizHistoricalParseCandidate[];
  clusters: WorkizCustomerCluster[];
  batchId: string;
  importedAt: string;
  buildHistoricalInvoiceInput: (
    candidate: WorkizHistoricalParseCandidate,
    importedAt: string,
    batchId: string,
  ) => WorkizHistoricalInvoiceInput;
}): Promise<ImportPassMetrics> {
  const clusterById = new Map(input.clusters.map((cluster) => [cluster.cluster_id, cluster]));
  const customerCache = new Map<string, string>();
  const createdCustomerIds = new Set<string>();
  const matchedCustomerIds = new Set<string>();
  const portalIdentityCustomerIds = new Set<string>();
  const existingIndex = await loadExistingWorkizImportIndex(input.dataSource, input.organizationId);

  const metrics: ImportPassMetrics = {
    customersCreated: 0,
    customersMatched: 0,
    jobsCreated: 0,
    invoicesCreated: 0,
    invoiceLinesCreated: 0,
    paymentsCreated: 0,
    sourceDocumentsLinked: 0,
    serviceIntelligenceRecords: 0,
    warrantyRecords: 0,
    skippedRecords: 0,
    failedRecords: 0,
    skipReasons: [],
    failureReasons: [],
  };

  const paymentsBefore = await input.dataSource.getRepository(InvoicePaymentEntity)
    .createQueryBuilder("payment")
    .innerJoin(InvoiceEntity, "invoice", "invoice.id = payment.invoice_id")
    .where("invoice.organization_id = :organizationId", { organizationId: input.organizationId })
    .getCount();

  for (const candidate of input.eligible) {
    const invoiceCode = candidate.invoice!.workiz_invoice_number;
    try {
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
        metrics.skippedRecords += 1;
        metrics.skipReasons.push(`${invoiceCode}:financial_gate_fail`);
        continue;
      }

      const cluster = clusterById.get(candidate.identity.cluster_id ?? "");
      if (!cluster) {
        metrics.skippedRecords += 1;
        metrics.skipReasons.push(`${invoiceCode}:missing_identity_cluster`);
        continue;
      }

      const existing = existingIndex.get(invoiceCode);
      const historical = input.buildHistoricalInvoiceInput(candidate, input.importedAt, input.batchId);

      const packageResult = await input.dataSource.transaction(async (manager) => {
        const customerResult = await ensureProductionCustomer({
          dataSource: input.dataSource,
          manager,
          organizationId: input.organizationId,
          cluster,
          cache: customerCache,
        });
        if (!customerResult.ok) {
          return { ok: false as const, reason: customerResult.reason };
        }

        const upsert = await upsertHistoricalWorkizInvoice({
          dataSource: input.dataSource,
          manager,
          organizationId: input.organizationId,
          customerId: customerResult.customerId,
          historical,
          existing: existing ? { invoiceId: existing.invoiceId, jobId: existing.jobId } : undefined,
        });

        const invoiceRecord = await manager.getRepository(InvoiceEntity).findOneOrFail({
          where: { id: upsert.invoiceId, organization_id: input.organizationId },
        });

        if (candidate.payments.length > 0) {
          await reconcileAuthoritativePdfPayments({
            manager,
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

        const intelligence = await persistHistoricalServiceIntelligence({
          manager,
          organizationId: input.organizationId,
          invoiceId: upsert.invoiceId,
          candidate,
          classifiedAt: new Date(input.importedAt),
        });

        return {
          ok: true as const,
          customerResult,
          upsert,
          intelligence,
        };
      });

      if (!packageResult.ok) {
        metrics.skippedRecords += 1;
        metrics.skipReasons.push(`${invoiceCode}:${packageResult.reason}`);
        continue;
      }

      const { customerResult, upsert, intelligence } = packageResult;
      portalIdentityCustomerIds.add(customerResult.customerId);
      if (customerResult.created) createdCustomerIds.add(customerResult.customerId);
      if (customerResult.matched && !customerResult.created) matchedCustomerIds.add(customerResult.customerId);

      if (upsert.created) {
        metrics.invoicesCreated += 1;
        metrics.jobsCreated += 1;
        metrics.sourceDocumentsLinked += 1;
        existingIndex.set(invoiceCode, {
          invoiceId: upsert.invoiceId,
          jobId: upsert.jobId,
          invoiceCode,
        });
      }
      metrics.invoiceLinesCreated += upsert.lineItemsCreated;
      metrics.serviceIntelligenceRecords += 1;
      metrics.warrantyRecords += intelligence.warrantyRows;
    } catch (error) {
      metrics.failedRecords += 1;
      metrics.failureReasons.push(
        `${invoiceCode}:${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  for (const customerId of portalIdentityCustomerIds) {
    await ensurePortalIdentityForCustomerDataSource(input.dataSource, customerId);
  }

  const paymentsAfter = await input.dataSource.getRepository(InvoicePaymentEntity)
    .createQueryBuilder("payment")
    .innerJoin(InvoiceEntity, "invoice", "invoice.id = payment.invoice_id")
    .where("invoice.organization_id = :organizationId", { organizationId: input.organizationId })
    .getCount();
  metrics.paymentsCreated = Math.max(0, paymentsAfter - paymentsBefore);
  metrics.customersCreated = createdCustomerIds.size;
  metrics.customersMatched = matchedCustomerIds.size;

  return metrics;
}

export { WORKIZ_HISTORICAL_IMPORT_SOURCE };
