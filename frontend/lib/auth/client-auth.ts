type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

async function authFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "The request could not be completed.");
  }

  return payload?.data as T;
}

export type ClientSession = {
  user: {
    id: string;
    email: string;
  };
  profile: {
    id: string;
    full_name: string;
    phone: string | null;
    role: "owner" | "admin" | "office_admin" | "dispatcher" | "csr" | "technician" | "viewer";
  } | null;
  technician: {
    id: string;
    display_name: string;
    phone: string | null;
    specialties: string[];
    is_active: boolean;
    last_seen_at: string | null;
  } | null;
};

export async function loginWithPassword(email: string, password: string) {
  return authFetch<ClientSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logoutSession() {
  return authFetch<{ cleared: boolean }>("/api/auth/logout", {
    method: "POST",
  });
}

export async function getClientSession() {
  return authFetch<ClientSession>("/api/auth/session");
}

export async function getClientDestination() {
  return authFetch<{ destination: "/jobs" | "/technician" }>("/api/auth/destination");
}

export async function updateCurrentPassword(password: string) {
  return authFetch<{ updated: boolean }>("/api/auth/password", {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
}
