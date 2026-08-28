"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { QuickCreateMenu, useQuickCreateAvailability } from "@/components/quick-create-menu";

type QuickCreateTriggerProps = {
  permissions: string[];
  pathname: string;
  variant: "header" | "mobile-tab";
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function QuickCreateTrigger({
  permissions,
  pathname,
  variant,
  disabled = false,
  onOpenChange,
}: QuickCreateTriggerProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const available = useQuickCreateAvailability(permissions);
  const isDisabled = disabled || !available;

  function setMenuOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open || variant !== "header") {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Node) || rootRef.current?.contains(target)) {
        return;
      }

      setMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open, variant]);

  if (!available) {
    return null;
  }

  if (variant === "mobile-tab") {
    return (
      <>
        {open ? (
          <button
            type="button"
            aria-label={t("common.actions.close")}
            className="fixed inset-0 z-40 bg-transparent lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}

        <div className="relative flex min-h-11 min-w-11 flex-col items-center justify-end px-0.5 py-1">
          <button
            type="button"
            disabled={isDisabled}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={t("shell.quickCreate.aria")}
            onClick={() => setMenuOpen(!open)}
            className="relative flex min-h-11 min-w-11 flex-col items-center justify-end px-0.5 py-1"
          >
            {open ? (
              <span
                aria-hidden="true"
                className="absolute -top-1 h-1 w-5 rounded-full bg-[color:var(--sem-accent-primary)]"
              />
            ) : null}
            <span
              className={[
                "mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl border shadow-[0_12px_26px_color-mix(in_srgb,var(--bg-canvas)_62%,transparent)] transition",
                open
                  ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-card)] text-[color:var(--sem-accent-primary)]"
                  : "theme-control-surface text-[color:var(--sem-text-primary)] hover:border-[color:var(--cmp-border-accent)]",
              ].join(" ")}
            >
              <Plus
                aria-hidden="true"
                className={["h-5 w-5 shrink-0 transition-transform", open ? "rotate-45" : ""].join(" ")}
              />
            </span>
            <span
              className={[
                "mt-1 max-w-full truncate text-[10px] font-medium tracking-wide max-[380px]:text-[9px]",
                open
                  ? "font-semibold text-[color:var(--sem-text-primary)]"
                  : "text-[color:var(--sem-text-muted)]",
              ].join(" ")}
            >
              {t("shell.quickCreate.mobileLabel")}
            </span>
          </button>

          <QuickCreateMenu
            open={open}
            onClose={() => setMenuOpen(false)}
            permissions={permissions}
            pathname={pathname}
            variant="sheet"
          />
        </div>
      </>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("shell.quickCreate.aria")}
        title={t("shell.quickCreate.aria")}
        disabled={isDisabled}
        onClick={() => setMenuOpen(!open)}
        className="theme-control-surface-soft inline-flex h-11 w-11 items-center justify-center rounded-full border transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
      >
        <Plus className="h-4 w-4" />
      </button>

      <QuickCreateMenu
        open={open}
        onClose={() => setMenuOpen(false)}
        permissions={permissions}
        pathname={pathname}
        variant="popover"
      />
    </div>
  );
}
