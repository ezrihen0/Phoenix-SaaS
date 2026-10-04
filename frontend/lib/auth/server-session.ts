import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveServerApiOrigin } from "@/lib/api/backend-base-url";

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
  platform_capabilities: string[];
};

async function serverAuthFetch<T>(input: string): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const origin = await resolveServerApiOrigin();
  const response = await fetch(`${origin}${input}`, {
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

export async function requireJobsListRoute(nextPath: string) {
  const session = await requireServerSession(nextPath);

  if (
    !session.permissions.includes("jobs.view")
    && !session.permissions.includes("jobs.assigned.view")
  ) {
    const destination = await getServerDestination();

    if (destination) {
      redirect(destination);
    }

    redirect("/login?reason=unsupported-account");
  }

  return session;
}

export async function requireLeadsRoute(nextPath: string) {
  return requireServerPermission(nextPath, "leads.view");
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

function readMichaelReportAllowlistedEmails() {
  const owner = (process.env.PHOENIX_OWNER_EMAIL ?? "service@phoenixfireplace.ca").trim().toLowerCase();
  const michael = process.env.MICHAEL_HISTORICAL_REPORT_USER_EMAIL?.trim().toLowerCase();
  const emails = new Set<string>([owner]);
  if (michael) {
    emails.add(michael);
  }

  return emails;
}

export async function requireMichaelReportRoute(nextPath: string) {
  const enabledRaw = process.env.MICHAEL_HISTORICAL_REPORT_ENABLED?.trim().toLowerCase();
  if (enabledRaw === "false" || enabledRaw === "0") {
    redirect("/home");
  }

  const session = await requireServerSession(nextPath);
  const email = session.user.email.trim().toLowerCase();
  const orgSlug = session.active_organization?.slug?.trim().toLowerCase();

  if (!readMichaelReportAllowlistedEmails().has(email) || orgSlug !== "phoenix-fireplace") {
    const destination = await getServerDestination();
    redirect(destination ?? "/home");
  }

  return session;
}
