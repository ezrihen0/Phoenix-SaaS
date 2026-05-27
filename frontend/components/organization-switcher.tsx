"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronDown, Loader2 } from "lucide-react";

import type { ClientSession } from "@/lib/auth/client-auth";
import { getClientSession, setClientActiveOrganization } from "@/lib/auth/client-auth";

const POST_SWITCH_PATH = "/home";

function listSwitchableMemberships(session: ClientSession) {
  return session.memberships.filter(
    (membership) =>
      membership.status === "active"
      && membership.organization
      && membership.organization.is_active,
  );
}

type OrganizationSwitcherProps = {
  menuPlacement?: "bottom" | "top";
};

export function OrganizationSwitcher({ menuPlacement = "bottom" }: OrganizationSwitcherProps) {
  const t = useTranslations("shell.workspace");
  const pathname = usePathname();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [switchingToId, setSwitchingToId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const loadSession = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await getClientSession();
      setSession(next);
    } catch (error) {
      setSession(null);
      setLoadError(error instanceof Error ? error.message : t("loadError"));
    }
  }, [t]);

  useEffect(() => {
    void loadSession();
  }, [loadSession, pathname]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  const switchable = useMemo(() => (session ? listSwitchableMemberships(session) : []), [session]);

  const activeLabel = session?.active_organization?.name?.trim()
    || session?.memberships.find((membership) => membership.organization_id === session?.active_membership?.organization_id)
      ?.organization?.name?.trim()
    || null;

  const mutedClass = "text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]";
  const labelClass = "text-sm font-medium text-[color:var(--sem-text-primary)]";
  const panelClass = menuPlacement === "top"
    ? "absolute right-0 bottom-full z-50 mb-2 min-w-[220px] rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] py-2 shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
    : "absolute right-0 z-50 mt-2 min-w-[220px] rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] py-2 shadow-[0_24px_80px_rgba(0,0,0,0.35)]";
  const buttonClass = "inline-flex max-w-[min(100%,14rem)] items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] px-3 py-2 text-left text-sm transition hover:border-[color:var(--cmp-border-accent)]";
  const optionClass = "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-[color:var(--sem-text-primary)] hover:bg-[color:var(--cmp-hover-surface)]";

  async function handleSelectOrganization(organizationId: string) {
    if (!session || organizationId === session.active_organization?.id) {
      setMenuOpen(false);
      return;
    }

    setSwitchingToId(organizationId);
    setLoadError(null);

    try {
      await setClientActiveOrganization(organizationId);
      window.location.assign(POST_SWITCH_PATH);
    } catch (error) {
      setSwitchingToId(null);
      setMenuOpen(false);
      setLoadError(error instanceof Error ? error.message : t("switchError"));
    }
  }

  if (loadError && !session) {
    return (
      <div className="max-w-xs">
        <p className={mutedClass}>{t("label")}</p>
        <p className={`${labelClass} text-rose-300`}>{loadError}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-dashed border-[color:var(--cmp-border-subtle)] px-3 py-2 text-sm text-[color:var(--sem-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t("loading")}</span>
      </div>
    );
  }

  if (switchable.length === 0) {
    return (
      <div className="max-w-xs">
        <p className={mutedClass}>{t("label")}</p>
        <p className={`${labelClass} text-amber-700 dark:text-amber-200`}>
          {t("unavailable")}
        </p>
        <Link
          href="/settings"
          className="mt-1 inline-block text-xs text-[color:var(--sem-accent-primary)] underline-offset-4 hover:underline"
        >
          {t("openSettings")}
        </Link>
      </div>
    );
  }

  if (switchable.length === 1) {
    const displayName = activeLabel ?? switchable[0]?.organization?.name?.trim() ?? t("currentOrganization");

    return (
      <div className="inline-flex items-center gap-2">
        <Building2 className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
        <div>
          <p className={mutedClass}>{t("label")}</p>
          <p className={`${labelClass} max-w-[14rem] truncate`}>{displayName}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative inline-flex flex-col items-start" ref={menuRef}>
      <p className={mutedClass}>{t("label")}</p>
      <button
        type="button"
        className={buttonClass}
        aria-expanded={menuOpen}
        aria-haspopup="listbox"
        onClick={() => {
          setMenuOpen((open) => !open);
        }}
      >
        <Building2 className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
        <span className={`truncate ${labelClass}`}>
          {activeLabel ?? switchable.find((membership) => membership.organization_id === session.active_membership?.organization_id)?.organization?.name ?? t("selectOrganization")}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
      </button>

      {loadError ? (
        <p className="mt-1 max-w-[14rem] text-xs text-rose-600 dark:text-rose-300">{loadError}</p>
      ) : null}

      {menuOpen ? (
        <div className={panelClass} role="listbox">
          {switchable.map((membership) => {
            const org = membership.organization;
            const label = org?.name?.trim() || t("unnamedOrganization");
            const isActive = membership.organization_id === session.active_organization?.id;
            const busy = switchingToId === membership.organization_id;

            return (
              <button
                key={membership.id}
                type="button"
                role="option"
                aria-selected={isActive}
                disabled={Boolean(switchingToId)}
                className={`${optionClass} ${isActive ? "bg-[color:var(--cmp-hover-surface)]" : ""}`}
                onClick={() => {
                  void handleSelectOrganization(membership.organization_id);
                }}
              >
                <span className="truncate">{label}</span>
                {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
