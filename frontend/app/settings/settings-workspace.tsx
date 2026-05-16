"use client";

import Link from "next/link";
import { Building2, CreditCard, Palette, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ThemeAppearanceSelector } from "@/components/theme-appearance-selector";
import type { SessionRole } from "@/lib/auth/server-session";

import type { BillingSummaryPayload } from "./billing-panel";
import { BillingPanel } from "./billing-panel";
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

type SettingsTopic = "business" | "profile" | "appearance" | "roles" | "billing";

type SettingsWorkspaceProps = {
  role: SessionRole;
  ownerMode: boolean;
  currentProfileId: string | null;
  staffProfiles: StaffProfile[];
  staffLoadError: string | null;
  organizationSettings: OrganizationSettings;
  billingSummary: BillingSummaryPayload | null;
  billingLoadError: string | null;
};

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
  billingSummary,
  billingLoadError,
}: SettingsWorkspaceProps) {
  const t = useTranslations("settings");
  const [selectedTopic, setSelectedTopic] = useState<SettingsTopic | null>(null);
  const allTopics = useMemo(() => ([
    {
      id: "business" as const,
      label: t("business.label"),
      title: t("business.title"),
      helper: t("business.helper"),
      Icon: Building2,
    },
    {
      id: "profile" as const,
      label: t("profile.label"),
      title: t("profile.title"),
      helper: t("profile.helper"),
      Icon: UserRound,
    },
    {
      id: "appearance" as const,
      label: t("appearance.label"),
      title: t("appearance.title"),
      helper: t("appearance.helper"),
      Icon: Palette,
    },
    {
      id: "roles" as const,
      label: t("roles.label"),
      title: t("roles.title"),
      helper: t("roles.helper"),
      Icon: ShieldCheck,
    },
    {
      id: "billing" as const,
      label: t("billing.label"),
      title: t("billing.title"),
      helper: t("billing.helper"),
      Icon: CreditCard,
      ownerOnly: true,
    },
  ]), [t]);
  const topics = ownerMode ? allTopics : allTopics.filter((topic) => !topic.ownerOnly);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="theme-surface-modal overflow-hidden rounded-[36px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)]">
        <div className="grid gap-6 p-7 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:p-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">
              <Sparkles className="h-3.5 w-3.5" />
              {t("label")}
            </div>
            <h1 className="mt-5 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
              {t("title")}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
              {t("description")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="theme-control-surface-soft rounded-[22px] border px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{t("currentRole")}</p>
              <p className="mt-2 text-sm font-semibold capitalize text-[color:var(--sem-text-primary)]">{formatRoleLabel(role)}</p>
            </div>
            <div className="theme-control-surface-soft rounded-[22px] border px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{t("ownerTools")}</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{ownerMode ? t("enabled") : t("locked")}</p>
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
                  {selected ? t("open") : t("closed")}
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
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{t("profile.label")}</p>
                  <h2 className="mt-1 text-xl font-semibold text-[color:var(--sem-text-primary)]">{t("profile.title")}</h2>
                </div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="theme-control-surface-soft rounded-[22px] border px-4 py-4">
                  <p className="text-sm text-[color:var(--sem-text-muted)]">{t("profile.role")}</p>
                  <p className="mt-2 inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-3 py-1 text-xs font-semibold capitalize tracking-[0.12em] text-[color:var(--sem-text-primary)]">
                    {formatRoleLabel(role)}
                  </p>
                </div>
              </div>
              <div className="theme-control-surface-soft mt-4 rounded-[20px] border px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                {t("profile.helper")}
              </div>
            </article>
          ) : null}

          {selectedTopic === "business" ? (
            <OrganizationProfilePanel
              initialSettings={organizationSettings}
              ownerMode={ownerMode}
              billingSummary={billingSummary}
            />
          ) : null}

          {selectedTopic === "appearance" ? (
            <article className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
              <div className="flex items-center gap-3">
                <div className="theme-control-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-[18px] border">
                  <Palette className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{t("appearance.label")}</p>
                  <h2 className="mt-1 text-xl font-semibold text-[color:var(--sem-text-primary)]">{t("appearance.title")}</h2>
                </div>
              </div>
              <div className="mt-5">
                <ThemeAppearanceSelector />
              </div>
            </article>
          ) : null}

          {selectedTopic === "billing" ? (
            <BillingPanel initial={billingSummary} loadError={billingLoadError} />
          ) : null}

          {selectedTopic === "roles" ? (
            ownerMode && currentProfileId ? (
              staffLoadError ? (
                <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{t("roles.label")}</p>
                  <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{t("roles.unavailable")}</h2>
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
                    <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{t("roles.label")}</p>
                    <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{t("roles.ownerOnlyTitle")}</h2>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                  {t("roles.ownerOnlyBody", { role: formatRoleLabel(role) })}
                </p>
              </section>
            )
          ) : null}
        </section>
      ) : (
        <div className="space-y-4">
          <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            {t("chooseClosedCube")}
          </section>

          <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Language Store</p>
                <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{t("languageStoreTitle")}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                  {t("languageStoreDescription")}
                </p>
              </div>
              <Link
                href="/language-store"
                className="theme-control-surface inline-flex items-center justify-center rounded-full border px-5 py-3 text-sm font-semibold transition hover:border-[color:var(--cmp-border-accent)]"
              >
                {t("openLanguageStore")}
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
