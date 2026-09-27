import type { BranchEntity } from "../database/entities/branch.entity";

export const BRANCH_DOCUMENT_SNAPSHOT_TEMPLATE_VERSION = "phoenix-v1" as const;

export type BranchDocumentSnapshot = {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal: string | null;
  tax_label: string | null;
  tax_number: string | null;
  logo: string | null;
  template_version: typeof BRANCH_DOCUMENT_SNAPSHOT_TEMPLATE_VERSION;
};

export function buildBranchDocumentSnapshot(branch: BranchEntity): BranchDocumentSnapshot {
  return {
    branch_id: branch.id,
    branch_code: branch.code,
    branch_name: branch.name,
    phone: normalize(branch.phone),
    email: normalize(branch.email),
    website: normalize(branch.website),
    address: normalize(branch.address_line),
    city: normalize(branch.city),
    province: normalize(branch.province),
    postal: normalize(branch.postal_code),
    tax_label: normalize(branch.tax_label),
    tax_number: normalize(branch.tax_number),
    logo: normalize(branch.logo_url),
    template_version: BRANCH_DOCUMENT_SNAPSHOT_TEMPLATE_VERSION,
  };
}

function normalize(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
