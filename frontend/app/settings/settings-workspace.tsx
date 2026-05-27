"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  ChevronRight,
  CreditCard,
  Languages,
  LayoutDashboard,
  LockKeyhole,
  Palette,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, type ReactNode } from "react";

import { BoardShell } from "@/components/board/board-shell";
import { DesktopOptimizedNotice } from "@/components/mobile/desktop-optimized-notice";
import { MetricTile } from "@/components/board/metric-tile";
import { ThemeAppearanceSelector } from "@/components/theme-appearance-selector";
import type { SessionRole } from "@/lib/auth/server-session";

import type { BillingSummaryPayload } from "./billing-panel";
import { BillingPanel } from "./billing-panel";
import { OrganizationProfilePanel, type OrganizationSettings } from "./organization-profile-panel";
import { RoleManagementPanel } from "./role-management-panel";
import {
  getVisibleSections,
  isSettingsTopic,
  resolveSectionLabels,
  resolveSettingsMetrics,
  SETTINGS_SECTIONS,
  type SettingsSectionConfig,
  type SettingsTopicId,
} from "./settings-sections";

const SHOW_LEGACY_SETTINGS = false;

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

type SettingsWorkspaceProps = {
  role: SessionRole;
  ownerMode: boolean;
  currentProfileId: string | null;
  staffProfiles: StaffProfile[];
  staffLoadError: string | null;
  organizationSettings: OrganizationSettings;
  billingSummary: BillingSummaryPayload | null;
  billingLoadError: string | null;
  profileFullName: string | null;
  profileEmail: string | null;
  activeOrganizationName: string | null;
  initialTopic?: SettingsTopicId | null;
};

function formatRoleLabel(role: string) {
  return role.replace(/_/g, " ");
}

function profileInitials(fullName: string | null, displayInitials: string | null) {
  if (displayInitials?.trim()) {
    return displayInitials.trim().slice(0, 2).toUpperCase();
  }

  if (!fullName?.trim()) {
    return "?";
  }

  return fullName
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type SettingsPanelContext = {
  role: SessionRole;
  ownerMode: boolean;
  currentProfileId: string | null;
  staffProfiles: StaffProfile[];
  staffLoadError: string | null;
  organizationSettings: OrganizationSettings;
  billingSummary: BillingSummaryPayload | null;
  billingLoadError: string | null;
  profileFullName: string | null;
  profileEmail: string | null;
  activeOrganizationName: string | null;
  t: ReturnType<typeof useTranslations<"settings">>;
};

function SettingsLockedState({
  eyebrow,
  title,
  body,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  body: string;
  icon: typeof ShieldCheck;
}) {
  return (
    <section className="rounded-[30px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-6 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)]">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{eyebrow}</p>
          <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-display-headline)]">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{body}</p>
        </div>
      </div>
    </section>
  );
}

