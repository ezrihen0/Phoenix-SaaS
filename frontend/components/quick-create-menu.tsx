"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, type ReactNode } from "react";

import {
  buildQuickCreateMenuItems,
  type QuickCreateActionTier,
} from "@/lib/navigation/quick-create-registry";

type QuickCreateMenuProps = {
  open: boolean;
  onClose: () => void;
  permissions: string[];
  pathname: string;
  variant: "popover" | "sheet";
  className?: string;
};

function MenuSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div>
      {title ? (
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">
          {title}
        </p>
      ) : null}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ActionLinks({
  items,
  tier,
  onNavigate,
}: {
  items: ReturnType<typeof buildQuickCreateMenuItems>;
  tier: QuickCreateActionTier;
  onNavigate: () => void;
}) {
  const t = useTranslations();
  const filtered = items.filter((item) => item.tier === tier);

  if (filtered.length === 0) {
    return null;
  }

  return (
    <>
      {filtered.map((action) => {
        const Icon = action.icon;

        return (
          <Link
            key={action.id}
            href={action.href}
            role="menuitem"
            onClick={onNavigate}
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[color:var(--sem-text-primary)] transition hover:bg-[color:var(--cmp-hover-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]"
          >
            <Icon className="h-4 w-4 shrink-0 text-[color:var(--sem-accent-primary)]" aria-hidden="true" />
            <span>{t(action.labelKey)}</span>
          </Link>
        );
      })}
    </>
  );
}

export function QuickCreateMenu({
  open,
  onClose,
  permissions,
  pathname,
  variant,
  className = "",
}: QuickCreateMenuProps) {
  const t = useTranslations();
  const menuId = useId();
  const items = buildQuickCreateMenuItems(permissions, pathname);
  const primaryItems = items.filter((item) => item.tier === "primary");
  const secondaryItems = items.filter((item) => item.tier === "secondary");

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || items.length === 0) {
    return null;
  }

  const panelClass = variant === "sheet"
    ? "fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 max-h-[min(70vh,28rem)] overflow-y-auto rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-modal)] p-3 shadow-[0_20px_50px_color-mix(in_srgb,var(--bg-canvas)_65%,transparent)] lg:hidden"
    : "absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(18rem,calc(100vw-2rem))] rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-modal)] p-2 shadow-[0_20px_50px_color-mix(in_srgb,var(--bg-canvas)_65%,transparent)]";

  return (
    <div
      id={menuId}
      role="menu"
      aria-label={t("shell.quickCreate.menuTitle")}
      className={[panelClass, className].filter(Boolean).join(" ")}
    >
      <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">
        {t("shell.quickCreate.menuTitle")}
      </p>

      <MenuSection>
        <ActionLinks items={items} tier="primary" onNavigate={onClose} />
      </MenuSection>

      {primaryItems.length > 0 && secondaryItems.length > 0 ? (
        <div className="my-2 border-t border-[color:var(--cmp-border-subtle)]" role="separator" />
      ) : null}

      <MenuSection>
        <ActionLinks items={items} tier="secondary" onNavigate={onClose} />
      </MenuSection>
    </div>
  );
}

export function useQuickCreateAvailability(permissions: string[]) {
  return buildQuickCreateMenuItems(permissions, "/").length > 0;
}
