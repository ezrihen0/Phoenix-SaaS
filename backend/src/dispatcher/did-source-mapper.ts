import type { LeadSource } from "../crm/constants";

export type DidSourceMapping = {
  source: LeadSource;
  label: string;
  campaignName?: string | null;
};

export type DidSourceMapConfig = Record<string, DidSourceMapping>;

const DEFAULT_MAPPING: DidSourceMapping = {
  source: "other",
  label: "Other",
};

function normalizeDid(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.replace(/[^0-9+]/g, "").trim();
}

export function normalizeDidSourceMapKey(value: string | null | undefined) {
  return normalizeDid(value);
}

export function parseDidSourceMapFromEnv(rawValue: string | null | undefined): DidSourceMapConfig {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, DidSourceMapping>;
    const output: DidSourceMapConfig = {};

    for (const [did, mapping] of Object.entries(parsed)) {
      const normalizedDid = normalizeDid(did);
      if (!normalizedDid || !mapping) {
        continue;
      }

      output[normalizedDid] = {
        source: mapping.source,
        label: mapping.label?.trim() || "Other",
        campaignName: mapping.campaignName?.trim() || null,
      };
    }

    return output;
  } catch {
    return {};
  }
}

export function mapDidToLeadSource(
  calledNumberDid: string | null | undefined,
  sourceMap: DidSourceMapConfig,
): DidSourceMapping {
  return resolveDidSourceMapping(calledNumberDid, sourceMap).mapping;
}

export function resolveDidSourceMapping(
  calledNumberDid: string | null | undefined,
  sourceMap: DidSourceMapConfig,
): {
  id: string | null;
  matched: boolean;
  mapping: DidSourceMapping;
} {
  const normalizedDid = normalizeDid(calledNumberDid);

  if (!normalizedDid) {
    return {
      id: null,
      matched: false,
      mapping: DEFAULT_MAPPING,
    };
  }

  const mapping = sourceMap[normalizedDid];

  if (!mapping) {
    return {
      id: null,
      matched: false,
      mapping: DEFAULT_MAPPING,
    };
  }

  return {
    id: normalizedDid,
    matched: true,
    mapping,
  };
}

export const exampleDidSourceMap: DidSourceMapConfig = {
  "+14035550111": { source: "google", label: "Google Ads" },
  "+14035550112": { source: "other", label: "Facebook" },
  "+17805550111": { source: "website", label: "Website" },
};
