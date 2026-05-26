import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerSession } from "@/lib/auth/server-session";
import type { CustomerOutputTranslationUsageSummary } from "@/lib/language-store/client-customer-output-translations";
import type { LanguageStoreSurfacePayload } from "@/lib/language-store/client-language-store";
import type { LanguagePreferencePayload } from "@/lib/language-store/client-language-preferences";

import { LanguageStoreWorkspace } from "./language-store-workspace";

export default async function LanguageStorePage() {
  const session = await requireServerSession("/language-store");
  let payload: LanguageStoreSurfacePayload | null = null;
  let loadError: string | null = null;
  let initialPreference: LanguagePreferencePayload | null = null;
  let preferenceLoadError: string | null = null;
  let initialUsage: CustomerOutputTranslationUsageSummary | null = null;
  let usageLoadError: string | null = null;

  try {
    payload = await serverApiFetch<LanguageStoreSurfacePayload>("/api/language-store");
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Language Store could not be loaded.";
  }

  try {
    initialPreference = await serverApiFetch<LanguagePreferencePayload>("/api/language-store/preference");
  } catch (error) {
    preferenceLoadError = error instanceof Error ? error.message : "Worker language preference could not be loaded.";
  }

  try {
    initialUsage = await serverApiFetch<CustomerOutputTranslationUsageSummary>(
      "/api/language-store/customer-output-translations/usage",
    );
  } catch (error) {
    usageLoadError = error instanceof Error ? error.message : "Translation usage could not be loaded.";
  }

  return (
    <LanguageStoreWorkspace
      initial={payload}
      initialPreference={initialPreference}
      initialUsage={initialUsage}
      loadError={loadError}
      preferenceLoadError={preferenceLoadError}
      usageLoadError={usageLoadError}
      role={session.profile?.role ?? null}
    />
  );
}
