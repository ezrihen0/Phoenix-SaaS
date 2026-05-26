"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, CreditCard, Palette, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

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
  initialTopic?: SettingsTopic | null;
};

function isSettingsTopic(value: string | null): value is SettingsTopic {
  return value === "business"
    || value === "profile"
    || value === "appearance"
    || value === "roles"
    || value === "billing";
}

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
  initialTopic = null,
}: SettingsWorkspaceProps) {
  const t = useTranslations("settings");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const topicParam = searchParams.get("topic");
  const selectedTopic = isSettingsTopic(topicParam)
    ? topicParam
    : isSettingsTopic(initialTopic)
      ? initialTopic
      : null;
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
  const activeTopic = topics.find((topic) => topic.id === selectedTopic) ?? null;

  function selectTopic(topic: SettingsTopic) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("topic", topic);
    router.replace(`${pathname}?${params.toString()}`);
  }

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

      <section className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
          <p className="px-2 text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{t("label")}</p>
          <nav className="mt-3 space-y-1">
            {topics.map(({ id, label, Icon }) => {
              const selected = selectedTopic === id;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectTopic(id)}
                  aria-current={selected ? "page" : undefined}
                  className={[
                    selected ? "theme-selected-card" : "theme-control-surface-soft",
                    "flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)]",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4 shrink-0 text-[color:var(--sem-accent-primary)]" />
                  <span>{label}</span>
                </button>
              );
            })}
            <Link
              href="/language-store"
              className="theme-control-surface-soft mt-2 flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)]"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-[color:var(--sem-accent-primary)]" />
              <span>{t("openLanguageStore")}</span>
            </Link>
          </nav>
        </aside>

        <div className="min-w-0 space-y-4">
          {activeTopic ? (
            <div className="theme-control-surface-soft rounded-[24px] border px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-accent-primary)]">{activeTopic.label}</p>
              <h2 className="mt-1 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{activeTopic.title}</h2>
              <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{activeTopic.helper}</p>
            </div>
          ) : (
            <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
              {t("chooseClosedCube")}
            </section>
          )}

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
      ) : null}
        </div>
      </section>
    </div>
  );
}
