"use client";

import { Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { MarketingProfilePayload } from "@/lib/marketing/client-marketing";
import { fetchMarketingProfile, patchMarketingProfile } from "@/lib/marketing/client-marketing";

type FormSlices = {
  identity: Required<Pick<NonNullable<MarketingProfilePayload["identity"]>, "display_name" | "tagline" | "service_area_notes">> & {
    display_name: string;
    tagline: string;
    service_area_notes: string;
  };
  brand_voice: Required<Pick<NonNullable<MarketingProfilePayload["brand_voice"]>, "tone_keywords" | "formality" | "persona_notes">> & {
    tone_keywords: string;
    formality: string;
    persona_notes: string;
  };
  publishing_preferences: Required<
    Pick<
      NonNullable<MarketingProfilePayload["publishing_preferences"]>,
      "default_cta_primary" | "default_cta_secondary" | "link_policy_notes"
    >
  > & { default_cta_primary: string; default_cta_secondary: string; link_policy_notes: string };
  safety_preferences: Required<
    Pick<
      NonNullable<MarketingProfilePayload["safety_preferences"]>,
      "restricted_terms_text" | "disclaimer_mode" | "extra_guidelines"
    >
  > & { restricted_terms_text: string; disclaimer_mode: string; extra_guidelines: string };
};

function sliceFrom(profile: MarketingProfilePayload | null): FormSlices {
  return {
    identity: {
      display_name: profile?.identity?.display_name ?? "",
      tagline: profile?.identity?.tagline ?? "",
      service_area_notes: profile?.identity?.service_area_notes ?? "",
    },
    brand_voice: {
      tone_keywords: profile?.brand_voice?.tone_keywords ?? "",
      formality: profile?.brand_voice?.formality ?? "",
      persona_notes: profile?.brand_voice?.persona_notes ?? "",
    },
    publishing_preferences: {
      default_cta_primary: profile?.publishing_preferences?.default_cta_primary ?? "",
      default_cta_secondary: profile?.publishing_preferences?.default_cta_secondary ?? "",
      link_policy_notes: profile?.publishing_preferences?.link_policy_notes ?? "",
    },
    safety_preferences: {
      restricted_terms_text: profile?.safety_preferences?.restricted_terms_text ?? "",
      disclaimer_mode: profile?.safety_preferences?.disclaimer_mode ?? "",
      extra_guidelines: profile?.safety_preferences?.extra_guidelines ?? "",
    },
  };
}

const inputClassName =
  "theme-control-surface mt-2 w-full rounded-[16px] border px-3 py-2.5 text-sm text-[color:var(--sem-text-primary)] outline-none placeholder:text-[color:var(--sem-text-muted)] focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]";

const fieldsetClassName =
  "rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-5 py-4";

const legendClassName = "px-2 text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]";

export function MarketingProfileSettingsPanel() {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydratedExists, setHydratedExists] = useState<boolean | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [form, setForm] = useState<FormSlices>(() => sliceFrom(null));

  const loadProfile = useCallback(async () => {
    setLoadError(null);

    try {
      const profile = await fetchMarketingProfile();

      setHydratedExists(Boolean(profile.exists));
      setUpdatedAt(profile.updated_at);
      setForm(sliceFrom(profile));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "The marketing profile could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const sanitize = (blob: Record<string, string>) =>
    Object.fromEntries(Object.entries(blob).map(([key, val]) => [key, val.trim() === "" ? undefined : val.trim()]));

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);

    try {
      await patchMarketingProfile({
        identity: sanitize(form.identity),
        brand_voice: sanitize(form.brand_voice),
        publishing_preferences: sanitize(form.publishing_preferences),
        safety_preferences: sanitize(form.safety_preferences),
      });

      await loadProfile();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Marketing profile save failed.");
    } finally {
      setSaving(false);
    }
  }, [form, loadProfile]);

  const statusLine = useMemo(() => {
    if (hydratedExists === false) {
      return "No saved profile row yet. First save persists defaults for your active organization.";
    }

    return updatedAt ? `Last updated ${updatedAt}` : "Profile saved.";
  }, [hydratedExists, updatedAt]);

  return (
    <div className="space-y-6">
      {loadError ? (
        <div className="theme-alert-error rounded-[20px] border px-4 py-3 text-sm">{loadError}</div>
      ) : null}

      <p className="rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-3 text-xs leading-5 text-[color:var(--sem-text-muted)]">{statusLine}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className={fieldsetClassName}>
          <legend className={legendClassName}>Identity</legend>
          <div className="mt-4 space-y-4">
            <label className="block text-sm text-[color:var(--sem-text-secondary)]">
              <span className="font-medium text-[color:var(--sem-text-primary)]">Display name</span>
              <input
                className={inputClassName}
                value={form.identity.display_name}
                onChange={(evt) =>
                  setForm((prior) => ({
                    ...prior,
                    identity: { ...prior.identity, display_name: evt.target.value },
                  }))
                }
              />
            </label>
            <label className="block text-sm text-[color:var(--sem-text-secondary)]">
              <span className="font-medium text-[color:var(--sem-text-primary)]">Tagline</span>
              <input
                className={inputClassName}
                value={form.identity.tagline}
                onChange={(evt) =>
                  setForm((prior) => ({
                    ...prior,
                    identity: { ...prior.identity, tagline: evt.target.value },
                  }))
                }
              />
            </label>
            <label className="block text-sm text-[color:var(--sem-text-secondary)]">
              <span className="font-medium text-[color:var(--sem-text-primary)]">Service area notes</span>
              <textarea
                rows={3}
                className={[inputClassName, "min-h-[88px]"].join(" ")}
                value={form.identity.service_area_notes}
                onChange={(evt) =>
                  setForm((prior) => ({
                    ...prior,
                    identity: { ...prior.identity, service_area_notes: evt.target.value },
                  }))
                }
              />
            </label>
          </div>
        </fieldset>

        <fieldset className={fieldsetClassName}>
          <legend className={legendClassName}>Brand voice</legend>
          <div className="mt-4 space-y-4">
            <label className="block text-sm text-[color:var(--sem-text-secondary)]">
              <span className="font-medium text-[color:var(--sem-text-primary)]">Tone keywords</span>
              <textarea
                rows={2}
                className={[inputClassName, "min-h-[72px]"].join(" ")}
                value={form.brand_voice.tone_keywords}
                onChange={(evt) =>
                  setForm((prior) => ({
                    ...prior,
                    brand_voice: { ...prior.brand_voice, tone_keywords: evt.target.value },
                  }))
                }
              />
            </label>
            <label className="block text-sm text-[color:var(--sem-text-secondary)]">
              <span className="font-medium text-[color:var(--sem-text-primary)]">Formality</span>
              <input
                className={inputClassName}
                value={form.brand_voice.formality}
                onChange={(evt) =>
                  setForm((prior) => ({
                    ...prior,
                    brand_voice: { ...prior.brand_voice, formality: evt.target.value },
                  }))
                }
              />
            </label>
            <label className="block text-sm text-[color:var(--sem-text-secondary)]">
              <span className="font-medium text-[color:var(--sem-text-primary)]">Persona notes</span>
              <textarea
                rows={3}
                className={[inputClassName, "min-h-[88px]"].join(" ")}
                value={form.brand_voice.persona_notes}
                onChange={(evt) =>
                  setForm((prior) => ({
                    ...prior,
                    brand_voice: { ...prior.brand_voice, persona_notes: evt.target.value },
                  }))
                }
              />
            </label>
          </div>
        </fieldset>

        <fieldset className={fieldsetClassName}>
          <legend className={legendClassName}>Default CTAs</legend>
          <p className="mt-4 text-xs leading-5 text-[color:var(--sem-text-muted)]">
            Stored as publishing-adjacent preferences only. Outbound posting always requires an explicit publish job.
          </p>
          <div className="mt-4 space-y-4">
            <label className="block text-sm text-[color:var(--sem-text-secondary)]">
              <span className="font-medium text-[color:var(--sem-text-primary)]">Primary CTA pattern</span>
              <textarea
                rows={2}
                className={[inputClassName, "min-h-[72px]"].join(" ")}
                value={form.publishing_preferences.default_cta_primary}
                onChange={(evt) =>
                  setForm((prior) => ({
                    ...prior,
                    publishing_preferences: {
                      ...prior.publishing_preferences,
                      default_cta_primary: evt.target.value,
                    },
                  }))
                }
              />
            </label>
            <label className="block text-sm text-[color:var(--sem-text-secondary)]">
              <span className="font-medium text-[color:var(--sem-text-primary)]">Secondary CTA pattern</span>
              <textarea
                rows={2}
                className={[inputClassName, "min-h-[72px]"].join(" ")}
                value={form.publishing_preferences.default_cta_secondary}
                onChange={(evt) =>
                  setForm((prior) => ({
                    ...prior,
                    publishing_preferences: {
                      ...prior.publishing_preferences,
                      default_cta_secondary: evt.target.value,
                    },
                  }))
                }
              />
            </label>
            <label className="block text-sm text-[color:var(--sem-text-secondary)]">
              <span className="font-medium text-[color:var(--sem-text-primary)]">Link policy notes</span>
              <textarea
                rows={2}
                className={[inputClassName, "min-h-[72px]"].join(" ")}
                value={form.publishing_preferences.link_policy_notes}
                onChange={(evt) =>
                  setForm((prior) => ({
                    ...prior,
                    publishing_preferences: {
                      ...prior.publishing_preferences,
                      link_policy_notes: evt.target.value,
                    },
                  }))
                }
              />
            </label>
          </div>
        </fieldset>

        <fieldset className={fieldsetClassName}>
          <legend className={legendClassName}>Safety</legend>
          <div className="mt-4 space-y-4">
            <label className="block text-sm text-[color:var(--sem-text-secondary)]">
              <span className="font-medium text-[color:var(--sem-text-primary)]">Restricted terms list</span>
              <textarea
                rows={3}
                className={[inputClassName, "min-h-[88px]"].join(" ")}
                value={form.safety_preferences.restricted_terms_text}
                onChange={(evt) =>
                  setForm((prior) => ({
                    ...prior,
                    safety_preferences: {
                      ...prior.safety_preferences,
                      restricted_terms_text: evt.target.value,
                    },
                  }))
                }
              />
            </label>
            <label className="block text-sm text-[color:var(--sem-text-secondary)]">
              <span className="font-medium text-[color:var(--sem-text-primary)]">Disclaimer posture</span>
              <input
                className={inputClassName}
                value={form.safety_preferences.disclaimer_mode}
                onChange={(evt) =>
                  setForm((prior) => ({
                    ...prior,
                    safety_preferences: {
                      ...prior.safety_preferences,
                      disclaimer_mode: evt.target.value,
                    },
                  }))
                }
              />
            </label>
            <label className="block text-sm text-[color:var(--sem-text-secondary)]">
              <span className="font-medium text-[color:var(--sem-text-primary)]">Extra guidelines</span>
              <textarea
                rows={3}
                className={[inputClassName, "min-h-[88px]"].join(" ")}
                value={form.safety_preferences.extra_guidelines}
                onChange={(evt) =>
                  setForm((prior) => ({
                    ...prior,
                    safety_preferences: { ...prior.safety_preferences, extra_guidelines: evt.target.value },
                  }))
                }
              />
            </label>
          </div>
        </fieldset>
      </div>

      {saveError ? (
        <div className="theme-alert-error rounded-[20px] border px-4 py-3 text-sm">{saveError}</div>
      ) : null}

      <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
        <button
          type="button"
          disabled={Boolean(loadError) || saving}
          onClick={() => void loadProfile()}
          className="theme-control-surface-soft rounded-[18px] border px-5 py-2.5 text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)]"
        >
          Reset
        </button>
        <button
          type="button"
          disabled={Boolean(loadError) || saving}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 rounded-[18px] border border-transparent bg-[color:var(--sem-accent-primary)] px-5 py-2.5 text-sm font-semibold text-[color:var(--sem-text-inverse)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}
