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

export async function getClientSession() {
  return authFetch<ClientSession>("/api/auth/session");
}

export async function listClientOrganizations() {
  return authFetch<ClientSession["memberships"]>("/api/auth/organizations");
}

export async function createClientOrganization(organizationName: string) {
  return authFetch<ClientSession>("/api/auth/organizations", {
    method: "POST",
    body: JSON.stringify({ organizationName }),
  });
}

export async function setClientActiveOrganization(organizationId: string) {
  return authFetch<ClientSession>("/api/auth/active-organization", {
    method: "POST",
    body: JSON.stringify({ organizationId }),
  });
}

export async function getClientDestination() {
  return authFetch<{ destination: ClientDestination | null }>("/api/auth/destination");
}

export async function updateCurrentPassword(password: string) {
  return authFetch<{ updated: boolean }>("/api/auth/password", {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
}
