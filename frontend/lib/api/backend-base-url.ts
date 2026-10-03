import { headers } from "next/headers";

/** Matches `next.config.ts` rewrite destination order for direct backend fallback. */
export function serverBackendBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL
    ?? process.env.BACKEND_INTERNAL_URL
    ?? "http://localhost:4000"
  );
}

/**
 * Prefer the active staff app origin so SSR hits `/api/*` rewrites (same session cookies as the browser).
 */
export async function resolveServerApiOrigin(): Promise<string> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "https";

  if (host) {
    const primaryHost = host.split(",")[0]?.trim();
    if (primaryHost) {
      return `${proto}://${primaryHost}`;
    }
  }

  return serverBackendBaseUrl();
}
