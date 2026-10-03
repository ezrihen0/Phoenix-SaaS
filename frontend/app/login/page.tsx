"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";

import { usePhoenixBoot } from "@/components/phoenix/phoenix-boot-provider";
import { PhoenixStartupScreen } from "@/components/phoenix/phoenix-startup-screen";
import { getClientDestination } from "@/lib/auth/client-auth";
import { resolvePostLoginPath } from "@/lib/auth/post-login-redirect";

import LoginForm, { LoginSessionLoading } from "./login-form";

export default function LoginPage() {
  const router = useRouter();
  const { status, session } = usePhoenixBoot();

  useEffect(() => {
    if (status !== "ready" || !session) {
      return;
    }

    let isMounted = true;

    async function redirectSignedInUser() {
      const payload = await getClientDestination().catch(() => ({ destination: "/home" as const }));
      const nextPath = new URLSearchParams(window.location.search).get("next");

      if (!isMounted) {
        return;
      }

      router.replace(resolvePostLoginPath(nextPath, payload.destination ?? null));
      router.refresh();
    }

    void redirectSignedInUser();

    return () => {
      isMounted = false;
    };
  }, [router, session, status]);

  if (status !== "ready") {
    return null;
  }

  if (session) {
    return <PhoenixStartupScreen />;
  }

  return (
    <Suspense fallback={<LoginSessionLoading />}>
      <LoginForm />
    </Suspense>
  );
}
