type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export type ClientDestination = "/pricing" | "/home";

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
    customer_facing_name?: string | null;
    customer_facing_title?: string | null;
    customer_facing_photo_url?: string | null;
    phone: string | null;
    specialties: string[];
    is_active: boolean;
    last_seen_at: string | null;
  } | null;
  active_membership: {
    id: string;
    organization_id: string;
    role: "owner" | "admin" | "office_admin" | "dispatcher" | "csr" | "technician" | "viewer";
    status: "active" | "invited" | "suspended";
  } | null;
  active_organization: {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
  } | null;
  memberships: Array<{
    id: string;
    organization_id: string;
    role: "owner" | "admin" | "office_admin" | "dispatcher" | "csr" | "technician" | "viewer";
    status: "active" | "invited" | "suspended";
    organization: {
      id: string;
      name: string;
      slug: string;
      is_active: boolean;
    } | null;
  }>;
  permissions: string[];
  platform_capabilities: string[];
};

export async function loginWithPassword(email: string, password: string) {
  return authFetch<ClientSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function registerWithPassword(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
  organizationName: string;
}) {
  return authFetch<ClientSession>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      phone: input.phone ?? null,
      organizationName: input.organizationName,
    }),
  });
}

export async function logoutSession() {
  return authFetch<{ cleared: boolean }>("/api/auth/logout", {
    method: "POST",
  });
}

let clientSessionInFlight: Promise<ClientSession> | null = null;
let clientDestinationInFlight: Promise<{ destination: ClientDestination | null }> | null = null;

/** Clears in-flight client auth dedupe (e.g. after logout). Does not cache responses. */
export function invalidateClientAuthCache() {
  clientSessionInFlight = null;
  clientDestinationInFlight = null;
}

export async function getClientSession() {
  if (!clientSessionInFlight) {
    clientSessionInFlight = authFetch<ClientSession>("/api/auth/session").finally(() => {
      clientSessionInFlight = null;
    });
  }

  return clientSessionInFlight;
}

export type ClientSessionProbeStatus = "authenticated" | "unauthenticated" | "unavailable";

export type ClientSessionProbe = {
  session: ClientSession | null;
  status: ClientSessionProbeStatus;
};

/** Soft session probe for startup — treats 401/403 as signed-out, not a fatal boot error. */
export async function probeClientSession(): Promise<ClientSessionProbe> {
  try {
    const response = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (response.status === 401 || response.status === 403) {
      return { session: null, status: "unauthenticated" };
    }

    const payload = await response.json().catch(() => null) as ApiEnvelope<ClientSession> | null;

    if (!response.ok) {
      return { session: null, status: "unavailable" };
    }

    if (!payload?.data) {
      return { session: null, status: "unauthenticated" };
    }

    return { session: payload.data, status: "authenticated" };
  } catch {
    return { session: null, status: "unavailable" };
  }
}

export async function listClientOrganizations() {
  return authFetch<ClientSession["memberships"]>("/api/auth/organizations");
}

export async function createClientOrganization(
  organizationName: string,
  mode: "standalone" | "shared" = "shared",
) {
  return authFetch<ClientSession>("/api/auth/organizations", {
    method: "POST",
    body: JSON.stringify({ organizationName, mode }),
  });
}

export async function setClientActiveOrganization(organizationId: string) {
  return authFetch<ClientSession>("/api/auth/active-organization", {
    method: "POST",
    body: JSON.stringify({ organizationId }),
  });
}

export async function getClientDestination() {
  if (!clientDestinationInFlight) {
    clientDestinationInFlight = authFetch<{ destination: ClientDestination | null }>(
      "/api/auth/destination",
    ).finally(() => {
      clientDestinationInFlight = null;
    });
  }

  return clientDestinationInFlight;
}

export async function updateCurrentPassword(password: string) {
  return authFetch<{ updated: boolean }>("/api/auth/password", {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
}
