import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

type ClientDestination = "/pricing" | "/home";

export type SessionRole = "owner" | "admin" | "office_admin" | "dispatcher" | "csr" | "technician" | "viewer";

type SessionData = {
  user: {
    id: string;
    email: string;
  };
  profile: {
    id: string;
    full_name: string;
    phone: string | null;
    role: SessionRole;
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
    role: SessionRole;
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
    role: SessionRole;
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

function backendBaseUrl() {
  return process.env.BACKEND_INTERNAL_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
}

async function serverAuthFetch<T>(input: string): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const response = await fetch(`${backendBaseUrl()}${input}`, {
    method: "GET",
    headers: {
      cookie: cookieHeader,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "The request could not be completed.");
  }

  return payload?.data as T;
}

export async function getServerSession() {
  try {
    return await serverAuthFetch<SessionData>("/api/auth/session");
  } catch {
    return null;
  }
}

export async function getServerDestination() {
  try {
    const response = await serverAuthFetch<{ destination: ClientDestination | null }>("/api/auth/destination");
    return response.destination;
  } catch {
    return null;
  }
}

export async function requireOfficeCrmRoute(nextPath: string) {
  const session = await requireServerSession(nextPath);

  if (session.profile?.role === "technician") {
    const destination = await getServerDestination();
    redirect(destination ?? "/home");
  }

  return session;
}

export async function requireServerSession(nextPath: string) {
  const session = await getServerSession();

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const destination = await getServerDestination();

  if (!destination) {
    redirect("/login?reason=role-resolution-failed");
  }

  if (destination === "/pricing" && nextPath !== "/pricing") {
    redirect("/pricing");
  }

  return session;
}

export async function requireServerRoles(nextPath: string, allowedRoles: SessionRole[]) {
  const session = await requireServerSession(nextPath);
  const role = session.profile?.role ?? null;

  if (!role || !allowedRoles.includes(role)) {
    const destination = await getServerDestination();

    if (destination) {
      redirect(destination);
    }

    redirect("/login?reason=unsupported-account");
  }

  return session;
}

/**
 * Mirror backend permission gates (e.g. `calls.view` for telephony recent calls).
 */
export async function requireServerPermission(nextPath: string, permission: string) {
  const session = await requireServerSession(nextPath);

  if (!session.permissions.includes(permission)) {
    const destination = await getServerDestination();

    if (destination) {
      redirect(destination);
    }

    redirect("/login?reason=unsupported-account");
  }

  return session;
}
