import { cookies } from "next/headers";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

function backendBaseUrl() {
  return process.env.BACKEND_INTERNAL_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
}

export async function serverApiFetch<T>(
  input: string,
  init?: RequestInit,
) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(`${backendBaseUrl()}${input}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok) {
    const message = payload?.error?.message?.trim();
    if (message) {
      throw new Error(message);
    }

    throw new Error(
      response.status >= 500
        ? `The request could not be completed. The backend returned HTTP ${response.status}. Ensure the API server is running on port 4000.`
        : `The request could not be completed (HTTP ${response.status}).`,
    );
  }

  return payload?.data as T;
}
