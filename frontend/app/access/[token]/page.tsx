"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { portalApiFetch } from "@/lib/portal/browser-api";

export default function PortalAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function redeem() {
      try {
        await portalApiFetch("/api/portal/magic-links/redeem", {
          method: "POST",
          body: JSON.stringify({ token: resolvedParams.token }),
        });
        if (isMounted) {
          router.replace("/portal");
        }
      } catch (nextError) {
        if (isMounted) {
          setError(nextError instanceof Error ? nextError.message : "Portal link could not be opened.");
        }
      }
    }

    void redeem();
    return () => {
      isMounted = false;
    };
  }, [resolvedParams.token, router]);

  return (
    <main className="min-h-screen bg-[color:var(--flat-canvas)] px-6 py-16 text-[color:var(--text-primary)]">
      <div className="mx-auto max-w-xl rounded-[24px] border border-[color:rgba(212,175,55,0.2)] bg-[linear-gradient(170deg,rgba(8,8,8,0.96),rgba(19,19,19,0.9))] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
        <h1 className="text-2xl font-semibold">Opening your customer portal...</h1>
        {error ? <p className="mt-4 rounded-[12px] border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : <p className="mt-4 text-sm text-[color:var(--text-secondary)]">Please wait while we verify your secure access link.</p>}
      </div>
    </main>
  );
}
