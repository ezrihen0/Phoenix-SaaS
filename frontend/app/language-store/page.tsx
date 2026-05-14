import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerSession } from "@/lib/auth/server-session";
import type { LanguageStoreSurfacePayload } from "@/lib/language-store/client-language-store";

import { LanguageStoreWorkspace } from "./language-store-workspace";

export default async function LanguageStorePage() {
  const session = await requireServerSession("/language-store");
  let payload: LanguageStoreSurfacePayload | null = null;
  let loadError: string | null = null;

  try {
    payload = await serverApiFetch<LanguageStoreSurfacePayload>("/api/language-store");
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Language Store could not be loaded.";
  }

  return (
    <LanguageStoreWorkspace
      initial={payload}
      loadError={loadError}
      role={session.profile?.role ?? null}
    />
  );
}
