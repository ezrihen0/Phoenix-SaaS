"use client";

import { BellRing, LoaderCircle } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import {
  getTechnicianNotificationPermission,
  isTechnicianWebPushSupported,
  registerTechnicianWebPush,
} from "@/lib/push/technician-web-push";

type TechnicianPushSetupBannerProps = {
  enabled: boolean;
};

export function TechnicianPushSetupBanner({ enabled }: TechnicianPushSetupBannerProps) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [dismissed, setDismissed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setPermission(getTechnicianNotificationPermission());
  }, [enabled]);

  if (!enabled || dismissed || permission === "unsupported" || permission === "granted") {
    return null;
  }

  return (
    <div className="mx-4 mb-4 rounded-[20px] border border-[color:var(--sem-border-subtle)] bg-[color:var(--sem-surface-elevated)] px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.08)] lg:mx-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 rounded-full bg-[color:var(--sem-accent-primary-soft)] p-2 text-[color:var(--sem-accent-primary)]">
            <BellRing className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[color:var(--sem-text-primary)]">Enable job alerts</p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--sem-text-muted)]">
              Get mobile notifications when your assigned jobs are created, rescheduled, or updated by the office.
              {isTechnicianWebPushSupported() ? " Add Phoenix to your home screen for the most reliable alerts on iPhone." : ""}
            </p>
            {message ? <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">{message}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-xs text-[color:var(--sem-text-muted)] hover:bg-[color:var(--sem-surface-muted)]"
            onClick={() => setDismissed(true)}
          >
            Not now
          </button>
          <button
            type="button"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-full bg-[color:var(--sem-accent-primary)] px-4 py-2 text-xs font-medium text-white disabled:opacity-60"
            onClick={() => {
              startTransition(async () => {
                setMessage(null);
                const result = await registerTechnicianWebPush({ requestPermission: true });
                if (result.status === "registered") {
                  setPermission("granted");
                  return;
                }

                if (result.status === "denied") {
                  setPermission(result.permission);
                  setMessage("Notifications are blocked in your browser settings.");
                  return;
                }

                if (result.status === "disabled") {
                  setMessage("Push alerts are not enabled on the server yet.");
                  return;
                }

                setMessage("This browser does not support job alerts.");
              });
            }}
          >
            {isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
            Enable alerts
          </button>
        </div>
      </div>
    </div>
  );
}
