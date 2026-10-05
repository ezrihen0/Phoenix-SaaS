import { CustomerEntity } from "../entities/customer.entity";
import type { DataSource, EntityManager } from "typeorm";

import type { WorkizHistoricalCustomerEvidence } from "./workiz-historical-types.v1";
import { PHASE6_OWNER_PINNED_EXISTING_CUSTOMER_IDS } from "./workiz-phase6-resume-owner-decisions";

export type ProductionCustomerMatchOutcome =
  | {
    kind: "matched";
    customerId: string;
    strategy: "email" | "phone" | "name_address" | "external_client_number" | "owner_pinned";
  }
  | { kind: "create"; externalKey: string }
  | { kind: "ambiguous"; reason: string; candidateIds: string[] };

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeStreet(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildWorkizCustomerExternalKey(snapshot: WorkizHistoricalCustomerEvidence, clusterId: string): string {
  if (snapshot.normalized_email) return `workiz:email:${snapshot.normalized_email}`;
  if (snapshot.normalized_phone) return `workiz:phone:${snapshot.normalized_phone}`;
  return `workiz:cluster:${clusterId}`;
}

function customerRepository(dataSource: DataSource, manager?: EntityManager) {
  return manager ? manager.getRepository(CustomerEntity) : dataSource.getRepository(CustomerEntity);
}

export async function matchProductionPhoenixCustomer(input: {
  dataSource: DataSource;
  organizationId: string;
  snapshot: WorkizHistoricalCustomerEvidence;
  clusterId: string;
  manager?: EntityManager;
}): Promise<ProductionCustomerMatchOutcome> {
  const repo = customerRepository(input.dataSource, input.manager);
  const externalKey = buildWorkizCustomerExternalKey(input.snapshot, input.clusterId);

  const pinnedCustomerId = PHASE6_OWNER_PINNED_EXISTING_CUSTOMER_IDS[input.clusterId];
  if (pinnedCustomerId) {
    const pinned = await repo.findOne({
      where: { id: pinnedCustomerId, organization_id: input.organizationId },
    });
    if (!pinned) {
      return {
        kind: "ambiguous",
        reason: `Owner-pinned customer ${pinnedCustomerId} missing for ${input.clusterId}`,
        candidateIds: [],
      };
    }
    return { kind: "matched", customerId: pinned.id, strategy: "owner_pinned" };
  }

  const byExternal = await repo.findOne({
    where: { organization_id: input.organizationId, external_client_number: externalKey },
  });
  if (byExternal) {
    return { kind: "matched", customerId: byExternal.id, strategy: "external_client_number" };
  }

  if (input.snapshot.normalized_email) {
    const emailMatches = await repo.find({
      where: { organization_id: input.organizationId, email: input.snapshot.normalized_email },
    });
    if (emailMatches.length === 1) {
      return { kind: "matched", customerId: emailMatches[0].id, strategy: "email" };
    }
    if (emailMatches.length > 1) {
      return {
        kind: "ambiguous",
        reason: `Multiple Phoenix customers share email ${input.snapshot.normalized_email}`,
        candidateIds: emailMatches.map((row) => row.id),
      };
    }
  }

  if (input.snapshot.normalized_phone) {
    const phoneMatches = (await repo.find({ where: { organization_id: input.organizationId } }))
      .filter((customer) => customer.phone.replace(/\D/g, "") === input.snapshot.normalized_phone);
    if (phoneMatches.length === 1) {
      return { kind: "matched", customerId: phoneMatches[0].id, strategy: "phone" };
    }
    if (phoneMatches.length > 1) {
      return {
        kind: "ambiguous",
        reason: `Multiple Phoenix customers share phone ${input.snapshot.phone}`,
        candidateIds: phoneMatches.map((row) => row.id),
      };
    }
  }

  const normalizedName = normalizeName(input.snapshot.name);
  const street = normalizeStreet(input.snapshot.address_line_1);
  const postal = input.snapshot.postal_code.trim().toUpperCase();
  if (normalizedName && street && postal) {
    const addressMatches = (await repo.find({
      where: { organization_id: input.organizationId, service_postal_code: postal },
    })).filter((customer) =>
      normalizeName(customer.full_name) === normalizedName
      && normalizeStreet(customer.service_address_line_1) === street,
    );
    if (addressMatches.length === 1) {
      return { kind: "matched", customerId: addressMatches[0].id, strategy: "name_address" };
    }
    if (addressMatches.length > 1) {
      return {
        kind: "ambiguous",
        reason: `Multiple Phoenix customers share name+address for ${input.snapshot.name}`,
        candidateIds: addressMatches.map((row) => row.id),
      };
    }
  }

  return { kind: "create", externalKey };
}

export function mergeHistoricalProvenanceTags(
  existing: string[] | null | undefined,
  isCalgary: boolean,
): string[] {
  const tags = new Set(existing ?? []);
  tags.add("WORKIZ");
  tags.add("HISTORICAL_IMPORT");
  if (isCalgary) tags.add("CALGARY");
  return [...tags];
}
