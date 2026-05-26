"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  FileText,
  House,
  LogOut,
  Menu,
  MessageSquare,
  Megaphone,
  Package,
  Phone,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Workflow,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { ThemeRuntime } from "@/components/theme-runtime";
import { GlobalSearchShell } from "@/features/global-search/global-search-shell";
import { getClientDestination, getClientSession } from "@/lib/auth/client-auth";
import { handleLogout } from "@/lib/auth/logout";
import { isShellNavHrefVisible, type ShellNavRole } from "@/lib/navigation/shell-nav-policy";

type AppShellProps = {
  children: ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof House;
};

type SearchCapableRole = "owner" | "admin" | "office_admin";

const COLLAPSED_KEY = "wizfield.quick-nav.collapsed";
const HIDDEN_PREFIXES = [
  "/access",
  "/billing/success",
  "/book",
  "/contact",
  "/landing",
  "/login",
  "/portal",
  "/pricing",
  "/privacy",
  "/reset-password",
  "/signup",
  "/terms",
  "/warranty-certificate",
];

function shouldShowShell(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  return !HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function buildInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return "WF";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function canUseGlobalSearch(role: string | null | undefined): role is SearchCapableRole {
  return role === "owner" || role === "admin" || role === "office_admin";
}

function SideNavLink({ href, label, icon: Icon, active, collapsed }: NavItem & { active: boolean; collapsed: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        active ? "theme-selected-card" : "theme-control-surface",
        "flex items-center gap-3 rounded-[20px] border px-3 py-3 text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]",
        collapsed ? "justify-center" : "justify-start",
      ].join(" ")}
      title={collapsed ? label : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span>{label}</span> : null}
    </Link>
  );
}

