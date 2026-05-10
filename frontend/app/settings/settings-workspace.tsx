"use client";

import { Building2, Palette, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";

import { ThemeAppearanceSelector } from "@/components/theme-appearance-selector";
import type { SessionRole } from "@/lib/auth/server-session";

import { OrganizationProfilePanel, type OrganizationSettings } from "./organization-profile-panel";
import { RoleManagementPanel } from "./role-management-panel";

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

type SettingsTopic = "business" | "profile" | "appearance" | "roles";

type SettingsWorkspaceProps = {
  role: SessionRole;
  ownerMode: boolean;
  currentProfileId: string | null;
  staffProfiles: StaffProfile[];
  staffLoadError: string | null;
  organizationSettings: OrganizationSettings;
};

const topics: Array<{
  id: SettingsTopic;
  label: string;
  title: string;
  helper: string;
  Icon: typeof UserRound;
}> = [
  {
    id: "business",
    label: "Business",
    title: "Organization profile",
    helper: "Manage the company name, initials, and contact details printed on invoices and estimates.",
    Icon: Building2,
  },
  {
    id: "profile",
    label: "Profile",
    title: "Account identity",
    helper: "View the staff identity and current role on this session.",
    Icon: UserRound,
  },
  {
    id: "appearance",
    label: "Appearance",
    title: "Display style",
    helper: "Change browser-local theme preferences for this device.",
    Icon: Palette,
  },
  {
    id: "roles",
    label: "Owner Panel",
    title: "Staff roles",
    helper: "Create staff logins and assign fixed Role Mode V1 roles.",
    Icon: ShieldCheck,
  },
];

function formatRoleLabel(role: string) {
  return role.replace("_", " ");
}

export function SettingsWorkspace({
  role,
  ownerMode,
  currentProfileId,
  staffProfiles,
  staffLoadError,
  organizationSettings,
}: SettingsWorkspaceProps) {
  const [selectedTopic, setSelectedTopic] = useState<SettingsTopic | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="theme-surface-modal overflow-hidden rounded-[36px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)]">
        <div className="grid gap-6 p-7 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:p-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">
              <Sparkles className="h-3.5 w-3.5" />
              Settings
            </div>
            <h1 className="mt-5 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
              Workspace control center
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
              Choose a settings cube below. Each topic stays closed until you open it.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="theme-control-surface-soft rounded-[22px] border px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Current Role</p>
              <p className="mt-2 text-sm font-semibold capitalize text-[color:var(--sem-text-primary)]">{formatRoleLabel(role)}</p>
            </div>
            <div className="theme-control-surface-soft rounded-[22px] border px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Owner Tools</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{ownerMode ? "Enabled" : "Locked"}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {topics.map(({ id, label, title, helper, Icon }) => {
          const selected = selectedTopic === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedTopic((current) => (current === id ? null : id))}
              aria-pressed={selected}
              className={[
                selected ? "theme-selected-card" : "theme-control-surface",
                "group min-h-44 rounded-[30px] border p-5 text-left transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="theme-control-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-[18px] border">
                  <Icon className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
                </div>
                <span className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
                  {selected ? "Open" : "Closed"}
                </span>
              </div>
              <p className="mt-5 text-[11px] uppercase tracking-[0.26em] text-[color:var(--sem-accent-primary)]">{label}</p>
              <h2 className="mt-2 text-xl font-semibold text-[color:var(--sem-text-primary)]">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{helper}</p>
            </button>
          );
        })}
      </section>

      {selectedTopic ? (
        <section>
          {selectedTopic === "profile" ? (
            <article className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
              <div className="flex items-center gap-3">
                <div className="theme-control-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-[18px] border">
                  <UserRound className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Profile</p>
                  <h2 className="mt-1 text-xl font-semibold text-[color:var(--sem-text-primary)]">Account identity</h2>
                </div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="theme-control-surface-soft rounded-[22px] border px-4 py-4">
                  <p className="text-sm text-[color:var(--sem-text-muted)]">Role</p>
                  <p className="mt-2 inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-3 py-1 text-xs font-semibold capitalize tracking-[0.12em] text-[color:var(--sem-text-primary)]">
                    {formatRoleLabel(role)}
                  </p>
                </div>
              </div>
              <div className="theme-control-surface-soft mt-4 rounded-[20px] border px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                Role changes are enforced by backend permissions. Appearance preferences stay scoped to this browser.
              </div>
            </article>
          ) : null}

          {selectedTopic === "business" ? (
            <OrganizationProfilePanel initialSettings={organizationSettings} />
          ) : null}

          {selectedTopic === "appearance" ? (
            <article className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
              <div className="flex items-center gap-3">
                <div className="theme-control-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-[18px] border">
                  <Palette className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Appearance</p>
                  <h2 className="mt-1 text-xl font-semibold text-[color:var(--sem-text-primary)]">Display style</h2>
                </div>
              </div>
              <div className="mt-5">
                <ThemeAppearanceSelector />
              </div>
            </article>
          ) : null}

          {selectedTopic === "roles" ? (
            ownerMode && currentProfileId ? (
              staffLoadError ? (
                <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Owner Panel</p>
                  <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Staff roles unavailable</h2>
                  <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{staffLoadError}</p>
                </section>
              ) : (
                <RoleManagementPanel
                  initialStaff={staffProfiles}
                  currentProfileId={currentProfileId}
                />
              )
            ) : (
              <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
                <div className="flex items-start gap-3">
                  <div className="theme-control-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-[18px] border">
                    <ShieldCheck className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Owner Panel</p>
                    <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Staff roles are owner-only</h2>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                  Your current role is {formatRoleLabel(role)}. The staff role creation panel appears here after this account is promoted to owner.
                </p>
              </section>
            )
          ) : null}
        </section>
      ) : (
        <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
          Choose one closed cube above to open that settings topic.
        </section>
      )}
    </div>
  );
}
