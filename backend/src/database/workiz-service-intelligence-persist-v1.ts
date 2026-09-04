import "dotenv/config";
import "reflect-metadata";

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { DataSource, In, Not } from "typeorm";

import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";
import { InvoiceServiceIntelligenceEntity } from "./entities/invoice-service-intelligence.entity";
import { InvoiceServiceIntelligenceComponentEntity } from "./entities/invoice-service-intelligence-component.entity";
import { InvoiceServiceIntelligenceWarrantyEntity } from "./entities/invoice-service-intelligence-warranty.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import {
  TAXONOMY_VERSION,
  loadClassificationV1Records,
  type ClassificationV1,
} from "./workiz-service-intelligence-classify-v1";
import { PHOENIX_ORG_ID } from "./workiz-service-intelligence-discovery";

const PHOENIX_ORG_SLUG = "phoenix-fireplace";
const KNOWN_CODES = [
  "WET6R6", "70QLL2", "03LDZE", "6K5NIA", "EKWLIM", "74BY7X",
  "62QJZP", "CALURM", "TWKN8Z", "8TGGHY", "9TZM8J", "QRBE2K",
];

type Snapshot = {
  invoice_count: number;
  invoice_total_cents: string;
  invoice_subtotal_cents: string;
  customer_count: number;
  document_count: number;
};

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function laborWarrantyConfidence(status: string): string {
  if (status === "UNPARSEABLE") return "LOW";
  if (status === "DOCUMENTED_ACTIVE" || status === "DOCUMENTED_EXPIRED") return "HIGH";
  return "HIGH";
}

async function snapshotImmutable(ds: DataSource, orgId: string): Promise<Snapshot> {
  const invoices = await ds.getRepository(InvoiceEntity)
    .createQueryBuilder("invoice")
    .select("COUNT(*)", "invoice_count")
    .addSelect("COALESCE(SUM(invoice.total_cents), 0)", "invoice_total_cents")
    .addSelect("COALESCE(SUM(invoice.subtotal_cents), 0)", "invoice_subtotal_cents")
    .where("invoice.organization_id = :orgId", { orgId })
    .getRawOne<{ invoice_count: string; invoice_total_cents: string; invoice_subtotal_cents: string }>();
  const customer_count = await ds.getRepository(CustomerEntity).count({ where: { organization_id: orgId } });
  const document_count = await ds.getRepository(InvoiceDocumentEntity).count({ where: { organization_id: orgId } });
  return {
    invoice_count: Number(invoices?.invoice_count ?? 0),
    invoice_total_cents: String(invoices?.invoice_total_cents ?? "0"),
    invoice_subtotal_cents: String(invoices?.invoice_subtotal_cents ?? "0"),
    customer_count,
    document_count,
  };
}

function sameSnapshot(before: Snapshot, after: Snapshot): boolean {
  return before.invoice_count === after.invoice_count
    && before.invoice_total_cents === after.invoice_total_cents
    && before.invoice_subtotal_cents === after.invoice_subtotal_cents
    && before.customer_count === after.customer_count
    && before.document_count === after.document_count;
}

