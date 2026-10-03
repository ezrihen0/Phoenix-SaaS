"use client";

import { useEffect, useMemo, useState } from "react";

import type { SessionRole } from "@/lib/auth/server-session";

type TeamMemberDetail = {
  id: string;
  full_name: string;
  phone: string | null;
  role: SessionRole;
  custom_role_id: string | null;
  custom_permission_keys: string[] | null;
  assignable_to_jobs: boolean | null;
  roster: {
    has_row: boolean;
    is_active: boolean;
  };
  editable: {
    globalIdentity: boolean;
    access: boolean;
    assignableToJobs: boolean;
    passwordReset: boolean;
  };
  upcomingAssignedJobCount: number;
  user: {
    email: string;
  } | null;
};

type CustomRoleOption = {
  id: string;
  name: string;
};

async function teamFetch<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "The request could not be completed.");
  }

  return payload?.data as T;
}

export default function TeamMemberEditModal({
  profileId,
  customRoles,
  onClose,
  onSaved,
}: {
  profileId: string;
  customRoles: CustomRoleOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [member, setMember] = useState<TeamMemberDetail | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [systemRole, setSystemRole] = useState<SessionRole>("office_admin");
  const [customRoleId, setCustomRoleId] = useState<string | null>(null);
  const [assignableToJobs, setAssignableToJobs] = useState(false);
  const [reactivateRoster, setReactivateRoster] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const detail = await teamFetch<TeamMemberDetail>(`/api/team/members/${encodeURIComponent(profileId)}`);
        if (cancelled) {
          return;
        }

        setMember(detail);
        setFullName(detail.full_name);
        setPhone(detail.phone ?? "");
        setSystemRole(detail.role);
        setCustomRoleId(detail.custom_role_id);
        setAssignableToJobs(detail.assignable_to_jobs === true);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load this team member.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const showReactivateCheckbox = useMemo(
    () => assignableToJobs && member?.roster.has_row && !member.roster.is_active,
    [assignableToJobs, member],
  );

  async function handleSave() {
    if (!member) {
      return;
    }

    if (!assignableToJobs && member.assignable_to_jobs === true && member.upcomingAssignedJobCount > 0 && !disableConfirmOpen) {
      setDisableConfirmOpen(true);
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const body: Record<string, unknown> = {
        fullName,
        phone: phone.trim() ? phone.trim() : null,
        systemRole,
        assignableToJobs,
      };

      if (customRoleId) {
        body.customRoleId = customRoleId;
      } else {
        body.customRoleId = null;
      }

      if (assignableToJobs && reactivateRoster) {
        body.reactivateRoster = true;
      }

      await teamFetch(`/api/team/members/${encodeURIComponent(profileId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      onSaved();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save changes.");
    } finally {
      setSaving(false);
      setDisableConfirmOpen(false);
    }
  }

  async function handleResetPassword() {
    if (!newPassword || newPassword.length < 8) {
      setPasswordMessage("Use at least 8 characters for the new password.");
      return;
    }

    setSaving(true);
    setPasswordMessage(null);

    try {
      await teamFetch(`/api/team/members/${encodeURIComponent(profileId)}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: newPassword }),
      });
      setNewPassword("");
      setPasswordMessage("Password updated. Existing sessions were signed out.");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "Could not reset the password.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--sem-surface-primary)] p-6 text-sm">
          Loading team member…
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="max-w-lg rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--sem-surface-primary)] p-6 text-sm">
          <p>{errorMessage ?? "This team member could not be loaded."}</p>
          <button type="button" className="mt-4 rounded-full border px-4 py-2" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--sem-surface-primary)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-[color:var(--sem-text-primary)]">Edit team member</h3>
            <p className="mt-1 text-sm text-[color:var(--sem-text-muted)]">{member.user?.email}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-[color:var(--sem-text-muted)]">Cancel</button>
        </div>

        {errorMessage ? <p className="mt-4 text-sm text-red-400">{errorMessage}</p> : null}

        {disableConfirmOpen ? (
          <div className="mt-4 rounded-[16px] border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
            This member has {member.upcomingAssignedJobCount} upcoming assigned job
            {member.upcomingAssignedJobCount === 1 ? "" : "s"}. Existing assignments will remain, but they will not receive new ones. Continue?
            <div className="mt-3 flex gap-2">
              <button type="button" className="rounded-full border px-4 py-2" onClick={() => setDisableConfirmOpen(false)}>Go back</button>
              <button type="button" className="rounded-full border px-4 py-2" onClick={() => void handleSave()} disabled={saving}>Confirm save</button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span>Name</span>
            <input
              value={fullName}
              disabled={!member.editable.globalIdentity}
              onChange={(event) => setFullName(event.target.value)}
              className="theme-control-surface w-full rounded-[14px] border px-3 py-2"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Phone</span>
            <input
              value={phone}
              disabled={!member.editable.globalIdentity}
              onChange={(event) => setPhone(event.target.value)}
              className="theme-control-surface w-full rounded-[14px] border px-3 py-2"
            />
          </label>
          <label className="space-y-2 text-sm sm:col-span-2">
            <span>Preset role</span>
            <select
              value={systemRole}
              disabled={!member.editable.access}
              onChange={(event) => setSystemRole(event.target.value as SessionRole)}
              className="theme-control-surface w-full rounded-[14px] border px-3 py-2"
            >
              <option value="admin">Admin</option>
              <option value="office_admin">Office / CSR</option>
              <option value="dispatcher">Dispatcher</option>
              <option value="technician">Technician</option>
              <option value="csr">CSR</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <label className="space-y-2 text-sm sm:col-span-2">
            <span>Custom role (optional)</span>
            <select
              value={customRoleId ?? ""}
              disabled={!member.editable.access}
              onChange={(event) => setCustomRoleId(event.target.value ? event.target.value : null)}
              className="theme-control-surface w-full rounded-[14px] border px-3 py-2"
            >
              <option value="">None</option>
              {customRoles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </label>
          <fieldset className="space-y-2 text-sm sm:col-span-2" disabled={!member.editable.assignableToJobs}>
            <legend>Can be assigned to jobs?</legend>
            <label className="mr-4 inline-flex items-center gap-2">
              <input type="radio" checked={assignableToJobs} onChange={() => setAssignableToJobs(true)} />
              Yes
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={!assignableToJobs} onChange={() => setAssignableToJobs(false)} />
              No
            </label>
          </fieldset>
          {showReactivateCheckbox ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={reactivateRoster} onChange={(event) => setReactivateRoster(event.target.checked)} />
              Reactivate inactive technician roster entry
            </label>
          ) : null}
        </div>

        {member.editable.passwordReset ? (
          <div className="mt-6 rounded-[18px] border border-[color:var(--cmp-border-subtle)] p-4">
            <p className="text-sm font-medium text-[color:var(--sem-text-primary)]">Set new password</p>
            <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">Separate from Save. This signs the member out everywhere.</p>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="theme-control-surface mt-3 w-full rounded-[14px] border px-3 py-2"
              autoComplete="new-password"
            />
            {passwordMessage ? <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{passwordMessage}</p> : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleResetPassword()}
              className="theme-control-surface mt-3 rounded-full border px-4 py-2 text-sm font-semibold"
            >
              Reset password
            </button>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full border px-5 py-2 text-sm">Cancel</button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="theme-control-surface rounded-full border px-5 py-2 text-sm font-semibold"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
