"use client";

import {
  ChevronRight,
  Copy,
  LockKeyhole,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { SessionRole } from "@/lib/auth/server-session";

type TeamSummary = {
  activeCount: number;
  maxUsers: number;
  canAddUser: boolean;
  limitMessage: string | null;
};

type PermissionPreviewRow = {
  group: string;
  label: string;
  level: string;
};

type TeamMember = {
  id: string;
  auth_user_id: string;
  membership_id: string;
  full_name: string;
  phone: string | null;
  role: SessionRole;
  access_label: string;
  status: "active" | "invited" | "suspended";
  custom_role_id: string | null;
  custom_permission_keys: string[] | null;
  permissions: string[];
  permission_preview: PermissionPreviewRow[];
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    email: string;
    is_active: boolean;
  } | null;
};

type CustomRole = {
  id: string;
  name: string;
  permission_keys: string[];
  permission_preview: PermissionPreviewRow[];
};

type PermissionRegistryGroup = {
  id: string;
  label: string;
  permissions: Array<{ key: string; label: string; sensitive?: boolean }>;
};

type RoleRecommendation = {
  recommendedRole: SessionRole;
  label: string;
  explanation: string;
  permissions: string[];
  preview: PermissionPreviewRow[];
};

type ApiEnvelope<T> = {
  data?: T;
  error?: { message?: string };
};

const RESPONSIBILITIES: Array<{ id: string; label: string }> = [
  { id: "answer_calls_messages", label: "Answer calls & messages" },
  { id: "manage_customers_leads", label: "Manage customers & leads" },
  { id: "book_appointments", label: "Book appointments" },
  { id: "manage_schedule", label: "Manage the schedule" },
  { id: "dispatch_technicians", label: "Dispatch technicians" },
  { id: "perform_field_work", label: "Perform field work" },
  { id: "create_estimates", label: "Create estimates" },
  { id: "manage_invoices", label: "Manage invoices" },
  { id: "record_payments", label: "Record payments" },
  { id: "manage_marketing", label: "Manage marketing" },
  { id: "manage_team_members", label: "Manage team members" },
  { id: "manage_business_settings", label: "Manage business settings" },
];

async function teamFetch<T>(input: string, init?: RequestInit) {
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
    throw new Error(payload?.error?.message ?? "The team request could not be completed.");
  }

  return payload?.data as T;
}

type TeamPermissionsPanelProps = {
  currentProfileId: string;
};

type AddUserStep = "user" | "responsibilities" | "recommendation" | "customize" | "confirm";

