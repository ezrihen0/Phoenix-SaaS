export function normalizePortalRedirectPath(path: string | null | undefined, fallback = "/portal") {
  const trimmed = path?.trim();
  if (trimmed && trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  return fallback;
}

export function buildPortalJobRedirectPath(jobId: string | null | undefined) {
  const id = jobId?.trim();
  if (!id) {
    return "/portal";
  }
  return `/portal?tab=jobs&job=${encodeURIComponent(id)}`;
}
