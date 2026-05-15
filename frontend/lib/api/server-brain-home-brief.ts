import { cookies } from "next/headers";

import type { AiBrainHomeBriefResponse } from "@/lib/ai/brain-brief-types";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

function backendBaseUrl() {
  return process.env.BACKEND_INTERNAL_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
}

/**
 * Telemetry-oriented Brain brief (`GET /api/ai/brain/home-brief`). Returns `null` when
 * the feature is disabled, session is not eligible, or the request fails — `/home`
 * hides the Intelligence strip unless a full envelope is returned.
 */
export async function fetchBrainHomeBriefSilent(): Promise<AiBrainHomeBriefResponse | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const headers = new Headers();

  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(`${backendBaseUrl()}/api/ai/brain/home-brief`, {
    headers,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<AiBrainHomeBriefResponse> | null;

  if (!response.ok) {
    return null;
  }

  const data = payload?.data ?? null;

  return data ?? null;
}