async function persistOne(
  ds: DataSource,
  orgId: string,
  row: ClassificationV1,
  classifiedAt: Date,
): Promise<{ action: "inserted" | "rebuilt"; intelligence_id: string }> {
  if (!row.invoice_id) {
    throw new Error(`Refusing to persist ${row.invoice_code}: missing invoice_id`);
  }

  const invoice = await ds.getRepository(InvoiceEntity).findOne({
    where: { id: row.invoice_id, organization_id: orgId },
  });
  if (!invoice) {
    throw new Error(`Refusing cross-tenant or missing invoice ${row.invoice_code} ${row.invoice_id}`);
  }

  return ds.transaction(async (manager) => {
    const existing = await manager.findOne(InvoiceServiceIntelligenceEntity, {
      where: {
        organization_id: orgId,
        invoice_id: row.invoice_id!,
        taxonomy_version: TAXONOMY_VERSION,
      },
    });

    const parent = existing ?? manager.create(InvoiceServiceIntelligenceEntity, {
      organization_id: orgId,
      invoice_id: row.invoice_id!,
      taxonomy_version: TAXONOMY_VERSION,
    });
    parent.workiz_invoice_code = row.invoice_code;
    parent.system_json = row.system;
    parent.system_bucket = row.system_bucket;
    parent.primary_service_json = row.primary_service;
    parent.service_detail_json = row.service_detail;
    parent.labor_charged = row.labor.labor_charged;
    parent.labor_raw_wording_json = row.labor.raw_wording;
    parent.classification_confidence = row.classification_confidence;
    parent.review_reasons_json = row.review_reasons;
    parent.findings_json = row.findings;
    parent.source_kind = "classification_v1";
    parent.classified_at = classifiedAt;
    const saved = await manager.save(parent);

    await manager.delete(InvoiceServiceIntelligenceComponentEntity, {
      organization_id: orgId,
      service_intelligence_id: saved.id,
    });
    await manager.delete(InvoiceServiceIntelligenceWarrantyEntity, {
      organization_id: orgId,
      service_intelligence_id: saved.id,
    });

    if (row.components.length > 0) {
      await manager.save(row.components.map((component) => manager.create(InvoiceServiceIntelligenceComponentEntity, {
        organization_id: orgId,
        service_intelligence_id: saved.id,
        invoice_id: row.invoice_id!,
        canonical_component: component.component,
        raw_name: component.raw_name.slice(0, 255),
        manufacturer_name: null,
        model_or_part_number: component.model_or_part_number,
        work_action: component.work_action,
        confidence: component.confidence,
        warranty_status: component.warranty_status,
        warranty_duration_months: component.warranty_duration_months,
        warranty_source_text: component.warranty_source_text,
        warranty_start_date: dateOnly(component.warranty_start_date),
        warranty_expiry_date: dateOnly(component.warranty_expiry_date),
        extended_warranty_months: component.extended_warranty?.duration_months ?? null,
        extended_warranty_source_text: component.extended_warranty?.source_text ?? null,
        extended_warranty_relationship: component.extended_warranty?.relationship ?? null,
        extended_effective_expiry: dateOnly(component.extended_warranty?.effective_expiry_date),
        evidence_json: component.evidence,
        inventory_item_id: null,
      })));
    }

    const warranties = [
      manager.create(InvoiceServiceIntelligenceWarrantyEntity, {
        organization_id: orgId,
        service_intelligence_id: saved.id,
        invoice_id: row.invoice_id!,
        scope: "LABOR",
        canonical_component: null,
        warranty_status: row.labor_warranty.status,
        duration_months: row.labor_warranty.duration_months,
        start_date: dateOnly(row.labor_warranty.start_date),
        expiry_date: dateOnly(row.labor_warranty.expiry_date),
        source_text: row.labor_warranty.source_text,
        confidence: laborWarrantyConfidence(row.labor_warranty.status),
        evidence_json: row.labor_warranty.source_text ? [row.labor_warranty.source_text] : row.labor.raw_wording,
      }),
      ...row.parts_warranty
        .filter((item) => item.scope === "UNSCOPED_INVOICE")
        .map((item) => manager.create(InvoiceServiceIntelligenceWarrantyEntity, {
          organization_id: orgId,
          service_intelligence_id: saved.id,
          invoice_id: row.invoice_id!,
          scope: "UNSCOPED_PARTS",
          canonical_component: item.component,
          warranty_status: item.status,
          duration_months: item.duration_months,
          start_date: dateOnly(item.start_date),
          expiry_date: dateOnly(item.expiry_date),
          source_text: item.source_text,
          confidence: item.confidence,
          evidence_json: [item.source_text],
        })),
      ...row.unbound_extended.map((item) => manager.create(InvoiceServiceIntelligenceWarrantyEntity, {
        organization_id: orgId,
        service_intelligence_id: saved.id,
        invoice_id: row.invoice_id!,
        scope: "EXTENDED",
        canonical_component: item.target_component,
        warranty_status: item.duration_months != null ? "DOCUMENTED_ACTIVE" : "UNPARSEABLE",
        duration_months: item.duration_months,
        start_date: null,
        expiry_date: dateOnly(item.effective_expiry_date),
        source_text: item.source_text,
        confidence: "MEDIUM",
        evidence_json: [item.source_text, `relationship:${item.relationship}`],
      })),
    ];
    await manager.save(warranties);

    return { action: existing ? "rebuilt" as const : "inserted" as const, intelligence_id: saved.id };
  });
}

