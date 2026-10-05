export const JOBBER_CUSTOMER_TAG = "JOBBER";

export function normalizeCustomerTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.map((tag) => tag.trim()).filter(Boolean);
}

export function ensureCustomerTag(tags: string[] | null | undefined, tag: string): string[] {
  const normalized = normalizeCustomerTags(tags);
  if (normalized.includes(tag)) {
    return normalized;
  }
  return [...normalized, tag];
}
