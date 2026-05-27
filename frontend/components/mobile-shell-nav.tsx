"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  FileText,
  LogOut,
  Plus,
  Receipt,
  type LucideProps,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { handleLogout } from "@/lib/auth/logout";
import {
  MOBILE_MORE_MENU_SECTIONS,
  type MobileMoreMenuSectionId,
} from "@/lib/navigation/mobile-more-menu";
import {
  getMobileModulePolicyBadge,
  getMobileModulePolicy,
} from "@/lib/navigation/mobile-module-policy";
import {
  isRouteActive,
} from "@/lib/navigation/mobile-shell-nav";

type ShellNavIcon = ComponentType<LucideProps>;

export type MobileShellNavItem = {
  href: string;
  label: string;
  icon: ShellNavIcon;
};

type MobileShellNavProps = {
  primaryItems: MobileShellNavItem[];
  navCatalog: MobileShellNavItem[];
  /** Role-filtered nav without injected settings/billing — used for empty-state detection. */
  roleNavCatalog: MobileShellNavItem[];
  userLabel: string;
  userInitials: string;
  moreOpen: boolean;
  onMoreOpen: () => void;
  onMoreClose: () => void;
};

function MobileNavTab({
  href,
  label,
  icon: Icon,
  active,
}: MobileShellNavItem & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center px-0.5 py-1"
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute -top-1 h-1 w-5 rounded-full bg-[color:var(--sem-accent-primary)]"
        />
      ) : null}
      <Icon
        className={[
          "h-5 w-5 shrink-0 transition-transform",
          active
            ? "scale-110 text-[color:var(--sem-text-primary)]"
            : "text-[color:var(--sem-text-muted)]",
        ].join(" ")}
      />
      <span
        className={[
          "mt-1 max-w-full truncate text-[10px] font-medium tracking-wide max-[380px]:text-[9px]",
          active
            ? "font-semibold text-[color:var(--sem-text-primary)]"
            : "text-[color:var(--sem-text-muted)]",
        ].join(" ")}
      >
        {label}
      </span>
    </Link>
  );
}

