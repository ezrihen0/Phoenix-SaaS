"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, type ComponentType } from "react";
import { Ellipsis, LogOut, Settings, type LucideProps } from "lucide-react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { handleLogout } from "@/lib/auth/logout";
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
  moreItems: MobileShellNavItem[];
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
      className="relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center px-1 py-1"
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
          "mt-1 max-w-full truncate text-[10px] font-medium tracking-wide",
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

export function MobileShellNav({
  primaryItems,
  moreItems,
  userLabel,
  userInitials,
  moreOpen,
  onMoreOpen,
  onMoreClose,
}: MobileShellNavProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const moreActive = isMobileMoreTabActive(pathname, primaryItems, moreItems);
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
            onClick={() => {
              if (moreOpen) {
                onMoreClose();
              } else {
                onMoreOpen();
              }
            }}
            className="relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center px-1 py-1"
          >
            {moreActive ? (
              <span
                aria-hidden="true"
                className="absolute -top-1 h-1 w-5 rounded-full bg-[color:var(--sem-accent-primary)]"
              />
            ) : null}
            <Ellipsis
              className={[
                "h-5 w-5 shrink-0",
                moreActive || moreOpen
                  ? "text-[color:var(--sem-text-primary)]"
                  : "text-[color:var(--sem-text-muted)]",
              ].join(" ")}
            />
            <span
              className={[
                "mt-1 text-[10px] font-medium tracking-wide",
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

            {moreItems.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 overflow-y-auto p-4">
                {moreItems.map((item) => (
                  <MoreNavLink
                    key={item.href}
                    item={item}
                    active={Boolean(pathname && isRouteActive(pathname, item.href))}
                    onNavigate={onMoreClose}
                  />
                ))}
              </div>
            ) : null}

            <div className="mt-auto space-y-4 border-t border-[color:var(--cmp-border-subtle)] px-5 pt-4">
              <OrganizationSwitcher menuPlacement="top" />
              <LanguageSwitcher variant="shell" />

              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/settings"
                  aria-current={settingsActive ? "page" : undefined}
                  onClick={onMoreClose}
                  className={[
                    settingsActive ? "theme-selected-card" : "theme-control-surface",
                    "inline-flex min-h-11 items-center justify-center gap-2 rounded-[18px] border px-3 text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]",
                  ].join(" ")}
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  <span>{t("shell.nav.settings")}</span>
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    onMoreClose();
                    await handleLogout(router);
                  }}
                  className="theme-control-surface inline-flex min-h-11 items-center justify-center gap-2 rounded-[18px] border px-3 text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>{t("common.actions.logOut")}</span>
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
