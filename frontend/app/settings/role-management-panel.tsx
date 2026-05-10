"use client";

import { ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

import type { SessionRole } from "@/lib/auth/server-session";

type StaffProfile = {
  id: string;
  auth_user_id: string;
  full_name: string;
  phone: string | null;
  role: SessionRole;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    email: string;
    is_active: boolean;
  } | null;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
  };
};

type RoleManagementPanelProps = {
  initialStaff: StaffProfile[];
  currentProfileId: string;
};

const roleOptions: Array<{ value: SessionRole; label: string; helper: string }> = [
  { value: "owner", label: "Owner", helper: "Full access, including staff role management." },
  { value: "admin", label: "Admin", helper: "Full operations without owner-only controls." },
  { value: "office_admin", label: "Office Admin", helper: "Day-to-day office operations." },
  { value: "dispatcher", label: "Dispatcher", helper: "Calls, messaging, schedule, and dispatch coordination." },
  { value: "csr", label: "CSR", helper: "Customer intake, calls, messaging, and leads." },
  { value: "technician", label: "Technician", helper: "Assigned-job access. Link to a technician record separately." },
  { value: "viewer", label: "Viewer", helper: "Read-only CRM access." },
];

function roleLabel(role: SessionRole) {
  return roleOptions.find((option) => option.value === role)?.label ?? role.replace("_", " ");
}

async function rolePanelFetch<T>(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "The staff role request could not be completed.");
  }

  return payload?.data as T;
}

export function RoleManagementPanel({
  initialStaff,
  currentProfileId,
}: RoleManagementPanelProps) {
  const [staff, setStaff] = useState(initialStaff);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<SessionRole>("office_admin");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sortedStaff = useMemo(
    () => [...staff].sort((left, right) => left.full_name.localeCompare(right.full_name)),
    [staff],
  );

  async function handleCreateStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const createdStaff = await rolePanelFetch<StaffProfile>("/api/auth/staff", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email,
          phone,
          password,
          role,
        }),
      });

      setStaff((current) => [...current, createdStaff]);
      setFullName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setRole("office_admin");
      setMessage(`${createdStaff.full_name} was created as ${roleLabel(createdStaff.role)}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The staff account could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(profileId: string, nextRole: SessionRole) {
    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const updatedStaff = await rolePanelFetch<StaffProfile>(`/api/auth/staff/${profileId}/role`, {
        method: "PATCH",
        body: JSON.stringify({
          role: nextRole,
        }),
      });

      setStaff((current) => current.map((item) => (item.id === profileId ? updatedStaff : item)));
      setMessage(`${updatedStaff.full_name} is now ${roleLabel(updatedStaff.role)}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The role could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="theme-surface-card overflow-hidden rounded-[32px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]">
      <div className="border-b border-[color:var(--cmp-border-subtle)] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="theme-control-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-[18px] border">
              <ShieldCheck className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Owner Panel</p>
              <h2 className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Staff roles</h2>
            </div>
          </div>
          <div className="theme-control-surface-soft rounded-[18px] border px-4 py-3 text-xs leading-5 text-[color:var(--sem-text-secondary)]">
            Technician users still need to be linked to a technician roster record before assigned-job access works.
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="theme-control-surface-soft rounded-[20px] border px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Staff</p>
            <p className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{staff.length}</p>
          </div>
          <div className="theme-control-surface-soft rounded-[20px] border px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Role Set</p>
            <p className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{roleOptions.length}</p>
          </div>
          <div className="theme-control-surface-soft rounded-[20px] border px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Access</p>
            <p className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Owner</p>
          </div>
        </div>
        <div className="mt-5">
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            Create staff login accounts and assign one of the fixed Role Mode V1 roles. Custom role definitions are not editable in V1.
          </p>
        </div>
      </div>

      <form onSubmit={handleCreateStaff} className="m-6 grid gap-4 rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5 lg:grid-cols-2">
        <div className="flex items-center gap-3 lg:col-span-2">
          <div className="theme-control-surface-soft inline-flex h-10 w-10 items-center justify-center rounded-[16px] border">
            <UserPlus className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-accent-primary)]">Create Login</p>
            <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">New staff account</h3>
          </div>
        </div>
        <label className="space-y-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Full name</span>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
            required
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Email</span>
          <input
            value={email}
            type="email"
            onChange={(event) => setEmail(event.target.value)}
            className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
            required
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Phone</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Temporary password</span>
          <input
            value={password}
            type="password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
            required
          />
        </label>
        <label className="space-y-2 text-sm lg:col-span-2">
          <span className="text-[color:var(--sem-text-secondary)]">Role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as SessionRole)}
            className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} - {option.helper}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-3 lg:col-span-2 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={saving}
            className="theme-control-surface inline-flex items-center justify-center rounded-full border px-5 py-3 text-sm font-semibold transition hover:border-[color:var(--cmp-border-accent)] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Create staff account"}
          </button>
          {message ? <p className="text-sm text-[color:var(--sem-accent-primary)]">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}
        </div>
      </form>

      <div className="mx-6 mb-6 overflow-hidden rounded-[26px] border border-[color:var(--cmp-border-subtle)]">
        <div className="flex items-center gap-3 border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-4">
          <div className="theme-control-surface-soft inline-flex h-10 w-10 items-center justify-center rounded-[16px] border">
            <UsersRound className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-accent-primary)]">Directory</p>
            <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Current staff</h3>
          </div>
        </div>
        <div className="grid grid-cols-[1.2fr_1.2fr_0.9fr] gap-3 border-b border-[color:var(--cmp-border-subtle)] px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">
          <span>Name</span>
          <span>Login</span>
          <span>Assigned Role</span>
        </div>
        {sortedStaff.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[1.2fr_1.2fr_0.9fr] gap-3 border-b border-[color:var(--cmp-border-subtle)] px-4 py-4 text-sm last:border-b-0"
          >
            <div>
              <p className="font-semibold text-[color:var(--sem-text-primary)]">{item.full_name}</p>
              <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{item.phone || "No phone"}</p>
            </div>
            <p className="text-[color:var(--sem-text-secondary)]">{item.user?.email ?? "No login email"}</p>
            <select
              value={item.role}
              disabled={saving || item.id === currentProfileId}
              onChange={(event) => void handleRoleChange(item.id, event.target.value as SessionRole)}
              className="theme-control-surface rounded-[14px] border px-3 py-2 text-[color:var(--sem-text-primary)] outline-none disabled:opacity-60"
              title={item.id === currentProfileId ? "You cannot change your own role from this panel." : undefined}
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </section>
  );
}