export function TeamPermissionsPanel({ currentProfileId }: TeamPermissionsPanelProps) {
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [registryGroups, setRegistryGroups] = useState<PermissionRegistryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showAddUser, setShowAddUser] = useState(false);
  const [addStep, setAddStep] = useState<AddUserStep>("user");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [responsibilities, setResponsibilities] = useState<string[]>([]);
  const [recommendation, setRecommendation] = useState<RoleRecommendation | null>(null);
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [selectedSystemRole, setSelectedSystemRole] = useState<SessionRole>("office_admin");
  const [selectedCustomRoleId, setSelectedCustomRoleId] = useState<string | null>(null);
  const [newCustomRoleName, setNewCustomRoleName] = useState("");

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [nextSummary, nextMembers, nextCustomRoles, registry] = await Promise.all([
        teamFetch<TeamSummary>("/api/team/summary"),
        teamFetch<TeamMember[]>("/api/team/members"),
        teamFetch<CustomRole[]>("/api/team/custom-roles"),
        teamFetch<{ groups: PermissionRegistryGroup[] }>("/api/team/permissions/registry"),
      ]);

      setSummary(nextSummary);
      setMembers(nextMembers);
      setCustomRoles(nextCustomRoles);
      setRegistryGroups(registry.groups);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Team data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const sortedMembers = useMemo(
    () => [...members].sort((left, right) => left.full_name.localeCompare(right.full_name)),
    [members],
  );

  function resetAddUserFlow() {
    setShowAddUser(false);
    setAddStep("user");
    setFullName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setResponsibilities([]);
    setRecommendation(null);
    setUseCustomPermissions(false);
    setSelectedPermissions([]);
    setSelectedSystemRole("office_admin");
    setSelectedCustomRoleId(null);
    setNewCustomRoleName("");
  }

  async function handleRecommendRole() {
    setSaving(true);
    setErrorMessage(null);

    try {
      const result = await teamFetch<RoleRecommendation>("/api/team/recommend-role", {
        method: "POST",
        body: JSON.stringify({ responsibilities }),
      });
      setRecommendation(result);
      setSelectedSystemRole(result.recommendedRole);
      setSelectedPermissions(result.permissions);
      setAddStep("recommendation");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not generate a role recommendation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateMember() {
    setSaving(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const body: Record<string, unknown> = {
        fullName,
        email,
        phone,
        password,
      };

      if (selectedCustomRoleId) {
        body.customRoleId = selectedCustomRoleId;
        body.systemRole = selectedSystemRole;
      } else if (useCustomPermissions) {
        body.customPermissionKeys = selectedPermissions;
        body.systemRole = selectedSystemRole;
      } else {
        body.systemRole = selectedSystemRole;
      }

      const created = await teamFetch<TeamMember>("/api/team/members", {
        method: "POST",
        body: JSON.stringify(body),
      });

      setMembers((current) => [...current, created]);
      setSummary((current) => current
        ? {
          ...current,
          activeCount: current.activeCount + 1,
          canAddUser: current.activeCount + 1 < current.maxUsers,
          limitMessage: current.activeCount + 1 >= current.maxUsers
            ? `Your organization has reached its ${current.maxUsers}-user limit.`
            : null,
        }
        : current);
      setMessage(`${created.full_name} was added to the team.`);
      resetAddUserFlow();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The team member could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCustomRole() {
    if (!newCustomRoleName.trim() || selectedPermissions.length === 0) {
      setErrorMessage("Provide a role name and at least one permission.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const created = await teamFetch<CustomRole>("/api/team/custom-roles", {
        method: "POST",
        body: JSON.stringify({
          name: newCustomRoleName.trim(),
          permissionKeys: selectedPermissions,
        }),
      });
      setCustomRoles((current) => [...current, created]);
      setSelectedCustomRoleId(created.id);
      setNewCustomRoleName("");
      setMessage(`Custom role "${created.name}" was created.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The custom role could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicateRole(roleId: string) {
    setSaving(true);
    try {
      const duplicate = await teamFetch<CustomRole>(`/api/team/custom-roles/${roleId}/duplicate`, {
        method: "POST",
      });
      setCustomRoles((current) => [...current, duplicate]);
      setMessage(`Duplicated as "${duplicate.name}".`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not duplicate the custom role.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(member: TeamMember) {
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(
        `Remove ${member.full_name} from the team? They will lose access to this organization.`,
      );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      await teamFetch(`/api/team/members/${member.id}`, { method: "DELETE" });
      setMembers((current) => current.filter((item) => item.id !== member.id));

      const nextSummary = await teamFetch<TeamSummary>("/api/team/summary");
      setSummary(nextSummary);
      setMessage(`${member.full_name} was removed from the team.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The team member could not be removed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRole(roleId: string, roleName: string) {
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Remove custom role "${roleName}"? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      await teamFetch(`/api/team/custom-roles/${roleId}`, { method: "DELETE" });
      setCustomRoles((current) => current.filter((role) => role.id !== roleId));
      setMessage(`Custom role "${roleName}" was removed.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not remove the custom role.");
    } finally {
      setSaving(false);
    }
  }

  function togglePermission(key: string) {
    setSelectedPermissions((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ));
  }

  function toggleResponsibility(id: string) {
    setResponsibilities((current) => (
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    ));
  }

  if (loading) {
    return (
      <div className="rounded-[32px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-8 text-sm text-[color:var(--sem-text-secondary)]">
        Loading team & permissions…
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="overflow-hidden rounded-[32px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)]">
        <div className="border-b border-[color:var(--cmp-border-subtle)] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="theme-control-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-[18px] border">
                <UsersRound className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Team & Permissions</p>
                <h2 className="mt-2 text-2xl font-semibold text-[color:var(--sem-display-headline)]">
                  Team Members — {summary?.activeCount ?? 0} / {summary?.maxUsers ?? 5}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                  Manage users, roles and access to your organization.
                </p>
              </div>
            </div>
            {summary?.canAddUser ? (
              <button
                type="button"
                onClick={() => setShowAddUser(true)}
                className="theme-control-surface inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold"
              >
                <UserPlus className="h-4 w-4" />
                Add User
              </button>
            ) : (
              <div className="rounded-[18px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {summary?.limitMessage ?? "Your organization has reached its user limit."}
              </div>
            )}
          </div>
        </div>

        {showAddUser ? (
          <div className="m-6 space-y-5 rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-accent-primary)]">Add User</p>
                <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">
                  {addStep === "user" && "Step 1 — User"}
                  {addStep === "responsibilities" && "Step 2 — Responsibilities"}
                  {addStep === "recommendation" && "Recommended access"}
                  {addStep === "customize" && "Customize permissions"}
                  {addStep === "confirm" && "Confirm access"}
                </h3>
              </div>
              <button type="button" onClick={resetAddUserFlow} className="text-sm text-[color:var(--sem-text-muted)]">
                Cancel
              </button>
            </div>

            {addStep === "user" ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-[color:var(--sem-text-secondary)]">Full name</span>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="theme-control-surface w-full rounded-[16px] border px-4 py-3" required />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-[color:var(--sem-text-secondary)]">Email</span>
                  <input value={email} type="email" onChange={(e) => setEmail(e.target.value)} className="theme-control-surface w-full rounded-[16px] border px-4 py-3" required />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-[color:var(--sem-text-secondary)]">Phone</span>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className="theme-control-surface w-full rounded-[16px] border px-4 py-3" />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-[color:var(--sem-text-secondary)]">Temporary password</span>
                  <input value={password} type="password" minLength={8} onChange={(e) => setPassword(e.target.value)} className="theme-control-surface w-full rounded-[16px] border px-4 py-3" required />
                </label>
                <button
                  type="button"
                  disabled={!fullName.trim() || !email.trim() || password.length < 8}
                  onClick={() => setAddStep("responsibilities")}
                  className="theme-control-surface inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold lg:col-span-2"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {addStep === "responsibilities" ? (
              <div className="space-y-4">
                <p className="text-sm text-[color:var(--sem-text-secondary)]">What will this person mainly do?</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {RESPONSIBILITIES.map((item) => (
                    <label key={item.id} className="flex items-center gap-3 rounded-[16px] border border-[color:var(--cmp-border-subtle)] px-4 py-3 text-sm">
                      <input
                        type="checkbox"
                        checked={responsibilities.includes(item.id)}
                        onChange={() => toggleResponsibility(item.id)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleRecommendRole()}
                  className="theme-control-surface inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold"
                >
                  {saving ? "Analyzing…" : "Get recommendation"}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {(addStep === "recommendation" || addStep === "confirm") && recommendation ? (
              <div className="space-y-4">
                <div className="rounded-[20px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] p-4">
                  <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">
                    Recommended Role: {recommendation.label}
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{recommendation.explanation}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {recommendation.preview.map((row) => (
                    <div key={row.group} className="rounded-[14px] border border-[color:var(--cmp-border-subtle)] px-3 py-2 text-sm">
                      <span className="font-medium text-[color:var(--sem-text-primary)]">{row.label}</span>
                      <span className="ml-2 text-[color:var(--sem-text-muted)]">— {row.level}</span>
                    </div>
                  ))}
                </div>
                {addStep === "recommendation" ? (
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setUseCustomPermissions(false);
                        setAddStep("confirm");
                      }}
                      className="theme-control-surface rounded-full border px-5 py-3 text-sm font-semibold"
                    >
                      Use Recommended Role
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUseCustomPermissions(true);
                        setAddStep("customize");
                      }}
                      className="theme-control-surface rounded-full border px-5 py-3 text-sm font-semibold"
                    >
                      Customize Permissions
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleCreateMember()}
                    className="theme-control-surface rounded-full border px-5 py-3 text-sm font-semibold"
                  >
                    {saving ? "Creating…" : "Confirm and create user"}
                  </button>
                )}
              </div>
            ) : null}

            {addStep === "customize" ? (
              <div className="space-y-4">
                {registryGroups.map((group) => (
                  <div key={group.id} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] p-4">
                    <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{group.label}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {group.permissions.map((permission) => (
                        <label key={permission.key} className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(permission.key)}
                            onChange={() => togglePermission(permission.key)}
                          />
                          <span>
                            {permission.label}
                            {permission.sensitive ? (
                              <span className="mt-1 block text-xs text-amber-300">Sensitive permission</span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setAddStep("confirm")}
                  className="theme-control-surface rounded-full border px-5 py-3 text-sm font-semibold"
                >
                  Review and confirm
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mx-6 mb-6 overflow-hidden rounded-[26px] border border-[color:var(--cmp-border-subtle)]">
          <div className="grid grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr_0.7fr] gap-3 border-b border-[color:var(--cmp-border-subtle)] px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)] max-md:hidden">
            <span>Name</span>
            <span>Email</span>
            <span>Role</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          {sortedMembers.map((member) => (
            <div
              key={member.id}
              className="border-b border-[color:var(--cmp-border-subtle)] px-4 py-4 text-sm last:border-b-0 max-md:space-y-2 md:grid md:grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr_0.7fr] md:gap-3 md:items-center"
            >
              <div>
                <p className="font-semibold text-[color:var(--sem-text-primary)]">{member.full_name}</p>
                {member.id === currentProfileId ? (
                  <p className="text-xs text-[color:var(--sem-text-muted)]">You</p>
                ) : null}
              </div>
              <p className="text-[color:var(--sem-text-secondary)]">{member.user?.email ?? "—"}</p>
              <p className="text-[color:var(--sem-text-secondary)]">{member.access_label}</p>
              <p className="capitalize text-[color:var(--sem-text-secondary)]">{member.status}</p>
              <div className="md:text-right">
                {member.id === currentProfileId ? (
                  <span className="text-xs text-[color:var(--sem-text-muted)]">—</span>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleRemoveMember(member)}
                    className="theme-control-surface inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mx-6 mb-6 rounded-[26px] border border-[color:var(--cmp-border-subtle)] p-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-accent-primary)]">Custom Roles</p>
              <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Reusable permission sets</h3>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {customRoles.map((role) => (
              <div key={role.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                <div>
                  <p className="font-medium text-[color:var(--sem-text-primary)]">{role.name}</p>
                  <p className="text-xs text-[color:var(--sem-text-muted)]">{role.permission_keys.length} permissions</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={saving} onClick={() => void handleDuplicateRole(role.id)} className="theme-control-surface rounded-full border px-3 py-2 text-xs">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleDeleteRole(role.id, role.name)}
                    className="theme-control-surface inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={newCustomRoleName}
              onChange={(e) => setNewCustomRoleName(e.target.value)}
              placeholder="New custom role name"
              className="theme-control-surface flex-1 rounded-[14px] border px-4 py-3 text-sm"
            />
            <button
              type="button"
              disabled={saving || !newCustomRoleName.trim() || selectedPermissions.length === 0}
              onClick={() => void handleCreateCustomRole()}
              className="theme-control-surface rounded-full border px-5 py-3 text-sm font-semibold"
            >
              Save custom role from selection
            </button>
          </div>
          <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">
            Select permissions in the Add User customize step, then save them as a reusable custom role.
          </p>
        </div>

        {message ? <p className="mx-6 mb-4 text-sm text-[color:var(--sem-accent-primary)]">{message}</p> : null}
        {errorMessage ? <p className="mx-6 mb-4 text-sm text-red-400">{errorMessage}</p> : null}
      </section>

      <aside className="rounded-[30px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] p-5">
        <LockKeyhole className="h-8 w-8 text-[color:var(--sem-accent-primary)]" />
        <h4 className="mt-4 text-xl font-semibold text-[color:var(--sem-display-headline)]">System roles</h4>
        <p className="mt-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
          Owner, Admin, Office / CSR, Dispatcher, and Technician presets are locked. Custom roles let you reuse tailored access models.
        </p>
        <div className="mt-5 space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
          <p>Owner — Locked</p>
          <p>Admin — Locked</p>
          <p>Office / CSR — Locked</p>
          <p>Dispatcher — Locked</p>
          <p>Technician — Locked</p>
        </div>
      </aside>
    </div>
  );
}