function SettingsExternalLinkPanel({
  title,
  description,
  buttonLabel,
  href,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  href: string;
}) {
  return (
    <section className="rounded-[30px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-6 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)]">
      <div className="rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
              <Languages className="h-6 w-6" />
            </span>
            <div>
              <h4 className="text-xl font-semibold text-[color:var(--sem-display-headline)]">{title}</h4>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">{description}</p>
            </div>
          </div>
          <Link
            href={href}
            className="flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] px-4 py-3 text-sm font-semibold text-[color:var(--sem-accent-primary)] transition hover:bg-[color:var(--cmp-surface-soft)]"
          >
            {buttonLabel}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function SettingsProfilePanel({ ctx }: { ctx: SettingsPanelContext }) {
  const { role, ownerMode, profileFullName, profileEmail, activeOrganizationName, organizationSettings, t } = ctx;
  const initials = profileInitials(profileFullName, organizationSettings.displayInitials);
  const organizationLabel = organizationSettings.businessName?.trim()
    || activeOrganizationName?.trim()
    || t("unnamedOrganization");

  return (
    <section className="rounded-[30px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)]">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5 md:col-span-1">
          <div className="flex h-20 w-20 items-center justify-center rounded-[28px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] text-2xl font-semibold text-[color:var(--sem-accent-primary)]">
            {initials}
          </div>
          <h4 className="mt-5 text-xl font-semibold text-[color:var(--sem-display-headline)]">
            {profileFullName?.trim() || t("profile.unnamedUser")}
          </h4>
          <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{profileEmail ?? "—"}</p>
          <span className="mt-4 inline-flex rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] px-3 py-1 text-xs font-semibold capitalize text-[color:var(--sem-accent-primary)]">
            {formatRoleLabel(role)}
          </span>
        </div>
        <div className="rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5 md:col-span-2">
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">{t("profile.accessSummary")}</p>
          <h4 className="mt-2 text-xl font-semibold text-[color:var(--sem-display-headline)]">
            {ownerMode ? t("profile.ownerToolsEnabled") : t("profile.ownerToolsLocked")}
          </h4>
          <p className="mt-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{t("profile.accessSummaryBody")}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{t("profile.currentOrganization")}</p>
              <p className="mt-2 text-sm font-medium text-[color:var(--sem-text-primary)]">{organizationLabel}</p>
            </div>
            <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{t("profile.role")}</p>
              <p className="mt-2 text-sm font-medium capitalize text-[color:var(--sem-text-primary)]">{formatRoleLabel(role)}</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{t("profile.helper")}</p>
        </div>
      </div>
    </section>
  );
}

function SettingsAppearancePanel({ ctx }: { ctx: SettingsPanelContext }) {
  const { t } = ctx;

  return (
    <section className="rounded-[30px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)]">
      <div className="mb-5 flex items-center gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
          <Palette className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{t("appearance.label")}</p>
          <h3 className="mt-1 text-xl font-semibold text-[color:var(--sem-display-headline)]">{t("appearance.title")}</h3>
        </div>
      </div>
      <ThemeAppearanceSelector />
    </section>
  );
}

function renderSettingsPanel(sectionId: SettingsTopicId, ctx: SettingsPanelContext): ReactNode {
  const { ownerMode, currentProfileId, staffLoadError, staffProfiles, organizationSettings, billingSummary, billingLoadError, role, t } = ctx;

  switch (sectionId) {
    case "business":
      return (
        <OrganizationProfilePanel
          initialSettings={organizationSettings}
          ownerMode={ownerMode}
          billingSummary={billingSummary}
        />
      );
    case "profile":
      return <SettingsProfilePanel ctx={ctx} />;
    case "appearance":
      return <SettingsAppearancePanel ctx={ctx} />;
    case "billing":
      return <BillingPanel initial={billingSummary} loadError={billingLoadError} />;
    case "languages":
      return (
        <SettingsExternalLinkPanel
          title={t("languages.standbyTitle")}
          description={t("languages.standbyDescription")}
          buttonLabel={t("openLanguageStore")}
          href="/language-store"
        />
      );
    case "roles":
      if (ownerMode && currentProfileId) {
        if (staffLoadError) {
          return (
            <SettingsLockedState
              icon={ShieldCheck}
              eyebrow={t("roles.label")}
              title={t("roles.unavailable")}
              body={staffLoadError}
            />
          );
        }

        return (
          <RoleManagementPanel
            initialStaff={staffProfiles}
            currentProfileId={currentProfileId}
          />
        );
      }

      return (
        <SettingsLockedState
          icon={LockKeyhole}
          eyebrow={t("roles.label")}
          title={t("roles.ownerOnlyTitle")}
          body={t("roles.ownerOnlyBody", { role: formatRoleLabel(role) })}
        />
      );
    default:
      return null;
  }
}

function SettingsNavItem({
  section,
  selected,
  labels,
  onSelect,
}: {
  section: SettingsSectionConfig;
  selected: boolean;
  labels: { label: string; helper: string };
  onSelect: (topic: SettingsTopicId) => void;
}) {
  const Icon = section.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(section.id)}
      aria-current={selected ? "page" : undefined}
      className={cx(
        "group flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
        selected
          ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-accent-primary)] shadow-[0_0_28px_color-mix(in_srgb,var(--sem-accent-primary)_12%,transparent)]"
          : "border-transparent bg-transparent text-[color:var(--sem-text-secondary)] hover:border-[color:var(--cmp-border-subtle)] hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)]",
      )}
    >
      <span
        className={cx(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
          selected
            ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)]"
            : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{labels.label}</span>
        <span className="mt-0.5 block truncate text-xs opacity-70">{labels.helper}</span>
      </span>
      <ChevronRight className={cx("h-4 w-4 transition", selected ? "opacity-90" : "opacity-20 group-hover:opacity-70")} />
    </button>
  );
}

