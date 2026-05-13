"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  variant: "shell" | "technician";
};

export function OrganizationSwitcher({ variant }: OrganizationSwitcherProps) {
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
      setLoadError(error instanceof Error ? error.message : "Session could not be loaded.");
    }
  }, []);

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
    || session?.memberships.find((m) => m.organization_id === session?.active_membership?.organization_id)
      ?.organization?.name?.trim()
    || null;

  const shellTextMuted = "text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]";
  const shellLabel = "text-sm font-medium text-[color:var(--sem-text-primary)]";
  const techTextMuted = "text-[11px] uppercase tracking-[0.28em] text-white/46";
  const techLabel = "text-sm font-medium text-[#f5ecd2]";

  const mutedClass = variant === "shell" ? shellTextMuted : techTextMuted;
  const labelClass = variant === "shell" ? shellLabel : techLabel;

  const panelClass = variant === "shell"
    ? "absolute right-0 z-50 mt-2 min-w-[220px] rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] py-2 shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
    : "absolute right-0 z-50 mt-2 min-w-[220px] rounded-[18px] border border-white/14 bg-[linear-gradient(180deg,rgba(14,14,14,0.98),rgba(22,22,22,0.95))] py-2 shadow-[0_24px_80px_rgba(0,0,0,0.5)]";

  const buttonClass = variant === "shell"
    ? "inline-flex max-w-[min(100%,14rem)] items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] px-3 py-2 text-left text-sm transition hover:border-[color:var(--cmp-border-accent)]"
    : "inline-flex max-w-[min(100%,16rem)] items-center gap-2 rounded-full border border-white/12 bg-black/40 px-3 py-2 text-left text-sm transition hover:border-white/22";

  const optionClass = variant === "shell"
    ? "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-[color:var(--sem-text-primary)] hover:bg-[color:var(--cmp-hover-surface)]"
    : "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-white/88 hover:bg-white/[0.06]";

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
      setLoadError(error instanceof Error ? error.message : "Could not switch organization.");
    }
  }

  if (loadError && !session) {
    return (
      <div className="max-w-xs">
        <p className={mutedClass}>Workspace</p>
        <p className={`${labelClass} text-rose-300`}>{loadError}</p>
      </div>
    );
  }

  if (!session) {
    if (variant === "technician") {
      return (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/35 px-3 py-2 text-sm text-white/56">
          <Loader2 className="h-4 w-4 animate-spin text-[color:var(--flat-gold)]" />
          <span>Loading workspace…</span>
        </div>
      );
    }

    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-dashed border-[color:var(--cmp-border-subtle)] px-3 py-2 text-sm text-[color:var(--sem-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading workspace…</span>
      </div>
    );
  }

  if (switchable.length === 0) {
    return (
      <div className="max-w-xs">
        <p className={mutedClass}>Active workspace</p>
        <p className={`${labelClass} ${variant === "technician" ? "text-amber-100/90" : "text-amber-700 dark:text-amber-200"}`}>
          No active business membership is available.
        </p>
        <Link
          href="/settings"
          className={`mt-1 inline-block text-xs underline-offset-4 hover:underline ${variant === "shell" ? "text-[color:var(--sem-accent-primary)]" : "text-[color:var(--flat-gold)]"}`}
        >
          Open settings
        </Link>
      </div>
    );
  }

  if (switchable.length === 1) {
    const displayName = activeLabel ?? switchable[0]?.organization?.name?.trim() ?? "Current organization";

    return (
      <div className="inline-flex items-center gap-2">
        <Building2 className={`h-4 w-4 shrink-0 ${variant === "shell" ? "text-[color:var(--sem-text-muted)]" : "text-white/50"}`} />
        <div>
          <p className={mutedClass}>Active workspace</p>
          <p className={`${labelClass} max-w-[14rem] truncate`}>{displayName}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative inline-flex flex-col items-start" ref={menuRef}>
      <p className={mutedClass}>Active workspace</p>
      <button
        type="button"
        className={buttonClass}
        aria-expanded={menuOpen}
        aria-haspopup="listbox"
        onClick={() => {
          setMenuOpen((open) => !open);
        }}
      >
        <Building2 className={`h-4 w-4 shrink-0 ${variant === "shell" ? "text-[color:var(--sem-text-muted)]" : "text-white/50"}`} />
        <span className={`truncate ${labelClass}`}>
          {activeLabel ?? switchable.find((m) => m.organization_id === session.active_membership?.organization_id)?.organization?.name ?? "Select organization"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 ${variant === "shell" ? "text-[color:var(--sem-text-muted)]" : "text-white/46"}`} />
      </button>

      {loadError ? (
        <p className={`mt-1 max-w-[14rem] text-xs ${variant === "shell" ? "text-rose-600 dark:text-rose-300" : "text-rose-200"}`}>{loadError}</p>
      ) : null}

      {menuOpen ? (
        <div className={panelClass} role="listbox">
          {switchable.map((membership) => {
            const org = membership.organization;
            const label = org?.name?.trim() || "Unnamed organization";
            const isActive = membership.organization_id === session.active_organization?.id;
            const busy = switchingToId === membership.organization_id;

            return (
              <button
                key={membership.id}
                type="button"
                role="option"
                aria-selected={isActive}
                disabled={Boolean(switchingToId)}
                className={`${optionClass} ${isActive ? (variant === "shell" ? "bg-[color:var(--cmp-hover-surface)]" : "bg-white/[0.08]") : ""}`}
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