function MoreNavLink({
  item,
  active,
  onNavigate,
}: {
  item: MobileShellNavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const policy = getMobileModulePolicy(item.href);
  const badge = getMobileModulePolicyBadge(policy);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={[
        active ? "theme-selected-card" : "theme-control-surface",
        "relative flex min-h-12 items-center gap-3 rounded-[16px] border px-3 py-2.5 text-left transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]",
      ].join(" ")}
    >
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)]">
        <Icon className="h-4 w-4 shrink-0" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
      {badge ? (
        <span className="shrink-0 rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[color:var(--sem-text-muted)]">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function sectionLabelKey(sectionId: MobileMoreMenuSectionId) {
  return `shell.mobile.moreSections.${sectionId}` as const;
}

function resolveMoreMenuLabel(href: string, fallbackLabel: string) {
  switch (href) {
    case "/jobs":
      return "All Jobs";
    case "/invoices":
      return "All Invoices";
    case "/estimates":
      return "All Estimates";
    case "/inspections":
      return "All Inspections";
    case "/customers":
      return "All Customers";
    default:
      return fallbackLabel;
  }
}

function QuickActionLink({
  href,
  label,
  icon: Icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ShellNavIcon;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="theme-control-surface group flex items-center gap-2 rounded-[14px] border px-3 py-2 text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
    >
      <span className="theme-control-surface-soft inline-flex h-7 w-7 items-center justify-center rounded-lg border">
        <Icon className="h-4 w-4" />
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function MobileShellNav({
  navCatalog,
  roleNavCatalog,
  userLabel,
  userInitials,
  moreOpen,
  onMoreClose,
}: MobileShellNavProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const workspaceSectionRef = useRef<HTMLDivElement | null>(null);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);

  const navByHref = useMemo(
    () => new Map(navCatalog.map((item) => [item.href, item])),
    [navCatalog],
  );

  const roleNavByHref = useMemo(
    () => new Map(roleNavCatalog.map((item) => [item.href, item])),
    [roleNavCatalog],
  );

  const visibleSecondaryMoreHrefs = useMemo(
    () => MOBILE_MORE_MENU_SECTIONS
      .filter((section) => section.id !== "workspace")
      .flatMap((section) =>
        section.links
          .map((link) => link.href)
          .filter((href) => roleNavByHref.has(href)),
      ),
    [roleNavByHref],
  );

  const visibleSecondaryMoreLinkCount = visibleSecondaryMoreHrefs.length;

  const canCreateEstimate = navByHref.has("/estimates");
  const canCreateInvoice = navByHref.has("/invoices");
  const homeItem = navByHref.get("/home");
  const scheduleItem = navByHref.get("/schedule");
  const callsItem = navByHref.get("/calls");
  const messagingItem = navByHref.get("/messaging");
  const quickActions = useMemo(() => {
    const actions: Array<{ href: string; label: string; icon: ShellNavIcon }> = [];

    if (canCreateInvoice) {
      actions.push({
        href: "/invoices/new",
        label: t("invoicesPage.newInvoice"),
        icon: Receipt,
      });
    }

    if (canCreateEstimate) {
      actions.push({
        href: "/estimates/new",
        label: t("estimatesPage.newEstimate"),
        icon: FileText,
      });
    }

    return actions;
  }, [canCreateEstimate, canCreateInvoice, t]);
  const canShowQuickActions = quickActions.length > 0;

  useEffect(() => {
    if (!moreOpen || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [moreOpen]);

  useEffect(() => {
    setQuickActionsOpen(false);
  }, [pathname, moreOpen]);

  return (
    <>
      {quickActionsOpen ? (
        <button
          type="button"
          aria-label={t("common.actions.close")}
          className="fixed inset-0 z-40 bg-transparent lg:hidden"
          onClick={() => setQuickActionsOpen(false)}
        />
      ) : null}

      <nav
        aria-label={t("shell.mobile.bottomNavigation")}
        className="fixed inset-x-0 bottom-0 z-40 px-2 pb-[calc(0.6rem+env(safe-area-inset-bottom))] lg:hidden"
      >
        <div className="relative mx-auto max-w-lg rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--sem-board-glass)] shadow-[0_-18px_48px_color-mix(in_srgb,var(--bg-canvas)_52%,transparent)] backdrop-blur-xl">
          {canShowQuickActions ? (
            <>
              {quickActionsOpen ? (
                <div className="absolute inset-x-4 bottom-[calc(100%+0.75rem)] z-50 space-y-2 rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-modal)] p-3 shadow-[0_20px_50px_color-mix(in_srgb,var(--bg-canvas)_65%,transparent)]">
                  {quickActions.map((action) => (
                    <QuickActionLink
                      key={action.href}
                      href={action.href}
                      label={action.label}
                      icon={action.icon}
                      onNavigate={() => setQuickActionsOpen(false)}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          <div className="mx-auto grid max-w-lg grid-cols-5 items-end gap-0.5 px-1 pb-1 pt-3">
            {homeItem ? (
              <MobileNavTab
                {...homeItem}
                active={Boolean(pathname && isRouteActive(pathname, homeItem.href))}
              />
            ) : (
              <div className="min-h-11 min-w-11" />
            )}
            {scheduleItem ? (
              <MobileNavTab
                {...scheduleItem}
                active={Boolean(pathname && isRouteActive(pathname, scheduleItem.href))}
              />
            ) : (
              <div className="min-h-11 min-w-11" />
            )}

            <button
              type="button"
              disabled={!canShowQuickActions}
              aria-expanded={quickActionsOpen}
              aria-haspopup="menu"
              aria-label="Add"
              onClick={() => {
                if (!canShowQuickActions) {
                  return;
                }
                onMoreClose();
                setQuickActionsOpen((current) => !current);
              }}
              className="relative flex min-h-11 min-w-11 flex-col items-center justify-end px-0.5 py-1"
            >
              {quickActionsOpen ? (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 h-1 w-5 rounded-full bg-[color:var(--sem-accent-primary)]"
                />
              ) : null}
              <span
                className={[
                  "mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl border shadow-[0_12px_26px_color-mix(in_srgb,var(--bg-canvas)_62%,transparent)] transition",
                  quickActionsOpen
                    ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-card)] text-[color:var(--sem-accent-primary)]"
                    : canShowQuickActions
                      ? "theme-control-surface text-[color:var(--sem-text-primary)] hover:border-[color:var(--cmp-border-accent)]"
                      : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-text-muted)] opacity-70",
                ].join(" ")}
              >
                <Plus
                  aria-hidden="true"
                  className={["h-5 w-5 shrink-0 transition-transform", quickActionsOpen ? "rotate-45" : ""].join(" ")}
                />
              </span>
              <span
                className={[
                  "mt-1 max-w-full truncate text-[10px] font-medium tracking-wide max-[380px]:text-[9px]",
                  quickActionsOpen
                    ? "font-semibold text-[color:var(--sem-text-primary)]"
                    : "text-[color:var(--sem-text-muted)]",
                ].join(" ")}
              >
                Add
              </span>
            </button>

            {callsItem ? (
              <MobileNavTab
                {...callsItem}
                active={Boolean(pathname && isRouteActive(pathname, callsItem.href))}
              />
            ) : (
              <div className="min-h-11 min-w-11" />
            )}
            {messagingItem ? (
              <MobileNavTab
                {...messagingItem}
                active={Boolean(pathname && isRouteActive(pathname, messagingItem.href))}
              />
            ) : (
              <div className="min-h-11 min-w-11" />
            )}
          </div>
        </div>
      </nav>

      {moreOpen ? (
        <>
          <button
            type="button"
            aria-label={t("shell.mobile.closeMore")}
            className="fixed inset-0 z-50 bg-[color:color-mix(in_srgb,var(--bg-canvas)_55%,transparent)] backdrop-blur-sm lg:hidden"
            onClick={onMoreClose}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("shell.mobile.more")}
            className="fixed inset-y-0 left-0 z-[60] flex h-full w-[80vw] max-w-[320px] flex-col border-r border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-modal)] pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+0.4rem)] shadow-[24px_0_80px_color-mix(in_srgb,var(--bg-canvas)_65%,transparent)] backdrop-blur-xl lg:hidden"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--cmp-border-subtle)] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--sem-accent-primary),var(--sem-action-secondary))] text-sm font-semibold text-[color:var(--sem-text-inverse)]">
                  {userInitials}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">
                    {t("shell.signedIn")}
                  </p>
                  <p className="truncate text-sm font-medium text-[color:var(--sem-text-primary)]">{userLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onMoreClose}
                className="theme-btn-ghost shrink-0 rounded-full px-3 py-2 text-xs font-semibold"
              >
                {t("shell.mobile.done")}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {MOBILE_MORE_MENU_SECTIONS.map((section) => {
                const sectionLinks = section.links
                  .map((link) => navByHref.get(link.href))
                  .filter((item): item is MobileShellNavItem => Boolean(item));

                if (section.id === "workspace") {
                  return (
                    <div
                      key={section.id}
                      ref={workspaceSectionRef}
                      className="mb-5 last:mb-0"
                    >
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                        {t(sectionLabelKey(section.id))}
                      </p>
                      <div className="space-y-3 rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-3">
                        <OrganizationSwitcher variant="compact" menuPlacement="bottom" />
                        <LanguageSwitcher variant="compact" />
                      </div>
                    </div>
                  );
                }

                if (sectionLinks.length === 0) {
                  return null;
                }

                return (
                  <div key={section.id} className="mb-5 last:mb-0">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                      {t(sectionLabelKey(section.id))}
                    </p>
                    <div className="space-y-2">
                      {sectionLinks.map((item) => (
                        <MoreNavLink
                          key={item.href}
                          item={{
                            ...item,
                            label: resolveMoreMenuLabel(item.href, item.label),
                          }}
                          active={Boolean(pathname && isRouteActive(pathname, item.href))}
                          onNavigate={onMoreClose}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {visibleSecondaryMoreLinkCount === 0 ? (
                <p className="rounded-[18px] border border-dashed border-[color:var(--cmp-border-subtle)] px-4 py-6 text-center text-sm text-[color:var(--sem-text-muted)]">
                  {t("shell.mobile.moreEmpty")}
                </p>
              ) : null}
            </div>

            <div className="border-t border-[color:var(--cmp-border-subtle)] px-5 pt-4">
              <button
                type="button"
                onClick={async () => {
                  onMoreClose();
                  await handleLogout(router);
                }}
                className="theme-control-surface inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[18px] border px-3 text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>{t("common.actions.logOut")}</span>
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

export type { MobileShellNavProps };
