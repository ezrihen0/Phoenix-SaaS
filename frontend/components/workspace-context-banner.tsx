"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { getClientSession } from "@/lib/auth/client-auth";

const BOOTSTRAP_ORGANIZATION_SLUG = "phoenix";
const OPERATING_PHOENIX_ORGANIZATION_SLUG = "phoenix-fireplace";

export function WorkspaceContextBanner() {
  const t = useTranslations("shell.workspaceContext");
  const [visible, setVisible] = useState(false);
  const [workspaceLabel, setWorkspaceLabel] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const session = await getClientSession();
        if (cancelled || !session?.active_organization) {
          return;
        }

        const slug = session.active_organization.slug?.trim().toLowerCase() ?? "";
        setUserEmail(session.user.email);

        if (slug === BOOTSTRAP_ORGANIZATION_SLUG) {
          setWorkspaceLabel(session.active_organization.name);
          setVisible(true);
          return;
        }

        if (slug !== OPERATING_PHOENIX_ORGANIZATION_SLUG) {
          setWorkspaceLabel(session.active_organization.name);
          setVisible(false);
        }
      } catch {
        if (!cancelled) {
          setVisible(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      className="border-b border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{t("bootstrapTitle", { workspace: workspaceLabel ?? t("unknownWorkspace") })}</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
            {t("bootstrapBody")}
          </p>
          {userEmail ? (
            <p className="mt-1 text-xs uppercase tracking-wide text-amber-800/80 dark:text-amber-100/70">
              {t("signedInAs", { email: userEmail })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
