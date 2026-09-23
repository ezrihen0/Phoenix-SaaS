type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
    code?: string;
  };
};

export class CrmApiError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "CrmApiError";
    this.code = code;
  }
}

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();

function resolveApiUrl(input: string) {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return input;
  }

  if (!apiBaseUrl) {
    return input;
  }

  const normalizedBase = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  const normalizedPath = input.startsWith("/") ? input : `/${input}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function crmApiFetch<T>(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);

  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(resolveApiUrl(input), {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (response.status === 401 && typeof window !== "undefined") {
    const loginUrl = new URL("/login", window.location.origin);

    if (window.location.pathname !== "/") {
      loginUrl.searchParams.set("next", window.location.pathname);
    }

    window.location.assign(`${loginUrl.pathname}${loginUrl.search}`);
    throw new Error("Your Phoenix Fireplace CRM session has expired. Sign in again to continue.");
  }

  if (!response.ok) {
    const code = payload?.error?.code?.trim();
    const message = payload?.error?.message?.trim();
    if (message) {
      throw new CrmApiError(message, code);
    }

    throw new CrmApiError(
      response.status >= 500
        ? `The request could not be completed. The backend returned HTTP ${response.status}. Ensure the API server is running on port 4000.`
        : `The request could not be completed (HTTP ${response.status}).`,
      code,
    );
  }

  return payload?.data as T;
}