function HeaderQuickLink({ href, label, icon: Icon, active }: NavItem & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={label}
      className={[
        active ? "theme-selected-card" : "theme-control-surface-soft",
        "inline-flex h-11 w-11 items-center justify-center rounded-full border transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" />
    </Link>
  );
}

export function AppShell({ children }: AppShellProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const searchPopoverRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedPreferenceReady, setCollapsedPreferenceReady] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [userLabel, setUserLabel] = useState("WizField User");
  const [shellNavRole, setShellNavRole] = useState<ShellNavRole | null>(null);
  const [shellNavRoleResolved, setShellNavRoleResolved] = useState(false);
  const [activationMode, setActivationMode] = useState(false);
  const enabled = shouldShowShell(pathname);
  const primaryNavItems: NavItem[] = [
    { href: "/home", label: t("shell.nav.home"), icon: House },
    { href: "/jobs", label: t("shell.nav.jobs"), icon: BriefcaseBusiness },
    { href: "/schedule", label: t("shell.nav.schedule"), icon: CalendarDays },
    { href: "/dispatch", label: t("shell.nav.dispatch"), icon: Truck },
    { href: "/customers", label: t("shell.nav.customers"), icon: Users },
    { href: "/leads", label: t("shell.nav.leads"), icon: ClipboardList },
    { href: "/inventory", label: t("shell.nav.inventory"), icon: Boxes },
    { href: "/pricebook", label: t("shell.nav.pricebook"), icon: Package },
    { href: "/invoices", label: t("shell.nav.invoices"), icon: Receipt },
    { href: "/estimates", label: t("shell.nav.estimates"), icon: FileText },
    { href: "/calls", label: t("shell.nav.calls"), icon: Phone },
    { href: "/messaging", label: t("shell.nav.messaging"), icon: MessageSquare },
    { href: "/marketing", label: t("shell.nav.marketing"), icon: Megaphone },
    { href: "/inspections", label: t("shell.nav.inspections"), icon: ShieldCheck },
    { href: "/automations", label: t("shell.nav.automations"), icon: Workflow },
  ];
  const headerQuickLinks: Array<Pick<NavItem, "href" | "label" | "icon">> = [
    { href: "/calls", label: t("shell.nav.calls"), icon: Phone },
    { href: "/messaging", label: t("shell.nav.messaging"), icon: MessageSquare },
  ];

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "true");
      setCollapsedPreferenceReady(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!collapsedPreferenceReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed, collapsedPreferenceReady]);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const session = await getClientSession().catch(() => null);

      if (cancelled) {
        return;
      }

      const nextLabel = session?.profile?.full_name?.trim()
        || session?.technician?.display_name?.trim()
        || session?.user?.email?.trim()
        || "WizField User";
      const canSearch = canUseGlobalSearch(session?.profile?.role);

      setUserLabel(nextLabel);
      setSearchEnabled(Boolean(canSearch));
      setShellNavRole(session?.profile?.role ?? null);
      setShellNavRoleResolved(true);

      try {
        const destinationResponse = await getClientDestination();
        setActivationMode(destinationResponse.destination === "/pricing");
      } catch {
        setActivationMode(pathname === "/billing/success");
      }
    }

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!searchPopoverRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [searchOpen]);

  if (!enabled) {
    return (
      <>
        <ThemeRuntime />
        {children}
      </>
    );
  }

  const visiblePrimaryNav = activationMode
    ? []
    : primaryNavItems.filter((item) =>
      isShellNavHrefVisible(item.href, shellNavRole, shellNavRoleResolved),
    );

  const visibleHeaderQuickLinks = activationMode
    ? []
    : headerQuickLinks.filter((item) =>
      isShellNavHrefVisible(item.href, shellNavRole, shellNavRoleResolved),
    );

  return (
    <>
      <ThemeRuntime />
      <div className="flex min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
        <aside
          className={[
            "sticky top-0 flex h-screen shrink-0 flex-col gap-4 border-r border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/95 px-3 py-4 backdrop-blur-xl transition-[width] duration-200",
            collapsed ? "w-20" : "w-72",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-3 px-1">
            {!collapsed ? (
              <div>
                <p className="text-[11px] uppercase tracking-[0.35em] text-[color:var(--sem-text-muted)]">{t("shell.quickNavigation")}</p>
                <p className="mt-1 font-[family:var(--font-flat-display)] text-2xl text-[color:var(--sem-text-primary)]">WizField</p>
              </div>
            ) : <div className="h-12" />}
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              aria-label={collapsed ? t("shell.expandQuickNavigation") : t("shell.collapseQuickNavigation")}
              className="theme-control-surface inline-flex h-11 w-11 items-center justify-center rounded-[18px] border transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {activationMode ? (
              <div className="theme-control-surface-soft rounded-[20px] border px-3 py-4 text-xs leading-6 text-[color:var(--sem-text-secondary)]">
                {t("shell.activationLocked")}
              </div>
            ) : null}
            {visiblePrimaryNav.map((item) => (
              <SideNavLink
                key={item.href}
                {...item}
                collapsed={collapsed}
                active={Boolean(pathname && isRouteActive(pathname, item.href))}
              />
            ))}
          </nav>

          <div className="space-y-2 border-t border-[color:var(--cmp-border-subtle)] pt-4">
            <SideNavLink
              href="/settings"
              label={t("shell.nav.settings")}
              icon={Settings}
              collapsed={collapsed}
              active={Boolean(pathname && isRouteActive(pathname, "/settings"))}
            />
            <button
              type="button"
              onClick={async () => {
                await handleLogout(router);
              }}
              className={[
                "theme-control-surface flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]",
                collapsed ? "justify-center" : "justify-start",
              ].join(" ")}
              title={collapsed ? t("common.actions.logOut") : undefined}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed ? <span>{t("common.actions.logOut")}</span> : null}
            </button>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 px-4 py-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1600px] items-start justify-between gap-4">
              <div className="inline-flex h-[4.25rem] w-[min(58vw,16rem)] shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-1 shadow-[0_18px_45px_rgba(15,23,42,0.18)] ring-1 ring-white/5 backdrop-blur-xl sm:h-[4.75rem] sm:w-[17.8125rem] lg:w-[17.8125rem]">
                <img
                  src="/wizfield-logo.svg"
                  alt="WizField logo"
                  className="block h-full w-full object-fill drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)]"
                />
              </div>

              <div ref={searchPopoverRef} className="relative flex min-h-[76px] flex-1 items-center justify-end">
                <div className="theme-surface-modal flex flex-wrap items-center justify-end gap-3 rounded-[30px] border bg-[color:var(--cmp-surface-panel)]/95 px-3 py-3 shadow-[0_20px_65px_color-mix(in_srgb,var(--bg-canvas)_56%,transparent)] backdrop-blur-xl">
                  <OrganizationSwitcher />
                  <LanguageSwitcher variant="shell" />
                  <div className="theme-control-surface-soft flex items-center gap-3 rounded-full border px-3 py-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--sem-accent-primary),var(--sem-action-secondary))] text-sm font-semibold text-[color:var(--sem-text-inverse)]">
                      {buildInitials(userLabel)}
                    </div>
                    <div className="pr-1">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">{t("shell.signedIn")}</p>
                      <p className="max-w-[180px] truncate text-sm font-medium text-[color:var(--sem-text-primary)]">{userLabel}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {visibleHeaderQuickLinks.map((item) => (
                      <HeaderQuickLink
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
                        active={Boolean(pathname && isRouteActive(pathname, item.href))}
                      />
                    ))}

                    {searchEnabled ? (
                      <button
                        type="button"
                        aria-label={t("shell.searchAria")}
                        aria-expanded={searchOpen}
                        onClick={() => setSearchOpen((current) => !current)}
                        className="theme-control-surface-soft inline-flex h-11 w-11 items-center justify-center rounded-full border transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
                      >
                        <Search className="h-4 w-4" />
                      </button>
                    ) : null}

                    <Link
                      href="/settings"
                      aria-label={t("shell.settingsAria")}
                      className="theme-control-surface-soft inline-flex h-11 w-11 items-center justify-center rounded-full border transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
                    >
                      <Settings className="h-4 w-4" />
                    </Link>
                  </div>
                </div>

                {searchEnabled ? <GlobalSearchShell mode="popover" open={searchOpen} /> : null}
              </div>
            </div>
          </header>

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </>
  );
}