function summarize(records: ClassificationV1[]) {
  const countIf = (test: (row: ClassificationV1) => boolean) => records.filter(test).length;
  const componentCount = (label: string) => countIf((row) => row.components.some((item) => item.component === label));
  return {
    TOTAL: records.length,
    HIGH: countIf((row) => row.classification_confidence === "HIGH"),
    MEDIUM: countIf((row) => row.classification_confidence === "MEDIUM"),
    LOW: countIf((row) => row.classification_confidence === "LOW"),
    SYSTEM: {
      GAS: countIf((row) => row.system.includes("GAS") && row.system_bucket !== "MIXED"),
      WOOD: countIf((row) => row.system.includes("WOOD") && row.system_bucket !== "MIXED"),
      CHIMNEY: countIf((row) => row.system.includes("CHIMNEY") && row.system_bucket !== "MIXED"),
      MIXED: countIf((row) => row.system_bucket === "MIXED"),
      UNKNOWN: countIf((row) => row.system_bucket === "UNKNOWN"),
    },
    PRIMARY_SERVICE: {
      REPAIR: countIf((row) => row.primary_service.includes("REPAIR")),
      INSPECTION: countIf((row) => row.primary_service.includes("INSPECTION")),
      CLEANING: countIf((row) => row.primary_service.includes("CLEANING")),
      MAINTENANCE: countIf((row) => row.primary_service.includes("MAINTENANCE")),
      TRUE_INSTALLATION: countIf((row) => row.primary_service.includes("TRUE_INSTALLATION")),
      OTHER: countIf((row) => row.primary_service.includes("OTHER")),
      UNKNOWN: countIf((row) => row.primary_service.includes("UNKNOWN")),
    },
    COMPONENTS: {
      PILOT_ASSEMBLY: componentCount("PILOT_ASSEMBLY"),
      GAS_VALVE: componentCount("GAS_VALVE"),
      CONTROL_MODULE: componentCount("CONTROL_MODULE"),
      SWITCH: componentCount("SWITCH"),
      REMOTE_RECEIVER: countIf((row) => row.components.some((item) => item.component === "REMOTE" || item.component === "RECEIVER")),
      BLOWER_FAN: componentCount("BLOWER_FAN"),
      THERMOCOUPLE: componentCount("THERMOCOUPLE"),
      THERMOPILE: componentCount("THERMOPILE"),
    },
    LABOR_CHARGED: countIf((row) => row.labor.labor_charged),
    REVIEW_QUEUE: countIf((row) => row.review_reasons.length > 0),
  };
}

