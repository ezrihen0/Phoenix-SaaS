"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import {
  CRM_BRAND_NAME,
  CRM_LOGO_ALT,
  CRM_LOGO_SRC,
  CRM_SPLASH_ACCENT,
  CRM_SPLASH_BACKGROUND,
} from "@/lib/branding/crm-brand";

export type PhoenixStartupScreenState = "loading" | "error";

type PhoenixStartupScreenProps = {
  state?: PhoenixStartupScreenState;
  message?: string;
  errorDetail?: string | null;
  onRetry?: () => void;
  /** When true, omits fixed positioning (for embedded fallbacks). */
  embedded?: boolean;
  footer?: ReactNode;
};

export function PhoenixStartupScreen({
  state = "loading",
  message,
  errorDetail,
  onRetry,
  embedded = false,
  footer,
}: PhoenixStartupScreenProps) {
  const t = useTranslations("startup");

  const statusLabel = message ?? (state === "error" ? t("errorTitle") : t("loading"));

  return (
    <div
      className={[
        "phoenix-startup-screen flex flex-col items-center justify-center px-6 text-center",
        embedded ? "min-h-[320px] w-full py-10" : "fixed inset-0 z-[9999] min-h-[100dvh]",
      ].join(" ")}
      style={{ backgroundColor: CRM_SPLASH_BACKGROUND }}
      role={state === "error" ? "alert" : "status"}
      aria-live="polite"
      aria-busy={state === "loading"}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: [
            `radial-gradient(circle at 50% 38%, color-mix(in srgb, ${CRM_SPLASH_ACCENT} 22%, transparent), transparent 52%)`,
            `radial-gradient(circle at 18% 12%, color-mix(in srgb, #4D00FF 16%, transparent), transparent 40%)`,
            `linear-gradient(180deg, #05070C 0%, #0D121E 100%)`,
          ].join(", "),
        }}
      />

      <div className="relative flex w-full max-w-sm flex-col items-center">
        <div className="phoenix-startup-logo-ring relative flex min-h-[5.5rem] w-full max-w-[280px] items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="phoenix-startup-glow absolute inset-0 rounded-[28px]" aria-hidden="true" />
          <img
            src={CRM_LOGO_SRC}
            alt={CRM_LOGO_ALT}
            className="phoenix-startup-logo relative z-[1] h-14 w-auto max-w-full object-contain drop-shadow-[0_12px_32px_rgba(0,0,0,0.55)] sm:h-16"
            decoding="sync"
            fetchPriority="high"
          />
        </div>

        <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.38em] text-white/45">
          {CRM_BRAND_NAME}
        </p>
        <p className="mt-3 text-base font-medium text-white/88">{statusLabel}</p>

        {state === "loading" ? (
          <div className="phoenix-startup-progress mt-6 h-1 w-36 overflow-hidden rounded-full bg-white/10">
            <div className="phoenix-startup-progress-bar h-full w-2/5 rounded-full bg-[color:var(--phoenix-startup-accent,#00F5A0)]" />
          </div>
        ) : null}

        {state === "error" ? (
          <div className="mt-6 w-full space-y-4">
            {errorDetail ? (
              <p className="text-sm leading-6 text-white/62">{errorDetail}</p>
            ) : (
              <p className="text-sm leading-6 text-white/62">{t("errorBody")}</p>
            )}
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[color:color-mix(in_srgb,#00F5A0_42%,transparent)] bg-[color:color-mix(in_srgb,#00F5A0_14%,#05070C)] px-5 text-sm font-semibold text-[#d7ffe8] transition hover:bg-[color:color-mix(in_srgb,#00F5A0_22%,#05070C)]"
              >
                {t("retry")}
              </button>
            ) : null}
          </div>
        ) : null}

        {footer ? <div className="mt-6 w-full">{footer}</div> : null}
      </div>
    </div>
  );
}