function BusinessControlCenterWorkspace(props: SettingsWorkspaceProps) {
  const {
    role,
    ownerMode,
    currentProfileId,
    staffProfiles,
    staffLoadError,
    organizationSettings,
    billingSummary,
    billingLoadError,
    profileFullName,
    profileEmail,
    activeOrganizationName,
    initialTopic = null,
  } = props;

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

  const visibleSections = useMemo(
    () => getVisibleSections(SETTINGS_SECTIONS, ownerMode),
    [ownerMode],
  );

  const activeSection = visibleSections.find((section) => section.id === selectedTopic) ?? null;
  const activeLabels = activeSection ? resolveSectionLabels(activeSection, t) : null;
  const lockedDeepLinkSection = selectedTopic && !ownerMode
    ? SETTINGS_SECTIONS.find((section) => section.id === selectedTopic && section.ownerOnlyNav) ?? null
    : null;
  const lockedDeepLinkLabels = lockedDeepLinkSection
    ? resolveSectionLabels(lockedDeepLinkSection, t)
    : null;

  const metrics = useMemo(
    () => resolveSettingsMetrics({
      t,
      ownerMode,
      organizationBusinessName: organizationSettings.businessName,
      staffCount: ownerMode ? staffProfiles.length : null,
      staffLoadError,
    }),
    [t, ownerMode, organizationSettings.businessName, staffProfiles.length, staffLoadError],
  );

  const orgInitials = profileInitials(
    organizationSettings.businessName,
    organizationSettings.displayInitials,
  );
  const orgDisplayName = organizationSettings.businessName?.trim()
    || activeOrganizationName?.trim()
    || t("unnamedOrganization");

  const panelContext: SettingsPanelContext = {
    role,
    ownerMode,
    currentProfileId,
    staffProfiles,
    staffLoadError,
    organizationSettings,
    billingSummary,
    billingLoadError,
    profileFullName,
    profileEmail,
    activeOrganizationName,
    t,
  };

  function selectTopic(topic: SettingsTopicId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("topic", topic);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-[1540px] px-5 py-6 lg:px-8">
        <DesktopOptimizedNotice href="/settings" />
        <header className="rounded-[36px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] backdrop-blur-xl">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
                  <LayoutDashboard className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-[0.34em] text-[color:var(--sem-accent-primary)]">{t("controlCenterEyebrow")}</p>
                  <p className="mt-1 text-sm text-[color:var(--sem-text-muted)]">{t("controlCenterMeta")}</p>
                </div>
              </div>
              <h1 className="mt-5 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] md:text-5xl">
                {t("label")}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">{t("controlCenterDescription")}</p>
            </div>
            <div className="rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] text-lg font-semibold text-[color:var(--sem-accent-primary)]">
                  {orgInitials}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[color:var(--sem-display-headline)]">{orgDisplayName}</p>
                  <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">
                    {ownerMode ? t("profile.ownerToolsEnabled") : t("profile.ownerToolsLocked")}
                  </p>
                </div>
                {ownerMode ? <BadgeCheck className="h-5 w-5 shrink-0 text-[color:var(--sem-accent-primary)]" /> : null}
              </div>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricTile
              key={metric.metricKey}
              icon={metric.icon}
              label={metric.label}
              value={metric.value}
              helper={metric.helper}
            />
          ))}
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="h-fit rounded-[34px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-4 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)] backdrop-blur-xl lg:sticky lg:top-6">
            <div className="-mx-1 flex flex-col gap-2 overflow-x-auto pb-1 md:flex-row md:overflow-visible xl:flex-col xl:pb-0">
            <p className="hidden px-2 pb-3 text-xs uppercase tracking-[0.3em] text-[color:var(--sem-text-muted)] xl:block">{t("navEyebrow")}</p>
            <nav className="flex gap-2 overflow-x-auto xl:block xl:space-y-2 xl:overflow-visible">
              {visibleSections.map((section) => {
                const labels = resolveSectionLabels(section, t);
                return (
                  <SettingsNavItem
                    key={section.id}
                    section={section}
                    selected={selectedTopic === section.id}
                    labels={{ label: labels.label, helper: labels.helper }}
                    onSelect={selectTopic}
                  />
                );
              })}
            </nav>
            </div>
          </aside>

          <section className="min-w-0 rounded-[34px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)] backdrop-blur-xl">
            {activeSection && activeLabels ? (
              <>
                <div className="mb-5 flex flex-col gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--sem-text-muted)]">{t("currentWorkspace")}</p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">{activeLabels.label}</h2>
                    <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{activeLabels.helper}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] px-3 py-1 text-xs font-semibold capitalize text-[color:var(--sem-accent-primary)]">
                      {t("roleBadge", { role: formatRoleLabel(role) })}
                    </span>
                    {activeSection.kind === "external-link" && activeSection.externalHref ? (
                      <Link
                        href={activeSection.externalHref}
                        className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)]"
                      >
                        {t("openLanguageStore")}
                      </Link>
                    ) : (
                      <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--sem-text-secondary)]">
                        {t("deepLinkReady")}
                      </span>
                    )}
                  </div>
                </div>
                {selectedTopic ? renderSettingsPanel(selectedTopic, panelContext) : null}
              </>
            ) : lockedDeepLinkSection && lockedDeepLinkLabels ? (
              <>
                <div className="mb-5 flex flex-col gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--sem-text-muted)]">{t("currentWorkspace")}</p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">{lockedDeepLinkLabels.label}</h2>
                    <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{lockedDeepLinkLabels.helper}</p>
                  </div>
                  <span className="rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] px-3 py-1 text-xs font-semibold capitalize text-[color:var(--sem-accent-primary)]">
                    {t("roleBadge", { role: formatRoleLabel(role) })}
                  </span>
                </div>
                <SettingsLockedState
                  icon={CreditCard}
                  eyebrow={lockedDeepLinkLabels.label}
                  title={t("billing.ownerOnlyTitle")}
                  body={t("billing.ownerOnlyBody", { role: formatRoleLabel(role) })}
                />
              </>
            ) : (
              <section className="rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-6 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                {t("chooseSection")}
              </section>
            )}
          </section>
        </div>
      </div>
    </BoardShell>
  );
}

function LegacySettingsWorkspace(props: SettingsWorkspaceProps) {
  const {
    role,
    ownerMode,
    currentProfileId,
    staffProfiles,
    staffLoadError,
    organizationSettings,
    billingSummary,
    billingLoadError,
    initialTopic = null,
  } = props;

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

  function selectTopic(topic: SettingsTopicId) {
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

              {selectedTopic === "languages" ? (
                <SettingsExternalLinkPanel
                  title={t("languages.standbyTitle")}
                  description={t("languages.standbyDescription")}
                  buttonLabel={t("openLanguageStore")}
                  href="/language-store"
                />
              ) : null}
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function SettingsWorkspace(props: SettingsWorkspaceProps) {
  if (SHOW_LEGACY_SETTINGS) {
    return <LegacySettingsWorkspace {...props} />;
  }

  return <BusinessControlCenterWorkspace {...props} />;
}
