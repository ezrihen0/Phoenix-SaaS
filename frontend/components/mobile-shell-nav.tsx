"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, type ComponentType } from "react";
import { Ellipsis, LogOut, Settings, type LucideProps } from "lucide-react";

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
  isMobileMoreTabActive,
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
        "relative flex min-h-11 flex-col items-center justify-center rounded-[18px] border p-3 text-center transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]",
      ].join(" ")}
    >
      {badge ? (
        <span className="absolute right-1.5 top-1.5 rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[color:var(--sem-text-muted)]">
          {badge}
        </span>
      ) : null}
      <Icon className="h-5 w-5 shrink-0" />
      <span className="mt-1 w-full truncate text-[10px] font-medium">{item.label}</span>
    </Link>
  );
}

function sectionLabelKey(sectionId: MobileMoreMenuSectionId) {
  return `shell.mobile.moreSections.${sectionId}` as const;
}

export function MobileShellNav({
  primaryItems,
  navCatalog,
  roleNavCatalog,
  userLabel,
  userInitials,
  moreOpen,
  onMoreOpen,
  onMoreClose,
}: MobileShellNavProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const workspaceSectionRef = useRef<HTMLDivElement | null>(null);

  const navByHref = useMemo(
    () => new Map(navCatalog.map((item) => [item.href, item])),
    [navCatalog],
  );

  const roleNavByHref = useMemo(
    () => new Map(roleNavCatalog.map((item) => [item.href, item])),
    [roleNavCatalog],
  );

  const visibleMoreHrefs = useMemo(
    () => MOBILE_MORE_MENU_SECTIONS.flatMap((section) =>
      section.links
        .map((link) => link.href)
        .filter((href) => navByHref.has(href)),
    ),
    [navByHref],
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

  const moreActive = isMobileMoreTabActive(pathname, primaryItems, visibleMoreHrefs);
  const settingsActive = Boolean(pathname && isRouteActive(pathname, "/settings"));

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

  return (
    <>
      <nav
        aria-label={t("shell.mobile.bottomNavigation")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/95 px-1 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_color-mix(in_srgb,var(--bg-canvas)_40%,transparent)] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-end justify-around">
          {primaryItems.map((item) => (
            <MobileNavTab
              key={item.href}
              {...item}
              active={Boolean(pathname && isRouteActive(pathname, item.href))}
            />
          ))}
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            aria-label={t("shell.mobile.more")}
            onClick={() => {
              if (moreOpen) {
                onMoreClose();
              } else {
                onMoreOpen();
              }
            }}
            className="relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center px-0.5 py-1"
          >
            {moreActive ? (
              <span
                aria-hidden="true"
                className="absolute -top-1 h-1 w-5 rounded-full bg-[color:var(--sem-accent-primary)]"
              />
            ) : null}
            <Ellipsis
              aria-hidden="true"
              className={[
                "h-5 w-5 shrink-0",
                moreActive || moreOpen
                  ? "text-[color:var(--sem-text-primary)]"
                  : "text-[color:var(--sem-text-muted)]",
              ].join(" ")}
            />
            <span
              className={[
                "mt-1 max-w-full truncate text-[10px] font-medium tracking-wide max-[380px]:text-[9px]",
                moreActive || moreOpen
                  ? "font-semibold text-[color:var(--sem-text-primary)]"
                  : "text-[color:var(--sem-text-muted)]",
              ].join(" ")}
            >
              {t("shell.mobile.more")}
            </span>
          </button>
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
            className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[75vh] flex-col rounded-t-[32px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-modal)] pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-24px_80px_color-mix(in_srgb,var(--bg-canvas)_65%,transparent)] backdrop-blur-xl lg:hidden"
          >
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-[color:var(--cmp-border-subtle)]" />

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
                        <Link
                          href="/settings"
                          aria-current={settingsActive ? "page" : undefined}
                          onClick={onMoreClose}
                          className={[
                            settingsActive ? "theme-selected-card" : "theme-control-surface",
                            "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[18px] border px-3 text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]",
                          ].join(" ")}
                        >
                          <Settings className="h-4 w-4 shrink-0" />
                          <span>{t("shell.nav.settings")}</span>
                        </Link>
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
                    <div className="grid grid-cols-3 gap-2 max-[380px]:grid-cols-2">
                      {sectionLinks.map((item) => (
                        <MoreNavLink
                          key={item.href}
                          item={item}
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
