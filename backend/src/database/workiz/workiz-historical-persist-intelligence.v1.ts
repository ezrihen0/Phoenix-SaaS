import { randomUUID } from "crypto";

import type { EntityManager } from "typeorm";

import { InvoiceServiceIntelligenceComponentEntity } from "../entities/invoice-service-intelligence-component.entity";
import { InvoiceServiceIntelligenceEntity } from "../entities/invoice-service-intelligence.entity";
import { InvoiceServiceIntelligenceWarrantyEntity } from "../entities/invoice-service-intelligence-warranty.entity";
import type { WorkizHistoricalParseCandidate, WorkizWarrantyProvenance } from "./workiz-historical-types.v1";

export const WORKIZ_HISTORICAL_INTELLIGENCE_TAXONOMY = "V1";
/** Must fit `invoice_service_intelligence.source_kind` varchar(32). */
export const WORKIZ_HISTORICAL_INTELLIGENCE_SOURCE = "workiz_historical_v1.1";

function mapWarrantyStatus(provenance: WorkizWarrantyProvenance, dynamicStatus: string): string {
  if (provenance === "AMBIGUOUS_WARRANTY") return "UNPARSEABLE";
  if (provenance === "PHOENIX_DEFAULT_POLICY") return "NOT_DOCUMENTED";
  if (dynamicStatus === "EXPIRED") return "DOCUMENTED_EXPIRED";
  if (provenance === "DOCUMENTED") return "DOCUMENTED_ACTIVE";
  return "NOT_DOCUMENTED";
}

function warrantyConfidence(provenance: WorkizWarrantyProvenance): string {
  if (provenance === "DOCUMENTED") return "HIGH";
  if (provenance === "AMBIGUOUS_WARRANTY") return "LOW";
  return "MEDIUM";
}

export async function persistHistoricalServiceIntelligence(input: {
  manager: EntityManager;
  organizationId: string;
  invoiceId: string;
  candidate: WorkizHistoricalParseCandidate;
  classifiedAt: Date;
}): Promise<{ intelligenceId: string; warrantyRows: number }> {
  const intelligenceRepo = input.manager.getRepository(InvoiceServiceIntelligenceEntity);
  const warrantyRepo = input.manager.getRepository(InvoiceServiceIntelligenceWarrantyEntity);
  const componentRepo = input.manager.getRepository(InvoiceServiceIntelligenceComponentEntity);

  const invoiceCode = input.candidate.invoice?.workiz_invoice_number ?? null;
  const service = input.candidate.service_intelligence;
  const systemBucket = service.system ?? "UNKNOWN";

  let parent = await intelligenceRepo.findOne({
    where: {
      organization_id: input.organizationId,
      invoice_id: input.invoiceId,
      taxonomy_version: WORKIZ_HISTORICAL_INTELLIGENCE_TAXONOMY,
    },
  });

  if (!parent) {
    parent = intelligenceRepo.create({
      id: randomUUID(),
      organization_id: input.organizationId,
      invoice_id: input.invoiceId,
      taxonomy_version: WORKIZ_HISTORICAL_INTELLIGENCE_TAXONOMY,
    });
  }

  parent.workiz_invoice_code = invoiceCode;
  parent.system_json = service.system ? [service.system] : [];
  parent.system_bucket = systemBucket;
  parent.primary_service_json = service.primary_service ? [service.primary_service] : [];
  parent.service_detail_json = service.service_detail ? [service.service_detail] : [];
  parent.labor_charged = service.labor;
  parent.labor_raw_wording_json = service.raw_evidence;
  parent.classification_confidence = input.candidate.confidence;
  parent.review_reasons_json = input.candidate.review_flags;
  parent.findings_json = service.findings.map((label) => ({ label, evidence: label, confidence: "MEDIUM" }));
  parent.source_kind = WORKIZ_HISTORICAL_INTELLIGENCE_SOURCE;
  parent.classified_at = input.classifiedAt;
  parent = await intelligenceRepo.save(parent);

  await warrantyRepo.delete({
    organization_id: input.organizationId,
    service_intelligence_id: parent.id,
  });
  await componentRepo.delete({
    organization_id: input.organizationId,
    service_intelligence_id: parent.id,
  });

  const reconstruction = input.candidate.warranty_reconstruction;
  const warrantyRows: InvoiceServiceIntelligenceWarrantyEntity[] = [];
  if (reconstruction) {
    for (const leg of [reconstruction.parts, reconstruction.labor]) {
      warrantyRows.push(warrantyRepo.create({
        id: randomUUID(),
        organization_id: input.organizationId,
        service_intelligence_id: parent.id,
        invoice_id: input.invoiceId,
        scope: leg.scope === "PARTS" ? "UNSCOPED_PARTS" : "LABOR",
        canonical_component: leg.scope === "PARTS" ? service.component : null,
        warranty_status: mapWarrantyStatus(leg.provenance, leg.status),
        duration_months: leg.duration_months,
        start_date: leg.start_date,
        expiry_date: leg.end_date,
        source_text: leg.source_text,
        confidence: warrantyConfidence(leg.provenance),
        evidence_json: [
          leg.source_text ?? "",
          `provenance:${leg.provenance}`,
          leg.source_location ? `source_location:${leg.source_location}` : "",
        ].filter(Boolean),
      }));
    }
  }

  if (warrantyRows.length > 0) {
    await warrantyRepo.save(warrantyRows);
  }

  return { intelligenceId: parent.id, warrantyRows: warrantyRows.length };
}
