import { cookies } from "next/headers";

import type { AiBrainHomeBriefResponse } from "@/lib/ai/brain-brief-types";
import { resolveServerApiOrigin } from "@/lib/api/backend-base-url";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

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

  const origin = await resolveServerApiOrigin();
  const response = await fetch(`${origin}/api/ai/brain/home-brief`, {
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