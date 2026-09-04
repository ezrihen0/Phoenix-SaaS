"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getClientDestination,
  getClientSession,
} from "@/lib/auth/client-auth";
import { resolvePostLoginPath } from "@/lib/auth/post-login-redirect";

import LoginForm, { LoginAmbientShell, LoginSessionLoading } from "./login-form";

export default function LoginPage() {
  const router = useRouter();
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function guardSession() {
      const session = await getClientSession().catch(() => null);

      if (!isMounted) {
        return;
      }

      if (!session) {
        setIsCheckingSession(false);
        return;
      }

      const payload = await getClientDestination().catch(() => ({ destination: "/home" as const }));
      const nextPath = new URLSearchParams(window.location.search).get("next");

      router.replace(resolvePostLoginPath(nextPath, payload.destination ?? null));
      router.refresh();
    }

    void guardSession().catch(() => {
      if (!isMounted) {
        return;
      }

      setIsCheckingSession(false);
    });

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (isCheckingSession) {
    return (
      <LoginAmbientShell>
        <LoginSessionLoading />
      </LoginAmbientShell>
    );
  }

  return (
    <Suspense
      fallback={(
        <LoginAmbientShell>
          <LoginSessionLoading />
        </LoginAmbientShell>
      )}
    >
      <LoginForm />
    </Suspense>
  );
}