async function verifyPersisted(ds: DataSource, orgId: string, expected: ClassificationV1[]) {
  const intelligenceRepo = ds.getRepository(InvoiceServiceIntelligenceEntity);
  const componentRepo = ds.getRepository(InvoiceServiceIntelligenceComponentEntity);
  const warrantyRepo = ds.getRepository(InvoiceServiceIntelligenceWarrantyEntity);

  const persisted = await intelligenceRepo.find({
    where: { organization_id: orgId, taxonomy_version: TAXONOMY_VERSION },
  });
  const persistedIds = persisted.map((row) => row.id);
  const components = persistedIds.length > 0
    ? await componentRepo.find({ where: { organization_id: orgId, service_intelligence_id: In(persistedIds) } })
    : [];
  const warranties = persistedIds.length > 0
    ? await warrantyRepo.find({ where: { organization_id: orgId, service_intelligence_id: In(persistedIds) } })
    : [];

  const foreignIntelligence = await intelligenceRepo.count({
    where: { organization_id: Not(orgId) },
  });
  const foreignComponents = await componentRepo.count({
    where: { organization_id: Not(orgId) },
  });
  const foreignWarranties = await warrantyRepo.count({
    where: { organization_id: Not(orgId) },
  });
  const mismatchedInvoiceOrg = await ds.query(`
    SELECT COUNT(*) AS c
    FROM invoice_service_intelligence isi
    INNER JOIN invoices inv ON inv.id = isi.invoice_id
    WHERE isi.organization_id = ?
      AND (inv.organization_id IS NULL OR inv.organization_id <> isi.organization_id)
  `, [orgId]) as Array<{ c: number | string }>;
  const inventoryLinks = await componentRepo
    .createQueryBuilder("c")
    .where("c.organization_id = :orgId", { orgId })
    .andWhere("c.inventory_item_id IS NOT NULL")
    .getCount();

  const byCode = new Map(persisted.map((row) => [row.workiz_invoice_code, row]));
  const expectedByCode = new Map(expected.map((row) => [row.invoice_code, row]));
  const countMismatches: string[] = [];
  if (persisted.length !== expected.filter((row) => row.invoice_id).length) {
    countMismatches.push(`parent ${persisted.length} != expected ${expected.filter((row) => row.invoice_id).length}`);
  }

  let confidenceMatch = 0;
  let systemMatch = 0;
  for (const row of expected) {
    const saved = byCode.get(row.invoice_code);
    if (!saved) {
      countMismatches.push(`missing ${row.invoice_code}`);
      continue;
    }
    if (saved.classification_confidence === row.classification_confidence) confidenceMatch += 1;
    if (saved.system_bucket === row.system_bucket) systemMatch += 1;
  }

  const known = KNOWN_CODES.map((code) => {
    const saved = byCode.get(code);
    const expect = expectedByCode.get(code);
    const savedComponents = components.filter((item) => item.service_intelligence_id === saved?.id);
    return {
      invoice_code: code,
      present: Boolean(saved),
      confidence: saved?.classification_confidence ?? null,
      system: saved?.system_json ?? [],
      primary_service: saved?.primary_service_json ?? [],
      review_reasons: saved?.review_reasons_json ?? [],
      components: savedComponents.map((item) => ({
        canonical_component: item.canonical_component,
        model_or_part_number: item.model_or_part_number,
        work_action: item.work_action,
        warranty_status: item.warranty_status,
        warranty_duration_months: item.warranty_duration_months,
        extended_warranty_months: item.extended_warranty_months,
        inventory_item_id: item.inventory_item_id,
      })),
      matches_dry_run: Boolean(
        saved
        && expect
        && saved.classification_confidence === expect.classification_confidence
        && saved.system_bucket === expect.system_bucket
        && saved.labor_charged === expect.labor.labor_charged,
      ),
    };
  });

  const review = persisted
    .filter((row) => (row.review_reasons_json ?? []).length > 0)
    .map((row) => ({
      invoice_code: row.workiz_invoice_code,
      invoice_id: row.invoice_id,
      classification_confidence: row.classification_confidence,
      review_reasons: row.review_reasons_json,
      system: row.system_json,
      primary_service: row.primary_service_json,
    }));

  return {
    persisted_parents: persisted.length,
    persisted_components: components.length,
    persisted_warranties: warranties.length,
    labor_warranty_rows: warranties.filter((row) => row.scope === "LABOR").length,
    unscoped_parts_rows: warranties.filter((row) => row.scope === "UNSCOPED_PARTS").length,
    extended_rows: warranties.filter((row) => row.scope === "EXTENDED").length,
    confidence_match: confidenceMatch,
    system_match: systemMatch,
    count_mismatches: countMismatches,
    foreign_intelligence: foreignIntelligence,
    foreign_components: foreignComponents,
    foreign_warranties: foreignWarranties,
    mismatched_invoice_org: Number(mismatchedInvoiceOrg[0]?.c ?? 0),
    inventory_item_links: inventoryLinks,
    known,
    review_queue: review,
    HIGH: persisted.filter((row) => row.classification_confidence === "HIGH").length,
    MEDIUM: persisted.filter((row) => row.classification_confidence === "MEDIUM").length,
    LOW: persisted.filter((row) => row.classification_confidence === "LOW").length,
    parent_ids: persisted.map((row) => row.id).sort(),
  };
}

