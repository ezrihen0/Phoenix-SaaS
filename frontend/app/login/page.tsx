"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getClientDestination,
  getClientSession,
} from "@/lib/auth/client-auth";

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

      const payload = await getClientDestination().catch(() => ({ destination: "/pricing" as const }));

      router.replace(payload.destination ?? "/pricing");
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
