"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  disconnectMarketingChannel,
  fetchMarketingChannels,
  reconnectMarketingChannel,
  selectMarketingGoogleLocation,
  selectMarketingMetaPage,
  startMarketingGoogleOAuth,
  startMarketingMetaOAuth,
  type MarketingChannelsApiPayload,
} from "@/lib/marketing/client-marketing";

type MarketingChannelsPanelProps = {
  capabilities?: {
    can_manage_channels: boolean;
  };
};

const LABELS: Record<string, string> = {
  google_business: "Google Business Profile",
  facebook: "Facebook",
  instagram: "Instagram",
};

export function MarketingChannelsPanel({ capabilities }: MarketingChannelsPanelProps) {
  const [channelsPayload, setChannelsPayload] = useState<MarketingChannelsApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [oauthBanner, setOauthBanner] = useState<string | null>(null);

  const [selectedGoogleLocation, setSelectedGoogleLocation] = useState("");
  const [selectedMetaPage, setSelectedMetaPage] = useState("");

  const canManage = Boolean(capabilities?.can_manage_channels);

  const refresh = useCallback(async () => {
    setError(null);

    try {
      const data = await fetchMarketingChannels();

      setChannelsPayload(data);
    } catch (err) {
      setChannelsPayload(null);
      setError(err instanceof Error ? err.message : "Channels could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("oauth_error");
    const oauthSuccess = params.get("oauth_success");

    if (oauthError) {
      setOauthBanner(`OAuth paused (${oauthError}). Confirm environment variables and provider apps, then try again.`);
    } else if (oauthSuccess) {
      setOauthBanner(`OAuth step completed for ${oauthSuccess}. Finish any pending selections below.`);
    }
  }, []);

  const googleCard = useMemo(
    () => channelsPayload?.channels.find((card) => card.channel_key === "google_business"),
    [channelsPayload],
  );

  const facebookCard = useMemo(
    () => channelsPayload?.channels.find((card) => card.channel_key === "facebook"),
    [channelsPayload],
  );

  const instagramCard = useMemo(
    () => channelsPayload?.channels.find((card) => card.channel_key === "instagram"),
    [channelsPayload],
  );

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);

    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That channel action could not finish.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {oauthBanner ? (
        <div className="rounded-[20px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-hover-surface)] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
          {oauthBanner}
        </div>
      ) : null}

      {error ? <div className="theme-alert-error rounded-[20px] border px-4 py-3 text-sm">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {[googleCard, facebookCard].map((card) => {
          if (!card) {
            return null;
          }

          const label = LABELS[card.channel_key] ?? card.channel_key;

          return (
            <div
              key={card.channel_key}
              className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{label}</p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--sem-text-primary)]">
                    {card.connection_status === "connected" ? "Connected" : card.pending_selection ? "Needs selection" : "Disconnected"}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-muted)]">
                    {card.account_label ? `Target: ${card.account_label}` : "No marketing target selected yet."}
                  </p>
                </div>

                {canManage ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={busyKey === `${card.channel_key}-oauth`}
                      onClick={() =>
                        void runAction(`${card.channel_key}-oauth`, async () => {
                          const starter =
                            card.channel_key === "google_business"
                              ? await startMarketingGoogleOAuth()
                              : await startMarketingMetaOAuth();

                          window.location.href = starter.url;
                        })
                      }
                      className="rounded-[14px] border border-transparent bg-[color:var(--sem-accent-primary)] px-3 py-2 text-[11px] font-semibold text-[color:var(--sem-text-inverse)] disabled:opacity-50"
                    >
                      {busyKey === `${card.channel_key}-oauth` ? "Starting…" : "Connect"}
                    </button>

                    {card.channel_row_id ? (
                      <>
                        <button
                          type="button"
                          disabled={busyKey === `${card.channel_key}-disc`}
                          onClick={() =>
                            void runAction(`${card.channel_key}-disc`, async () => {
                              await disconnectMarketingChannel(card.channel_row_id as string);
                            })
                          }
                          className="theme-control-surface-soft rounded-[14px] border px-3 py-2 text-[11px] font-semibold disabled:opacity-50"
                        >
                          Disconnect
                        </button>
                        <button
                          type="button"
                          disabled={busyKey === `${card.channel_key}-reco`}
                          onClick={() =>
                            void runAction(`${card.channel_key}-reco`, async () => {
                              const next = await reconnectMarketingChannel(card.channel_row_id as string);

                              window.location.href = next.url;
                            })
                          }
                          className="theme-control-surface-soft rounded-[14px] border px-3 py-2 text-[11px] font-semibold disabled:opacity-50"
                        >
                          Reconnect
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[11px] text-[color:var(--sem-text-muted)]">Owners or admins manage OAuth connections.</p>
                )}
              </div>

              {canManage && card.channel_key === "google_business" && card.pending_google_locations?.length ? (
                <div className="mt-4 space-y-2 border-t border-[color:var(--cmp-border-subtle)] pt-4">
                  <label className="block text-xs text-[color:var(--sem-text-secondary)]">
                    Choose Google location
                    <select
                      className="mt-1 w-full rounded-[14px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
                      value={selectedGoogleLocation}
                      onChange={(evt) => setSelectedGoogleLocation(evt.target.value)}
                    >
                      <option value="">Select…</option>
                      {card.pending_google_locations.map((loc) => (
                        <option key={loc.resourceName} value={loc.resourceName}>
                          {loc.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!selectedGoogleLocation || busyKey === "google-select"}
                    onClick={() =>
                      void runAction("google-select", async () => {
                        await selectMarketingGoogleLocation(selectedGoogleLocation);
                      })
                    }
                    className="rounded-[14px] border border-transparent bg-[color:var(--sem-accent-primary)] px-3 py-2 text-[11px] font-semibold text-[color:var(--sem-text-inverse)] disabled:opacity-40"
                  >
                    Save Google location
                  </button>
                </div>
              ) : null}

              {canManage && card.channel_key === "facebook" && card.pending_meta_pages?.length ? (
                <div className="mt-4 space-y-2 border-t border-[color:var(--cmp-border-subtle)] pt-4">
                  <label className="block text-xs text-[color:var(--sem-text-secondary)]">
                    Choose Facebook Page
                    <select
                      className="mt-1 w-full rounded-[14px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
                      value={selectedMetaPage}
                      onChange={(evt) => setSelectedMetaPage(evt.target.value)}
                    >
                      <option value="">Select…</option>
                      {card.pending_meta_pages.map((page) => (
                        <option key={page.id} value={page.id}>
                          {page.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!selectedMetaPage || busyKey === "meta-select"}
                    onClick={() =>
                      void runAction("meta-select", async () => {
                        await selectMarketingMetaPage(selectedMetaPage);
                      })
                    }
                    className="rounded-[14px] border border-transparent bg-[color:var(--sem-accent-primary)] px-3 py-2 text-[11px] font-semibold text-[color:var(--sem-text-inverse)] disabled:opacity-40"
                  >
                    Save Facebook Page
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {instagramCard ? (
        <div className="theme-surface-card rounded-[24px] border border-dashed border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{LABELS.instagram}</p>
          <p className="mt-2 text-lg font-semibold text-[color:var(--sem-text-primary)]">Coming soon · V1.5</p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            {instagramCard.headline
              ?? "Instagram variants remain editable for copy coordination, but outbound IG publishing waits for the dedicated V1.5 milestone."}
          </p>
        </div>
      ) : null}

      {!channelsPayload ? (
        <p className="text-sm text-[color:var(--sem-text-muted)]">{error ? "" : "Loading channel summaries…"}</p>
      ) : null}
    </div>
  );
}