export async function runClassificationV1Persist(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const secondRun = process.argv.includes("--second-run");
  const { records, source } = await loadClassificationV1Records();
  const writable = records.filter((row) => Boolean(row.invoice_id));
  const expected = summarize(writable);

  if (!execute) {
    console.log(`Classification V1 persist DRY RUN: ${writable.length} invoices from ${source} would be written.`);
    console.log("Pass --execute to persist. No production intelligence rows written.");
    return;
  }

  if (source !== "db") {
    throw new Error("Refusing production persist from harness fallback. Database corpus is required.");
  }

  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();
  try {
    const org = await ds.getRepository(OrganizationEntity).findOne({ where: { id: PHOENIX_ORG_ID } });
    if (!org || org.slug !== PHOENIX_ORG_SLUG) {
      throw new Error("Phoenix org verification failed");
    }

    const before = await snapshotImmutable(ds, PHOENIX_ORG_ID);
    const classifiedAt = new Date();
    let inserted = 0;
    let rebuilt = 0;
    for (const row of writable) {
      const result = await persistOne(ds, PHOENIX_ORG_ID, row, classifiedAt);
      if (result.action === "inserted") inserted += 1;
      else rebuilt += 1;
    }
    const after = await snapshotImmutable(ds, PHOENIX_ORG_ID);
    const verified = await verifyPersisted(ds, PHOENIX_ORG_ID, writable);

    const report = {
      generated_at: new Date().toISOString(),
      mode: secondRun ? "execute_second_run" : "execute",
      taxonomy_version: TAXONOMY_VERSION,
      organization_id: PHOENIX_ORG_ID,
      source,
      expected,
      inserted,
      rebuilt,
      skipped_missing_invoice_id: records.length - writable.length,
      immutable_snapshot_before: before,
      immutable_snapshot_after: after,
      immutable_unchanged: sameSnapshot(before, after),
      verification: {
        persisted_parents: verified.persisted_parents,
        persisted_components: verified.persisted_components,
        persisted_warranties: verified.persisted_warranties,
        labor_warranty_rows: verified.labor_warranty_rows,
        unscoped_parts_rows: verified.unscoped_parts_rows,
        extended_rows: verified.extended_rows,
        HIGH: verified.HIGH,
        MEDIUM: verified.MEDIUM,
        LOW: verified.LOW,
        confidence_match: verified.confidence_match,
        system_match: verified.system_match,
        count_mismatches: verified.count_mismatches,
        CROSS_TENANT_WRITES: verified.foreign_intelligence + verified.foreign_components + verified.foreign_warranties,
        mismatched_invoice_org: verified.mismatched_invoice_org,
        inventory_item_links: verified.inventory_item_links,
        warranty_certificates_issued: 0,
        campaigns_created: 0,
      },
      known_invoices: verified.known,
      review_queue_count: verified.review_queue.length,
      parent_id_fingerprint: verified.parent_ids.join(","),
    };

    const outputDir = join(process.cwd(), "_runtime_harness", "service-intelligence");
    mkdirSync(outputDir, { recursive: true });
    const reportName = secondRun ? "classification-v1-persist-second-run.json" : "classification-v1-persist.json";
    writeFileSync(join(outputDir, reportName), JSON.stringify(report, null, 2));
    writeFileSync(join(outputDir, "classification-v1-review-queue-persisted.json"), JSON.stringify({
      generated_at: report.generated_at,
      organization_id: PHOENIX_ORG_ID,
      taxonomy_version: TAXONOMY_VERSION,
      queued: verified.review_queue.length,
      records: verified.review_queue,
    }, null, 2));

    console.log(`Persisted Classification V1: inserted=${inserted} rebuilt=${rebuilt} total=${writable.length}`);
    console.log(`Immutable financial/customer/PDF snapshot unchanged: ${report.immutable_unchanged}`);
    console.log(`Cross-tenant writes: ${report.verification.CROSS_TENANT_WRITES}`);
    console.log(`Review queue persisted separately: ${verified.review_queue.length}`);
    console.log(`Wrote ${join(outputDir, reportName)}`);
  } finally {
    await ds.destroy();
  }
}

async function main() {
  await runClassificationV1Persist();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
